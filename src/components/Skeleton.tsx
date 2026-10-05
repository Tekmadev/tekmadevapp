import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, space, withAlpha } from '@/design/tokens';
import { useLoaderSettings } from '@/loader/settings';

import { Divider } from './Divider';

/** One sweep of the warm light across a block. */
const SWEEP_MS = 1400;
const BAND = 160;

/**
 * True once `showAfterMs` (from the loader settings) has passed since mount, so
 * a fast load never flashes a skeleton. Use it for any custom loading layout.
 */
export function useShowAfter(delayMs?: number): boolean {
  const { showAfterMs } = useLoaderSettings();
  const ms = delayMs ?? showAfterMs;
  const [shown, setShown] = useState(ms <= 0);
  // No delay shows at once and stays shown: adjusted during render, not in an effect.
  if (ms <= 0 && !shown) setShown(true);
  useEffect(() => {
    if (ms <= 0) return;
    const id = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return shown;
}

/** One shimmer clock for a group of blocks, so they sweep together. */
const ShimmerContext = createContext<SharedValue<number> | null>(null);

function useShimmerClock(enabled: boolean): SharedValue<number> {
  const reduceMotion = useReduceMotion();
  const clock = useSharedValue(0);
  useEffect(() => {
    if (!enabled || reduceMotion) {
      cancelAnimation(clock);
      clock.set(0);
      return;
    }
    clock.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, false));
    return () => cancelAnimation(clock);
  }, [clock, enabled, reduceMotion]);
  return clock;
}

export type SkeletonProps = {
  /** line: a text line (12dp tall); block: a card or image area; circle: an avatar or icon. */
  shape?: 'line' | 'block' | 'circle';
  width?: DimensionValue;
  height?: number;
  /** Circle diameter (circle shape). */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A warm placeholder block with a slow light sweeping across it. Inside a
 * SkeletonGroup (or SkeletonList) it shares the group's delay and clock;
 * on its own it waits for `showAfterMs` itself. Reduced motion: a still block.
 */
export function Skeleton({ shape = 'line', width, height, size = 40, style }: SkeletonProps) {
  const group = use(ShimmerContext);
  const visible = useShowAfter();
  const own = useShimmerClock(group === null && visible);
  const clock = group ?? own;
  const { colors, isDark } = useTheme();
  const reduceMotion = useReduceMotion();
  const [w, setW] = useState(0);

  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -BAND + clock.get() * (w + BAND) }],
  }));

  if (group === null && !visible) return null;

  const dims: ViewStyle =
    shape === 'circle'
      ? { width: size, height: size, borderRadius: radius.pill }
      : shape === 'block'
        ? { width: width ?? '100%', height: height ?? 96, borderRadius: radius.sm }
        : { width: width ?? '100%', height: height ?? 12, borderRadius: radius.xs };

  // Warm ink at a few percent works on bg and on cards alike; the light is paper in light mode.
  const base = withAlpha(colors.ink, isDark ? 0.07 : 0.06);
  const light = isDark ? withAlpha(colors.ink, 0.06) : withAlpha(colors.surface, 0.7);

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[styles.block, dims, { backgroundColor: base }, style]}
    >
      {reduceMotion || w === 0 ? null : (
        <Animated.View
          style={[
            styles.band,
            { experimental_backgroundImage: `linear-gradient(90deg, transparent, ${light}, transparent)` },
            sweep,
          ]}
        />
      )}
    </View>
  );
}

/**
 * Wraps a custom skeleton layout: one `showAfterMs` delay and one shimmer
 * clock for every block inside. Announces "Loading" once to TalkBack.
 */
export function SkeletonGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const visible = useShowAfter();
  const clock = useShimmerClock(visible);
  if (!visible) return null;
  return (
    <ShimmerContext value={clock}>
      <View style={style} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
        {children}
      </View>
    </ShimmerContext>
  );
}

export type SkeletonListProps = {
  /** Rows to show (default 6). */
  rows?: number;
  /** Leading circle like a ListRow with an icon or avatar (default true). */
  leading?: boolean;
  /** Trailing short value on the right (default true). */
  trailing?: boolean;
  /** Hairlines between rows (default true). */
  dividers?: boolean;
  style?: StyleProp<ViewStyle>;
};

const LINE_WIDTHS: DimensionValue[] = ['72%', '58%', '66%', '50%', '62%', '70%'];

/** The loading state of a list screen: rows shaped like ListRow. */
export function SkeletonList({ rows = 6, leading = true, trailing = true, dividers = true, style }: SkeletonListProps) {
  return (
    <SkeletonGroup style={style}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i}>
          <View style={styles.row}>
            {leading ? <Skeleton shape="circle" size={40} /> : null}
            <View style={styles.lines}>
              <Skeleton width={LINE_WIDTHS[i % LINE_WIDTHS.length]} height={13} />
              <Skeleton width="38%" height={11} />
            </View>
            {trailing ? <Skeleton width={48} height={13} /> : null}
          </View>
          {dividers && i < rows - 1 ? <Divider inset={leading ? 72 : layout.gutter} /> : null}
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  block: { overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, width: BAND },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingHorizontal: layout.gutter,
  },
  lines: { flex: 1, gap: space[2] },
});
