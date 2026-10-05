import { Canvas, Circle, Group, Line, LinearGradient, Path, Skia, rect, vec, type SkPath } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { durations, easeStandard, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, withAlpha } from '@/design/tokens';

import { compactNumber, formatCount, layoutSeries, monotoneSegments, nearestIndex, summarizeSeries, type SeriesLayout } from './scale';

export type AreaPoint = {
  /** Short x label from the API ("Sep 12", "14:00"). Text: never parsed as a date. */
  label: string;
  value: number;
  /** Longer label for the scrub tooltip ("Saturday, September 12"). Falls back to `label`. */
  title?: string;
};

export type AreaChartProps = {
  data: readonly AreaPoint[];
  /** Height of the plot in dp (default 180). The first/last x labels add 20dp under it. */
  height?: number;
  /** Tooltip value (default "3,412"). */
  formatValue?: (value: number) => string;
  /** Y gridline labels (default compact: "1.2K"). Money charts pass formatCentsCompact. */
  formatAxis?: (value: number) => string;
  /** TalkBack summary. Defaults to one built from `name` and the data. */
  accessibilityLabel?: string;
  /** What is plotted ("Pageviews"), used for the default TalkBack summary. */
  name?: string;
  /** The range in words ("last 30 days"), added to the default TalkBack summary. */
  period?: string;
  testID?: string;
};

/** Room above the top gridline for its label, and around the line so the cursor dot never clips. */
const INSETS = { top: 18, bottom: 8, left: 8, right: 8 } as const;
const DRAW_IN_MS = 700;
const X_LABELS_HEIGHT = 20;

/** Module scope so the UI-thread gesture can hand it to the RN thread. */
const tick = () => haptics.tick();

/**
 * The time series chart: a gold line over a soft gold wash, three faint
 * gridlines, and the first and last x labels. It draws in from the left on
 * mount (and when the series changes, e.g. a new range), and a finger scrub
 * moves a cursor to the nearest point with a tooltip and a haptic tick per point.
 *
 * Empty data renders nothing: the caller shows "No data yet." so that
 * "empty" and "failed" stay different states.
 */
export function AreaChart({
  data,
  height = 180,
  formatValue = formatCount,
  formatAxis = compactNumber,
  accessibilityLabel,
  name = 'Chart',
  period,
  testID,
}: AreaChartProps) {
  const [width, setWidth] = useState(0);

  if (data.length === 0) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };
  const summary = accessibilityLabel ?? summarizeSeries({ name, period, data, formatValue });
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={summary} testID={testID}>
      <View style={{ height }}>
        {width > 0 ? <Plot data={data} width={width} height={height} formatValue={formatValue} formatAxis={formatAxis} /> : null}
      </View>
      <View style={styles.xLabels} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {data.length === 1 ? (
          <Text variant="mono" color="ink4" tabular numberOfLines={1} style={[styles.axisText, styles.xCentre]}>
            {first.label}
          </Text>
        ) : (
          <>
            <Text variant="mono" color="ink4" tabular numberOfLines={1} style={[styles.axisText, styles.xLabel]}>
              {first.label}
            </Text>
            <Text variant="mono" color="ink4" tabular numberOfLines={1} style={[styles.axisText, styles.xLabel, styles.xRight]}>
              {last.label}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

type PlotProps = {
  data: readonly AreaPoint[];
  width: number;
  height: number;
  formatValue: (value: number) => string;
  formatAxis: (value: number) => string;
};

/** Built once per layout: the line, and the same curve closed down to the baseline for the wash. */
function buildPaths(l: SeriesLayout): { line: SkPath; area: SkPath } | null {
  const n = l.xs.length;
  if (n < 2) return null;
  const line = Skia.PathBuilder.Make().moveTo(l.xs[0], l.ys[0]);
  for (const s of monotoneSegments(l.xs, l.ys)) line.cubicTo(s.c1x, s.c1y, s.c2x, s.c2y, s.x, s.y);
  const linePath = line.build();
  const area = Skia.PathBuilder.MakeFromPath(linePath)
    .lineTo(l.xs[n - 1], l.baseline)
    .lineTo(l.xs[0], l.baseline)
    .close()
    .build();
  return { line: linePath, area };
}

const Plot = memo(function Plot({ data, width, height, formatValue, formatAxis }: PlotProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

  const layout = useMemo(
    () =>
      layoutSeries(
        data.map((d) => d.value),
        width,
        height,
        INSETS,
      ),
    [data, width, height],
  );
  const paths = useMemo(() => buildPaths(layout), [layout]);
  const { xs, ys, baseline, grid } = layout;
  const count = xs.length;
  const plotWidth = width - INSETS.left - INSETS.right;
  const lineTop = Math.min(...ys);

  // Draw-in: a clip that sweeps left to right. Restarts when the series itself changes (a new range).
  const reveal = useSharedValue(reduceMotion ? 1 : 0);
  const seriesKey = `${count}|${data[0]?.label ?? ''}|${data[count - 1]?.label ?? ''}`;
  useEffect(() => {
    if (reduceMotion) {
      reveal.set(1);
      return;
    }
    reveal.set(0);
    reveal.set(withTiming(1, { duration: DRAW_IN_MS, easing: easeStandard }));
  }, [seriesKey, reduceMotion, reveal]);
  const clip = useDerivedValue(() => rect(0, 0, Math.max(reveal.get() * width, 0.5), height));

  // Scrub state lives on the UI thread; only the tooltip text crosses to JS.
  const active = useSharedValue(-1);
  const shown = useSharedValue(0);

  const gesture = useMemo(() => {
    const move = (x: number) => {
      'worklet';
      const i = nearestIndex(x, count, INSETS.left, plotWidth);
      if (i !== active.get()) {
        active.set(i);
        scheduleOnRN(tick);
      }
    };
    const begin = (x: number) => {
      'worklet';
      active.set(-1);
      move(x);
      shown.set(withTiming(1, { duration: 120 }));
    };
    const end = () => {
      'worklet';
      shown.set(withTiming(0, { duration: durations.fast }));
    };
    // A horizontal swipe scrubs at once; a vertical one fails fast so the screen still scrolls.
    const swipe = Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .shouldCancelWhenOutside(false)
      .onStart((e) => begin(e.x))
      .onUpdate((e) => move(e.x))
      .onEnd(() => end());
    // Press and hold also scrubs, then any direction is fine.
    const hold = Gesture.Pan()
      .activateAfterLongPress(220)
      .shouldCancelWhenOutside(false)
      .onStart((e) => begin(e.x))
      .onUpdate((e) => move(e.x))
      .onEnd(() => end());
    return Gesture.Race(swipe, hold);
  }, [count, plotWidth, active, shown]);

  const cursorX = useDerivedValue(() => {
    const i = active.get();
    return i >= 0 && i < xs.length ? xs[i] : -100;
  });
  const cursorY = useDerivedValue(() => {
    const i = active.get();
    return i >= 0 && i < ys.length ? ys[i] : -100;
  });
  const cursorTop = useDerivedValue(() => vec(cursorX.get(), INSETS.top - 6));
  const cursorBottom = useDerivedValue(() => vec(cursorX.get(), baseline));

  const single = count === 1;

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill}>
        <Canvas style={StyleSheet.absoluteFill}>
          {grid.map((g) => (
            <Line key={g.value} p1={vec(0, g.y)} p2={vec(width, g.y)} color={colors.line} strokeWidth={1} />
          ))}
          <Line p1={vec(0, baseline)} p2={vec(width, baseline)} color={colors.lineStrong} strokeWidth={1} />

          <Group clip={clip}>
            {paths ? (
              <>
                <Path path={paths.area}>
                  <LinearGradient
                    start={vec(0, lineTop)}
                    end={vec(0, baseline)}
                    colors={[withAlpha(colors.gold, 0.28), withAlpha(colors.gold, 0)]}
                  />
                </Path>
                <Path path={paths.line} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round" color={colors.gold} />
              </>
            ) : null}
            {single ? (
              <>
                <Line p1={vec(xs[0], ys[0])} p2={vec(xs[0], baseline)} color={colors.lineStrong} strokeWidth={1} />
                <Circle cx={xs[0]} cy={ys[0]} r={6} color={colors.surface} />
                <Circle cx={xs[0]} cy={ys[0]} r={4} color={colors.gold} />
              </>
            ) : null}
          </Group>

          <Group opacity={shown}>
            <Line p1={cursorTop} p2={cursorBottom} color={colors.lineStrong} strokeWidth={1} />
            <Circle cx={cursorX} cy={cursorY} r={6.5} color={colors.surface} />
            <Circle cx={cursorX} cy={cursorY} r={4.5} color={colors.gold} />
          </Group>
        </Canvas>

        {/* Y labels as native text: crisp, in our font, and they follow font scaling. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {grid.map((g) => (
            <Text
              key={g.value}
              variant="mono"
              color="ink4"
              tabular
              numberOfLines={1}
              // Anchored by the bottom so a larger font scale grows upward, never across the gridline.
              style={[styles.axisText, styles.yLabel, { bottom: height - g.y + 2 }]}
            >
              {formatAxis(g.value)}
            </Text>
          ))}
        </View>

        <ScrubTooltip data={data} xs={xs} ys={ys} active={active} shown={shown} width={width} baseline={baseline} formatValue={formatValue} />
      </View>
    </GestureDetector>
  );
});

type TooltipProps = {
  data: readonly AreaPoint[];
  xs: readonly number[];
  ys: readonly number[];
  active: SharedValue<number>;
  shown: SharedValue<number>;
  width: number;
  baseline: number;
  formatValue: (value: number) => string;
};

/**
 * The scrub card. Its position is computed on the UI thread every frame; its
 * text follows the active point through one small JS state, so scrubbing
 * never re-renders the canvas.
 */
function ScrubTooltip({ data, xs, ys, active, shown, width, baseline, formatValue }: TooltipProps) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(-1);
  const box = useSharedValue({ w: 0, h: 0 });

  useAnimatedReaction(
    () => active.get(),
    (current, previous) => {
      if (current >= 0 && current !== previous) scheduleOnRN(setIndex, current);
    },
  );

  const style = useAnimatedStyle(() => {
    const i = active.get();
    const { w, h } = box.get();
    const x = i >= 0 && i < xs.length ? xs[i] : 0;
    const y = i >= 0 && i < ys.length ? ys[i] : baseline;
    const left = Math.min(Math.max(x - w / 2, 0), Math.max(width - w, 0));
    // Sit along the top; drop to the bottom when the point itself is up there.
    const top = y < h + 10 ? Math.max(baseline - h - 8, 0) : 0;
    return {
      opacity: w > 0 ? shown.get() : 0,
      transform: [{ translateX: left }, { translateY: top }],
    };
  });

  const point = index >= 0 ? data[Math.min(index, data.length - 1)] : undefined;

  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={(e) => box.set({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[
        styles.tooltip,
        { backgroundColor: colors.surface, borderColor: colors.lineStrong, shadowColor: colors.shadow, maxWidth: width },
        style,
      ]}
    >
      <Text variant="caption" color="ink3" numberOfLines={1}>
        {point ? (point.title ?? point.label) : ' '}
      </Text>
      <Text variant="bodyStrong" tabular numberOfLines={1}>
        {point ? formatValue(point.value) : ' '}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  axisText: { fontSize: 11, lineHeight: 14 },
  yLabel: { position: 'absolute', left: 0 },
  xLabels: { height: X_LABELS_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  xLabel: { maxWidth: '48%' },
  xRight: { textAlign: 'right' },
  xCentre: { flex: 1, textAlign: 'center' },
  tooltip: {
    position: 'absolute',
    left: 0,
    top: 0,
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
});
