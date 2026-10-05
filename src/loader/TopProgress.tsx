import { memo, useEffect, useRef } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { easeHairline, easeStandard, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

/** How far the bar creeps while the refetch runs, and how long it takes. */
const CREEP_TO = 0.85;
const CREEP_MS = 8000;
const COMPLETE_MS = 200;
const FADE_OUT_MS = 300;

export type TopProgressProps = {
  active: boolean;
  /** Extra positioning; by default it spans the bottom edge of its parent. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The 2dp gold hairline under a header while a visible screen refetches in the
 * background, like the website's top bar. It grows 0 to 85% over 8s with
 * cubic-bezier(0.1, 0.6, 0.2, 1); when the refetch ends it jumps to 100% in
 * 200ms, fades out over 300ms, then resets. Never blocks touches.
 *
 * It animates scaleX from the left edge rather than width, so nothing lays out
 * per frame. Reduced motion: no growth, a static 85% bar while active, then a
 * plain fade.
 *
 * Render it inside the header (positioned relative), it pins itself to the
 * header's bottom edge across the full width.
 */
export const TopProgress = memo(function TopProgress({ active, style }: TopProgressProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const wasActive = useRef(false);

  useEffect(() => {
    if (active) {
      wasActive.current = true;
      cancelAnimation(progress);
      cancelAnimation(opacity);
      opacity.set(1);
      if (reduceMotion) {
        progress.set(CREEP_TO);
      } else {
        progress.set(0);
        progress.set(withTiming(CREEP_TO, { duration: CREEP_MS, easing: easeHairline, reduceMotion: ReduceMotion.Never }));
      }
      return;
    }
    // Only a bar that actually ran gets the completion; mounting inactive shows nothing.
    if (!wasActive.current) return;
    wasActive.current = false;
    cancelAnimation(progress);
    if (reduceMotion) {
      progress.set(1);
    } else {
      progress.set(withTiming(1, { duration: COMPLETE_MS, easing: easeStandard, reduceMotion: ReduceMotion.Never }));
    }
    opacity.set(
      withDelay(
        reduceMotion ? 0 : COMPLETE_MS,
        withTiming(0, { duration: FADE_OUT_MS, easing: easeStandard, reduceMotion: ReduceMotion.Never }, (finished) => {
          'worklet';
          if (finished) progress.set(0);
        }),
        ReduceMotion.Never,
      ),
    );
  }, [active, reduceMotion, progress, opacity]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scaleX: progress.get() }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.bar, { backgroundColor: colors.gold }, style, barStyle]}
    />
  );
});

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    transformOrigin: 'left center',
  },
});
