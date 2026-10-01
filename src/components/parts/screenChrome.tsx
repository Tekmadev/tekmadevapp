import type { QueryKey } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { useLatestCallback } from '@/lib/useLatestCallback';
import { PullToRefreshIndicator } from '@/loader/PullToRefreshIndicator';

import { Header } from '../Header';
import { useIsInTabs, useTabBarInset } from '../TabBar';
import { Text } from '../Text';
import { clamp, PULL_TRIGGER, pullDistance } from './logic';
import { ScrollGestureContext, type ScrollGestureValue } from './ScrollGesture';

/**
 * The moving parts Screen and ScreenList share: scroll tracking, the large
 * title that collapses into the header, the custom pull to refresh, and the
 * bottom padding that clears the floating tab bar.
 */

/** Props shared by Screen (ScrollView body) and ScreenList (FlashList body). */
export type ScreenChromeProps = {
  title?: string;
  /** Mono eyebrow above the large title ("WEDNESDAY, SEPTEMBER 30"). */
  eyebrow?: string;
  subtitle?: string;
  /** Large 34sp title in the content that collapses into the header (default true). */
  largeTitle?: boolean;
  /** Back button in the header (router.back(), or Home when there is no history). */
  back?: boolean;
  onBack?: () => void;
  headerLeft?: ReactNode;
  /** Header actions (search, overflow, avatar). */
  headerRight?: ReactNode;
  /** Pull to refresh with the black hole. The indicator beats until the promise settles. */
  onRefresh?: () => Promise<unknown>;
  /** Background refetch with data on screen: the gold hairline under the header. */
  refetching?: boolean;
  /** Show the offline banner under the title when offline (default true). */
  offlineBanner?: boolean;
  /** Time the data on screen was loaded, for the offline banner. */
  updatedAt?: number | string | Date | null;
  /** Or: read that time from this query in the cache. */
  queryKey?: QueryKey;
  /** Pad the bottom so content clears the floating tab bar (default: true inside tabs). */
  tabBarInset?: boolean;
  /** Receives the scroll offset on the UI thread (section tabs, custom headers). */
  scrollY?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Imperative scrolling for Screen and ScreenList (`ref` prop). */
export type ScreenHandle = {
  scrollTo: (y: number, animated?: boolean) => void;
  scrollToTop: (animated?: boolean) => void;
};

/* ---------- scroll ---------- */

/** Scroll offset on the UI thread, optionally mirrored into a caller's shared value. */
export function useScrollTracking(external?: SharedValue<number>) {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.set(event.contentOffset.y);
      external?.set(event.contentOffset.y);
    },
  });
  return { scrollY, onScroll };
}

/* ---------- bottom inset ---------- */

/** Bottom padding for scroll content: clears the floating tab bar on tab screens. */
export function useBottomInset(tabBarInset: boolean | undefined): number {
  const insets = useSafeAreaInsets();
  const inTabs = useIsInTabs();
  const clearTabBar = useTabBarInset();
  return (tabBarInset ?? inTabs) ? clearTabBar : insets.bottom + space[6];
}

/* ---------- large title ---------- */

/**
 * The large title scrolls away with a light parallax and fade while the compact
 * header title fades in. `collapse` is 0 (large title showing) to 1 (collapsed).
 * Reduced motion: no parallax, the two titles swap instantly.
 */
export function useLargeTitle(scrollY: SharedValue<number>, enabled: boolean, reduceMotion: boolean) {
  const height = useSharedValue(0);

  const collapse = useDerivedValue(() => {
    if (!enabled) return 1;
    const h = height.get();
    if (h <= 0) return 0;
    const y = scrollY.get();
    if (reduceMotion) return y > h * 0.6 ? 1 : 0;
    return clamp((y - h * 0.45) / (h * 0.4), 0, 1);
  });

  const titleStyle = useAnimatedStyle(() => {
    const h = Math.max(height.get(), 1);
    const y = Math.max(scrollY.get(), 0);
    if (reduceMotion) {
      return { opacity: y > h * 0.6 ? 0 : 1, transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    const p = clamp(y / (h * 0.8), 0, 1);
    return { opacity: 1 - p, transform: [{ translateY: y * 0.35 }, { scale: 1 - 0.04 * p }] };
  });

  const onTitleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      height.set(e.nativeEvent.layout.height);
    },
    [height],
  );

  return { collapse, titleStyle, onTitleLayout };
}

export type LargeTitleProps = {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  /** Usually the `titleStyle` from useLargeTitle. */
  animatedStyle?: ComponentProps<typeof Animated.View>['style'];
};

/** Eyebrow, 34sp display title and subtitle at the top of a screen's content. */
export function LargeTitle({ title, eyebrow, subtitle, animatedStyle }: LargeTitleProps) {
  return (
    <Animated.View style={[styles.largeTitle, animatedStyle]}>
      {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
      {title ? (
        <Text variant="largeTitle" accessibilityRole="header" style={eyebrow ? styles.titleAfterEyebrow : null}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text variant="body" color="ink3" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/* ---------- pull to refresh ---------- */

export type PullToRefreshOptions = {
  onRefresh?: () => Promise<unknown>;
  scrollY: SharedValue<number>;
  /** Worklet that holds the scroll view at the top while the content is pulled down. */
  pinToTop: () => void;
};

/**
 * Android has no overscroll bounce, so the pull is ours: a pan that runs with
 * the scroll view's native gesture, engages only when the list starts at the
 * top and the finger goes down, and drives `pull` (distance / 72dp) on the UI
 * thread. Past the trigger a release calls onRefresh; the indicator keeps
 * beating until the promise settles, then everything springs back. The lock
 * haptic belongs to PullToRefreshIndicator, so it is not repeated here.
 */
export function usePullToRefresh({ onRefresh, scrollY, pinToTop }: PullToRefreshOptions) {
  const distance = useSharedValue(0);
  const pull = useDerivedValue(() => distance.get() / PULL_TRIGGER);
  const startY = useSharedValue(0);
  const startScroll = useSharedValue(0);
  const busy = useSharedValue(false);
  const [refreshing, setRefreshing] = useState(false);
  const enabled = onRefresh !== undefined;

  // Stable for the memoized gestures, and still reads the latest onRefresh when a release triggers.
  const runRefresh = useLatestCallback(() => {
    const settle = () => {
      setRefreshing(false);
      busy.set(false);
      distance.set(withSpring(0, springs.default));
    };
    const fn = onRefresh;
    if (!fn) {
      settle();
      return;
    }
    setRefreshing(true);
    Promise.resolve()
      .then(fn)
      .catch(() => undefined)
      .finally(settle);
  });

  const gestures = useMemo(() => {
    const native = Gesture.Native();
    const pan = Gesture.Pan()
      .enabled(enabled)
      .activeOffsetY(8)
      .failOffsetX([-24, 24])
      .onStart((e) => {
        'worklet';
        startY.set(e.translationY);
        startScroll.set(scrollY.get());
      })
      .onUpdate((e) => {
        'worklet';
        // Started below the top: the finger is scrolling content, not pulling.
        if (busy.get() || startScroll.get() > 1) return;
        const d = pullDistance(e.translationY - startY.get());
        distance.set(d);
        // The scroll view moves with the finger too (both gestures run): hold it still.
        if (d > 0 && scrollY.get() > 0) pinToTop();
      })
      .onFinalize(() => {
        'worklet';
        if (busy.get()) return;
        if (distance.get() >= PULL_TRIGGER) {
          busy.set(true);
          distance.set(withSpring(PULL_TRIGGER, springs.snappy));
          scheduleOnRN(runRefresh);
        } else if (distance.get() > 0) {
          distance.set(withSpring(0, springs.default));
        }
      });
    pan.simultaneousWithExternalGesture(native);
    native.simultaneousWithExternalGesture(pan);
    return { native, pan };
  }, [enabled, startY, startScroll, scrollY, busy, distance, pinToTop, runRefresh]);

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: distance.get() }] }));

  return { gestures, pull, distance, refreshing, contentStyle, enabled };
}

const INDICATOR_SIZE = 36;

/** The black hole in the space the pull reveals, centred in the gap. */
export function PullIndicatorSlot({
  pull,
  distance,
  refreshing,
}: {
  pull: SharedValue<number>;
  distance: SharedValue<number>;
  refreshing: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const d = distance.get();
    return {
      opacity: clamp(d / 24, 0, 1),
      transform: [{ translateY: d / 2 - INDICATOR_SIZE / 2 }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.indicator, style]} importantForAccessibility="no-hide-descendants">
      <PullToRefreshIndicator pull={pull} refreshing={refreshing} size={INDICATOR_SIZE} />
    </Animated.View>
  );
}

/* ---------- the frame both screen shells render ---------- */

type ChromeOptions = Pick<ScreenChromeProps, 'title' | 'eyebrow' | 'subtitle' | 'largeTitle' | 'onRefresh' | 'scrollY' | 'tabBarInset'>;

/** Everything a screen shell needs: scroll tracking, large title, pull, insets, the scroll ref. */
export function useScreenChrome({ title, eyebrow, subtitle, largeTitle = true, onRefresh, scrollY: external, tabBarInset }: ChromeOptions) {
  const reduceMotion = useReduceMotion();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const { scrollY, onScroll } = useScrollTracking(external);
  const hasLargeTitle = largeTitle && Boolean(title || eyebrow || subtitle);
  const { collapse, titleStyle, onTitleLayout } = useLargeTitle(scrollY, hasLargeTitle, reduceMotion);
  const bottomInset = useBottomInset(tabBarInset);

  const pinToTop = useCallback(() => {
    'worklet';
    scrollTo(scrollRef, 0, 0, false);
  }, [scrollRef]);
  const pull = usePullToRefresh({ onRefresh, scrollY, pinToTop });

  const gesture: ScrollGestureValue = useMemo(() => ({ native: pull.gestures.native, scrollRef }), [pull.gestures.native, scrollRef]);

  // Without a large title the header is compact from the start; its hairline appears once content scrolls under it.
  const scrolled = useDerivedValue(() => clamp(scrollY.get() / 12, 0, 1));

  return { scrollRef, scrollY, onScroll, hasLargeTitle, collapse, titleStyle, onTitleLayout, bottomInset, pull, gesture, scrolled };
}

export type ScreenChrome = ReturnType<typeof useScreenChrome>;

type ScreenFrameProps = Pick<
  ScreenChromeProps,
  'title' | 'eyebrow' | 'back' | 'onBack' | 'headerLeft' | 'headerRight' | 'refetching' | 'style' | 'testID'
> & {
  chrome: ScreenChrome;
  /** The scroll body (it reads the pull gesture and scroll ref from context). */
  children: ReactNode;
};

/**
 * Background, header (with the refetch hairline), the pull gesture area with the
 * black hole revealed above the content, and the context the scroll body needs.
 */
export function ScreenFrame({
  chrome,
  title,
  eyebrow,
  back,
  onBack,
  headerLeft,
  headerRight,
  refetching = false,
  style,
  testID,
  children,
}: ScreenFrameProps) {
  const { colors } = useTheme();
  const { pull } = chrome;
  return (
    <View testID={testID} style={[styles.fill, { backgroundColor: colors.bg }, style]}>
      <Header
        title={title}
        eyebrow={chrome.hasLargeTitle ? undefined : eyebrow}
        back={back}
        onBack={onBack}
        headerLeft={headerLeft}
        headerRight={headerRight}
        // The pull's own indicator already says "loading"; no hairline on top of it.
        progress={refetching && !pull.refreshing}
        collapse={chrome.hasLargeTitle ? chrome.collapse : undefined}
        hairline={chrome.hasLargeTitle ? undefined : chrome.scrolled}
      />
      <GestureDetector gesture={pull.gestures.pan}>
        <View style={styles.fill} collapsable={false}>
          {pull.enabled ? <PullIndicatorSlot pull={pull.pull} distance={pull.distance} refreshing={pull.refreshing} /> : null}
          <Animated.View style={[styles.fill, pull.contentStyle]}>
            <ScrollGestureContext value={chrome.gesture}>{children}</ScrollGestureContext>
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  largeTitle: {
    paddingTop: space[1],
    paddingBottom: space[5],
    transformOrigin: 'left center',
  },
  titleAfterEyebrow: { marginTop: space[2] },
  subtitle: { marginTop: space[2] },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: INDICATOR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
