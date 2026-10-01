import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/design/haptics';
import { durations, fade, springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, space, withAlpha } from '@/design/tokens';
import { useNotices, type NoticeAction, type NoticeTone } from '@/lib/notice';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { rubberBand } from './sheet/sheetMath';
import { Text } from './Text';
import { overflowNotices, reconcileToasts, stackOffsets, TOAST_ESTIMATED_HEIGHT, type ToastItem } from './toastStack';

/** A swipe up this far (or this fast, in dp/s) dismisses the toast. */
const SWIPE_DISTANCE = 24;
const SWIPE_VELOCITY = 500;
/** Pulling down only gives this much. */
const PULL_LIMIT = 24;
const MAX_WIDTH = 560;

const FADE_IN = { ...fade(durations.fast), reduceMotion: ReduceMotion.Never };
const FADE_OUT = { ...fade(durations.fast), reduceMotion: ReduceMotion.Never };
/** Leaving accelerates away (emphasized accelerate). */
const EXIT = { duration: durations.base, easing: Easing.bezier(0.3, 0, 0.8, 0.15) };

/* ---------- ToastCard ---------- */

export type ToastCardProps = {
  tone: NoticeTone;
  message: string;
  action?: NoticeAction;
  /** Runs after the action's own onPress (the stack dismisses the toast here). */
  onAction?: () => void;
  /** TalkBack "Dismiss" action on the message. */
  onDismiss?: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
};

/**
 * The toast surface: ok has a gold edge and a check, err a signal edge and an
 * alert icon (never colour alone). Exported for the Kit screen; the app shows
 * toasts through notice.ok() / notice.err() and the ToastHost.
 */
export function ToastCard({ tone, message, action, onAction, onDismiss, onLayout }: ToastCardProps) {
  const { colors, isDark } = useTheme();
  const ok = tone === 'ok';

  const onMessageAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'dismiss') onDismiss?.();
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: ok ? colors.gold : colors.signal,
          boxShadow: [
            { offsetX: 0, offsetY: 10, blurRadius: 28, color: withAlpha(colors.shadow, isDark ? 0.5 : 0.14) },
            { offsetX: 0, offsetY: 1, blurRadius: 3, color: withAlpha(colors.shadow, isDark ? 0.4 : 0.06) },
          ],
        },
      ]}
    >
      <View
        style={styles.message}
        accessible
        accessibilityLabel={message}
        accessibilityActions={onDismiss ? [{ name: 'dismiss', label: 'Dismiss' }] : undefined}
        onAccessibilityAction={onMessageAction}
      >
        <Icon icon={ok ? CircleCheck : CircleAlert} size={20} color={ok ? 'gold' : 'signal'} strokeWidth={2} />
        <Text variant="body" style={styles.text} numberOfLines={4}>
          {message}
        </Text>
      </View>
      {action ? (
        <PressableScale
          onPress={() => {
            action.onPress();
            onAction?.();
          }}
          accessibilityLabel={action.label}
          hitSlop={8}
          style={styles.action}
        >
          <Text variant="bodyStrong" tone="gold" numberOfLines={1}>
            {action.label}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/* ---------- one animated toast ---------- */

type AnimatedToastProps = {
  item: ToastItem;
  /** Distance from the top of the stack; undefined while leaving. */
  offset: number | undefined;
  topInset: number;
  onDismiss: (id: number) => void;
  onExited: (id: number) => void;
  onMeasure: (id: number, height: number) => void;
};

const AnimatedToast = memo(function AnimatedToast({ item, offset, topInset, onDismiss, onExited, onMeasure }: AnimatedToastProps) {
  const { notice, leaving } = item;
  const { id, tone, message, action } = notice;
  const reduceMotion = useReduceMotion();

  const slide = useSharedValue(reduceMotion ? 0 : -(topInset + 2 * TOAST_ESTIMATED_HEIGHT + (offset ?? 0)));
  const opacity = useSharedValue(0);
  const stackY = useSharedValue(offset ?? 0);
  const drag = useSharedValue(0);
  const [touched, setTouched] = useState(false);
  const last = useRef({ offset: offset ?? 0, height: TOAST_ESTIMATED_HEIGHT });

  // Shown: slide down under the status bar, with the haptic and the TalkBack announcement. Once, on mount.
  const onShown = useEffectEvent(() => {
    if (tone === 'ok') haptics.success();
    else haptics.error();
    AccessibilityInfo.announceForAccessibility(message);
    opacity.set(withTiming(1, FADE_IN));
    if (!reduceMotion) slide.set(withSpring(0, springs.default));
  });
  useEffect(() => {
    onShown();
  }, []);

  // Pushed down (or back up) as newer toasts arrive and leave.
  useEffect(() => {
    if (leaving || offset == null) return;
    last.current.offset = offset;
    stackY.set(reduceMotion ? offset : withSpring(offset, springs.default));
  }, [leaving, offset, reduceMotion, stackY]);

  // Leaving: runs once when `leaving` turns on, with the latest inset and callbacks.
  const onLeave = useEffectEvent(() => {
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(onExited, id);
    };
    if (reduceMotion) {
      opacity.set(withTiming(0, FADE_OUT, done));
      return;
    }
    slide.set(withTiming(-(topInset + last.current.offset + last.current.height + 2 * space[4]), EXIT));
    opacity.set(withTiming(0, EXIT, done));
  });
  useEffect(() => {
    if (leaving) onLeave();
  }, [leaving]);

  // Auto-dismiss, honouring Android's "Time to take action" setting; paused while touched.
  useEffect(() => {
    if (leaving || touched) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const base = notice.duration ?? durations.toast;
    const start = (ms: number) => {
      if (!cancelled) timer = setTimeout(() => onDismiss(id), ms);
    };
    AccessibilityInfo.getRecommendedTimeoutMillis(base)
      .then((ms) => start(Math.max(base, ms)))
      .catch(() => start(base));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [leaving, touched, notice.duration, id, onDismiss]);

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .failOffsetX([-20, 20])
        .onBegin(() => {
          'worklet';
          scheduleOnRN(setTouched, true);
        })
        .onUpdate((e) => {
          'worklet';
          drag.set(e.translationY < 0 ? e.translationY : rubberBand(e.translationY, PULL_LIMIT));
        })
        .onEnd((e) => {
          'worklet';
          if (drag.get() < -SWIPE_DISTANCE || e.velocityY < -SWIPE_VELOCITY) scheduleOnRN(onDismiss, id);
          else drag.set(withSpring(0, springs.snappy));
        })
        .onFinalize(() => {
          'worklet';
          scheduleOnRN(setTouched, false);
        }),
    [drag, id, onDismiss],
  );

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: stackY.get() + slide.get() + drag.get() }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    last.current.height = height;
    onMeasure(id, height);
  };

  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'box-none'}
      style={[styles.row, { top: topInset + space[2] }, style]}
    >
      <GestureDetector gesture={swipe}>
        <View style={styles.cardSlot}>
          <ToastCard
            tone={tone}
            message={message}
            action={action}
            onAction={() => onDismiss(id)}
            onDismiss={() => onDismiss(id)}
            onLayout={onLayout}
          />
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

/* ---------- the stack ---------- */

/**
 * Renders the notice queue (src/lib/notice.ts): newest on top, at most two on
 * screen, older ones pushed down under it. Mounted by the ToastHost (or by the
 * SheetProvider, so toasts sit above open sheets).
 */
export function ToastStack() {
  const queue = useNotices((s) => s.queue);
  const dismiss = useNotices((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  const [state, setState] = useState(() => ({ queue, items: reconcileToasts([], queue) }));
  if (state.queue !== queue) setState({ queue, items: reconcileToasts(state.items, queue) });

  const [heights, setHeights] = useState<Readonly<Record<number, number>>>({});

  // Pushed out of the visible two: dismiss for good so it never comes back stale.
  useEffect(() => {
    overflowNotices(queue).forEach((n) => dismiss(n.id));
  }, [queue, dismiss]);

  const onExited = useCallback((id: number) => {
    setState((s) => ({ ...s, items: s.items.filter((i) => !(i.leaving && i.notice.id === id)) }));
    setHeights((h) => {
      if (!(id in h)) return h;
      const next = { ...h };
      delete next[id];
      return next;
    });
  }, []);

  const onMeasure = useCallback((id: number, height: number) => {
    setHeights((h) => (h[id] === height ? h : { ...h, [id]: height }));
  }, []);

  if (state.items.length === 0) return null;
  const offsets = stackOffsets(state.items, heights);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Oldest first in the tree, so the newest draws on top while they overlap. */}
      {[...state.items].reverse().map((item) => (
        <AnimatedToast
          key={item.notice.id}
          item={item}
          offset={item.leaving ? undefined : offsets.get(item.notice.id)}
          topInset={insets.top}
          onDismiss={dismiss}
          onExited={onExited}
          onMeasure={onMeasure}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: layout.gutter,
  },
  cardSlot: { width: '100%', maxWidth: MAX_WIDTH },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 52,
    paddingLeft: space[4],
    paddingRight: space[2],
    paddingVertical: space[2],
    borderRadius: radius.card,
    borderWidth: 1,
  },
  message: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[1],
    paddingRight: space[2],
  },
  text: { flex: 1 },
  action: {
    minHeight: 36,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
