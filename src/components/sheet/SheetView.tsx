import { memo, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Keyboard,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type Text as RNText,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useKeyboardContext } from 'react-native-keyboard-controller';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  scrollTo,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { durations, fade, springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';

import { PressableScale } from '../PressableScale';
import { SubmitGroup, useSubmitGroup, useSubmitGroupHandle } from '../SubmitGroup';
import { Text } from '../Text';
import { limitDrag, maxSheetHeight, settleDrag, SHEET_TOP_GAP, snapHeights, snapOffsets } from './sheetMath';
import type { SheetEntry, SheetStore } from './sheetStore';

/** How far the sheet gives when pulled past a limit (above the top, or below the bottom when it cannot close). */
const RUBBER_LIMIT = 56;
/** Surface drawn below the sheet so a spring overshoot never shows a gap at the bottom edge. */
const SKIRT = 240;
/** Extra travel below the screen when closing, so the top edge (and its border) leaves fully. */
const CLOSE_EXTRA = 32;
/** Release velocities are capped so a hard fling cannot throw the sheet past the status bar. */
const MAX_SETTLE_VELOCITY = 2400;
/** A scroll offset at or below this counts as "at the top" for handing the drag to the sheet. */
const AT_TOP = 0.5;
/**
 * After a drag-to-close lands, how long the owner gets to act on onClose before
 * the sheet comes back. A busy JS thread (a heavy re-render) can still be on its
 * way to closing it when the spring settles.
 */
const OWNER_GRACE_MS = 300;

const FADE_IN = { ...fade(durations.base), reduceMotion: ReduceMotion.Never };
const FADE_OUT = { ...fade(durations.fast), reduceMotion: ReduceMotion.Never };

export type SheetViewProps = {
  entry: SheetEntry;
  store: SheetStore;
  /** Height of the root layer (the whole window in edge to edge). */
  layerHeight: number;
  /** Only the topmost open sheet is reachable by TalkBack. */
  isTop: boolean;
};

/**
 * One sheet in the root layer: scrim, surface, gestures, keyboard lift.
 *
 * Positions follow sheetMath: `position` is the translateY from the tallest
 * resting place (0), larger is lower. The keyboard lifts the whole sheet on top
 * of that, and shrinks its height so the top edge never leaves the screen; the
 * scroll view then keeps the focused input in view on its own (Android scrolls
 * a focused child back into view when its viewport shrinks).
 */
export const SheetView = memo(function SheetView({ entry, store, layerHeight, isTop }: SheetViewProps) {
  const { id, props, closing } = entry;
  const { title, subtitle, snapPoints = 'content', scrollable = false, footer, children, testID } = props;
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const keyboard = useKeyboardContext().reanimated;

  // Each sheet is its own submit group; while one of its buttons runs, nothing dismisses it.
  const group = useSubmitGroupHandle();
  const { busy } = useSubmitGroup(group);
  const dismissible = (props.dismissible ?? true) && !busy;

  const maxHeight = maxSheetHeight(layerHeight, insets.top);
  const heights = snapPoints === 'content' ? null : snapHeights(snapPoints, layerHeight, maxHeight);
  const fixedHeight = heights ? heights[heights.length - 1] : null;
  const offsetsKey = (heights ? snapOffsets(heights) : [0]).join(',');

  const position = useSharedValue(layerHeight);
  const sheetHeight = useSharedValue(0);
  const sheetOpacity = useSharedValue(0);
  const visibility = useSharedValue(0);
  const offsets = useSharedValue<number[]>(offsetsKey.split(',').map(Number));
  const snapIndex = useSharedValue(0);
  const canDismiss = useSharedValue(dismissible);
  const reduced = useSharedValue(reduceMotion);
  const bottomInset = useSharedValue(insets.bottom);
  const ownerClosing = useSharedValue(false);
  const dismissing = useSharedValue(false);
  const dragging = useSharedValue(false);
  const raw = useSharedValue(0);
  const moved = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const lockY = useSharedValue(0);
  const locked = useSharedValue(false);

  useEffect(() => canDismiss.set(dismissible), [canDismiss, dismissible]);
  useEffect(() => reduced.set(reduceMotion), [reduced, reduceMotion]);
  useEffect(() => bottomInset.set(insets.bottom), [bottomInset, insets.bottom]);

  // The latest close request is registered with the store on every render, so the
  // gestures (built once) always reach the current onClose and dismissible.
  const requestClose = () => {
    if (dismissible) props.onClose();
  };
  useEffect(() => {
    store.setDismisser(id, requestClose);
    return () => store.setDismisser(id, null);
  });
  const dismissSelf = useCallback(() => store.dismiss(id), [store, id]);
  const remove = useCallback(() => store.remove(id), [store, id]);

  /* ---------- motion (UI thread) ---------- */

  const lift = () => {
    'worklet';
    return Math.max(0, -keyboard.height.get() - bottomInset.get());
  };

  const settleTo = (index: number, velocity: number, delay = 0) => {
    'worklet';
    const o = offsets.get();
    const i = Math.max(0, Math.min(index, o.length - 1));
    snapIndex.set(i);
    const spring = withSpring(o[i] ?? 0, { ...springs.default, velocity }, () => {
      'worklet';
      locked.set(false);
    });
    position.set(delay > 0 ? withDelay(delay, spring, ReduceMotion.Never) : spring);
  };

  const animateIn = (fromBelow: boolean) => {
    'worklet';
    const o = offsets.get();
    const rest = o.length - 1;
    visibility.set(withTiming(1, FADE_IN));
    if (reduced.get()) {
      snapIndex.set(rest);
      position.set(o[rest] ?? 0);
      sheetOpacity.set(withTiming(1, FADE_IN));
      return;
    }
    sheetOpacity.set(1);
    if (fromBelow) position.set(sheetHeight.get() + lift() + CLOSE_EXTRA);
    settleTo(rest, 0);
  };

  const animateOut = (velocity: number) => {
    'worklet';
    dismissing.set(true);
    dragging.set(false);
    visibility.set(withTiming(0, FADE_OUT));
    const finish = (finished?: boolean) => {
      'worklet';
      if (!finished) return;
      if (ownerClosing.get()) {
        scheduleOnRN(remove);
        return;
      }
      // The owner ignored onClose and kept the sheet: bring it back, after a grace
      // period. If the close request arrives meanwhile, onOwnerClosed takes over.
      dismissing.set(false);
      visibility.set(withDelay(OWNER_GRACE_MS, withTiming(1, FADE_IN), ReduceMotion.Never));
      sheetOpacity.set(withDelay(OWNER_GRACE_MS, withTiming(1, FADE_IN), ReduceMotion.Never));
      settleTo(snapIndex.get(), 0, OWNER_GRACE_MS);
    };
    if (reduced.get()) {
      sheetOpacity.set(withTiming(0, FADE_OUT, finish));
      return;
    }
    const target = sheetHeight.get() + lift() + CLOSE_EXTRA;
    position.set(withSpring(target, { ...springs.default, velocity: Math.max(0, velocity), overshootClamping: true }, finish));
  };

  const onFirstLayout = (height: number) => {
    'worklet';
    sheetHeight.set(height);
    animateIn(true);
  };

  const onOwnerClosed = () => {
    'worklet';
    ownerClosing.set(true);
    // A drag that already decided to close keeps its own animation (and its velocity).
    if (!dismissing.get()) animateOut(0);
  };

  const onOwnerReopened = () => {
    'worklet';
    ownerClosing.set(false);
    dismissing.set(false);
    cancelAnimation(position);
    animateIn(false);
  };

  const onSnapPointsChanged = (next: number[]) => {
    'worklet';
    offsets.set(next);
    if (dragging.get() || dismissing.get() || sheetHeight.get() === 0) return;
    settleTo(snapIndex.get(), 0);
  };

  /* ---------- lifecycle ---------- */

  const opened = useRef(false);
  const wasClosing = useRef(false);
  const titleRef = useRef<RNText>(null);

  // Effect events: they always hand the UI thread the current worklets, yet only a
  // change of the snap points or of `closing` runs them.
  const snapPointsChanged = useEffectEvent((key: string) => scheduleOnUI(onSnapPointsChanged, key.split(',').map(Number)));
  const ownerClosed = useEffectEvent(() => scheduleOnUI(onOwnerClosed));
  const ownerReopened = useEffectEvent(() => scheduleOnUI(onOwnerReopened));

  useEffect(() => {
    snapPointsChanged(offsetsKey);
  }, [offsetsKey]);

  useEffect(() => {
    if (closing) {
      wasClosing.current = true;
      if (!opened.current) {
        remove();
        return;
      }
      Keyboard.dismiss();
      ownerClosed();
    } else if (wasClosing.current) {
      wasClosing.current = false;
      ownerReopened();
    }
  }, [closing, remove]);

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    if (opened.current) {
      sheetHeight.set(height);
      return;
    }
    if (height <= 0 || closing) return;
    opened.current = true;
    scheduleOnUI(onFirstLayout, height);
    if (isTop && title) {
      // TalkBack starts on the title, so the sheet announces what it is for.
      setTimeout(() => {
        const tag = titleRef.current ? findNodeHandle(titleRef.current) : null;
        if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
      }, 150);
    }
  };

  // When the keyboard comes up over a sheet resting on a lower snap point, open it fully.
  useAnimatedReaction(
    () => keyboard.progress.get() > 0.05,
    (shown, was) => {
      if (!shown || was !== false) return;
      if (offsets.get().length < 2 || snapIndex.get() === 0 || dragging.get() || dismissing.get()) return;
      settleTo(0, 0);
    },
  );

  /* ---------- gestures ---------- */

  const beginDrag = () => {
    'worklet';
    if (dismissing.get() || ownerClosing.get()) return;
    cancelAnimation(position);
    dragging.set(true);
    moved.set(false);
    raw.set(position.get());
  };

  const endDrag = (velocityY: number) => {
    'worklet';
    if (!dragging.get()) return;
    dragging.set(false);
    const v = Math.max(-MAX_SETTLE_VELOCITY, Math.min(MAX_SETTLE_VELOCITY, velocityY));
    const result = settleDrag(position.get(), v, offsets.get(), sheetHeight.get(), canDismiss.get());
    if (result.close) {
      scheduleOnRN(dismissSelf);
      animateOut(v);
      return;
    }
    settleTo(result.index, v);
  };

  const gestures = useSheetGestures({
    position,
    raw,
    moved,
    dragging,
    offsets,
    canDismiss,
    scrollY,
    lockY,
    locked,
    beginDrag,
    endDrag,
  });

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (locked.get()) {
        scrollTo(scrollRef, 0, lockY.get(), false);
        return;
      }
      scrollY.set(e.contentOffset.y);
    },
  });

  /* ---------- styles ---------- */

  const sheetStyle = useAnimatedStyle(() => {
    const l = lift();
    const room = Math.max(0, layerHeight - insets.top - SHEET_TOP_GAP - l);
    return {
      opacity: sheetOpacity.get(),
      transform: [{ translateY: position.get() - l }],
      ...(fixedHeight == null ? { maxHeight: Math.min(maxHeight, room) } : { height: Math.min(fixedHeight, room) }),
    };
  });

  // The footer stays on the visible bottom edge between snap points, and leaves with the sheet below them.
  const footerStyle = useAnimatedStyle(() => {
    const o = offsets.get();
    const lowest = o[o.length - 1] ?? 0;
    return { transform: [{ translateY: -Math.min(Math.max(position.get(), 0), lowest) }] };
  });

  // The scrim fades in on its own clock and thins out as the sheet is dragged down.
  const scrimStyle = useAnimatedStyle(() => {
    const o = offsets.get();
    const lowest = o[o.length - 1] ?? 0;
    const travel = Math.max(1, sheetHeight.get() - lowest);
    const pulled = Math.min(1, Math.max(0, (position.get() - lowest) / travel));
    return { opacity: visibility.get() * (1 - pulled) };
  });

  /* ---------- render ---------- */

  const onHandleAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'activate') dismissSelf();
  };

  const header = (
    <View style={[styles.header, title || subtitle ? null : styles.headerBare]}>
      {title || subtitle ? (
        <View style={styles.titles}>
          {title ? (
            <Text ref={titleRef} variant="headlineSmall" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="body" color="ink3">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {/* After the titles in the tree so TalkBack reads the title first; drawn on top. */}
      <View
        style={styles.handleArea}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityState={{ disabled: !dismissible }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onHandleAction}
      >
        <View style={[styles.handle, { backgroundColor: colors.ink5 }]} />
      </View>
    </View>
  );

  const bodyPadding = { paddingHorizontal: layout.gutter, paddingBottom: footer ? space[2] : space[4] };
  const sized = fixedHeight == null ? styles.shrink : styles.fill;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={closing ? 'none' : 'box-none'}
      importantForAccessibility={isTop ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrimStyle]}>
        <PressableScale
          style={styles.fill}
          pressedScale={1}
          haptic={false}
          onPress={dismissSelf}
          accessible={false}
          importantForAccessibility="no"
        />
      </Animated.View>
      <Animated.View
        testID={testID}
        accessibilityViewIsModal
        onLayout={onSheetLayout}
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom },
          isDark ? [styles.sheetEdge, { borderColor: colors.line }] : null,
          sheetStyle,
        ]}
      >
        <View pointerEvents="none" style={[styles.skirt, { backgroundColor: colors.surface }]} />
        <SubmitGroup group={group}>
          {scrollable ? (
            <>
              <GestureDetector gesture={gestures.header}>{header}</GestureDetector>
              <GestureDetector gesture={gestures.scroll}>
                <Animated.ScrollView
                  ref={scrollRef}
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                  style={sized}
                  contentContainerStyle={bodyPadding}
                  keyboardShouldPersistTaps="handled"
                  overScrollMode="never"
                  bounces={false}
                  nestedScrollEnabled
                >
                  {children}
                </Animated.ScrollView>
              </GestureDetector>
            </>
          ) : (
            <GestureDetector gesture={gestures.body}>
              <View style={sized}>
                {header}
                <View style={[styles.body, bodyPadding, fixedHeight == null ? null : styles.fill]}>{children}</View>
              </View>
            </GestureDetector>
          )}
          {footer ? (
            <Animated.View
              style={[
                styles.footer,
                { backgroundColor: colors.surface },
                scrollable ? { borderTopColor: colors.lineSoft, borderTopWidth: 1 } : null,
                footerStyle,
              ]}
            >
              {footer}
            </Animated.View>
          ) : null}
        </SubmitGroup>
      </Animated.View>
    </View>
  );
});

type DragContext = {
  position: SharedValue<number>;
  raw: SharedValue<number>;
  moved: SharedValue<boolean>;
  dragging: SharedValue<boolean>;
  offsets: SharedValue<number[]>;
  canDismiss: SharedValue<boolean>;
  scrollY: SharedValue<number>;
  lockY: SharedValue<number>;
  locked: SharedValue<boolean>;
  beginDrag: () => void;
  endDrag: (velocityY: number) => void;
};

/**
 * The sheet's gestures, built once per sheet. Everything they read is a shared
 * value or a worklet over shared values, so they never need rebuilding (a
 * rebuild re-sends their config to the native side, on every keystroke of a
 * form inside the sheet).
 */
function useSheetGestures(context: DragContext) {
  const [gestures] = useState(() => buildSheetGestures(context));
  return gestures;
}

function buildSheetGestures({
  position,
  raw,
  moved,
  dragging,
  offsets,
  canDismiss,
  scrollY,
  lockY,
  locked,
  beginDrag,
  endDrag,
}: DragContext) {
  // Handle and header (and the whole body when it does not scroll): the sheet follows the finger.
  const freeDrag = () =>
    Gesture.Pan()
      .activeOffsetY([-6, 6])
      .failOffsetX([-24, 24])
      .onStart(() => {
        'worklet';
        beginDrag();
      })
      .onUpdate((e) => {
        'worklet';
        if (!dragging.get()) return;
        position.set(limitDrag(raw.get() + e.translationY, offsets.get(), canDismiss.get(), true, RUBBER_LIMIT));
      })
      .onEnd((e) => {
        'worklet';
        endDrag(e.velocityY);
      })
      .onFinalize(() => {
        'worklet';
        endDrag(0);
      });

  // Scrollable body: pulling down at the top of the list moves the sheet, pushing
  // up on a lower snap point expands it first; otherwise the list scrolls. While
  // the sheet moves, the list is pinned where it was.
  const native = Gesture.Native();
  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .failOffsetX([-24, 24])
    .onStart(() => {
      'worklet';
      beginDrag();
    })
    .onChange((e) => {
      'worklet';
      if (!dragging.get()) return;
      const o = offsets.get();
      const top = o[0] ?? 0;
      const dy = e.changeY;
      const current = raw.get();
      let next = current;
      if (dy > 0 && (locked.get() || scrollY.get() <= AT_TOP)) next = current + dy;
      else if (dy < 0 && current > top) next = Math.max(top, current + dy);
      if (next === current) return;
      if (!locked.get()) lockY.set(scrollY.get());
      moved.set(true);
      raw.set(next);
      locked.set(next > top);
      position.set(limitDrag(next, o, canDismiss.get(), false, RUBBER_LIMIT));
    })
    .onEnd((e) => {
      'worklet';
      if (!dragging.get()) return;
      if (!moved.get()) {
        // Only the list moved: the sheet is still on its snap point.
        dragging.set(false);
        return;
      }
      endDrag(e.velocityY);
    })
    .onFinalize(() => {
      'worklet';
      endDrag(0);
    });

  return { header: freeDrag(), body: freeDrag(), scroll: Gesture.Simultaneous(pan, native) };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexGrow: 0, flexShrink: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  // Dark mode: a hairline edge keeps the surface apart from the scrim.
  sheetEdge: { borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1 },
  skirt: { position: 'absolute', left: 0, right: 0, top: '100%', height: SKIRT },
  header: { paddingTop: 28, paddingBottom: space[3], paddingHorizontal: layout.gutter },
  headerBare: { paddingBottom: 0 },
  titles: { gap: space[1] },
  handleArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: { width: 36, height: 4, borderRadius: 2 },
  body: { overflow: 'hidden', flexShrink: 1 },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space[3], paddingBottom: space[3] },
});
