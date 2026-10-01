import { Canvas, Path, Skia, rect, type SkPath } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedReaction, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { durations, easeStandard, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { CATEGORY_SLOTS, categoryColors, otherColor } from './palette';
import { formatCount, formatShare, summarizeShares, topWithOther } from './scale';

export type DonutDatum = { label: string; count: number };

export type DonutProps = {
  /** Rows as the API sends them (`{ label, count }`); the top `limit` are kept and the rest fold into "Other". */
  data: readonly DonutDatum[];
  /** Ring diameter in dp (default 168). */
  size?: number;
  /** Ring thickness in dp (default 20). */
  thickness?: number;
  /** Rows before "Other" (default 7, at most 7: one per palette colour). */
  limit?: number;
  otherLabel?: string;
  formatValue?: (value: number) => string;
  /** Caption over the total in the centre (default "Total"). */
  totalLabel?: string;
  /** What is shown ("Traffic sources"), used for the TalkBack summary. */
  name?: string;
  accessibilityLabel?: string;
  /** Legend list under the ring (default true). */
  showLegend?: boolean;
  testID?: string;
};

/** Surface gap between slices, measured along the middle of the ring. */
const GAP = 2.5;
const SWEEP_MS = 900;
const DIMMED = 0.35;

type Arc = {
  path: SkPath;
  /** Drawn span in degrees from 12 o'clock, clockwise (gaps removed). */
  from: number;
  to: number;
  /** Full span including its share of the gaps, for hit testing. */
  hitFrom: number;
  hitTo: number;
};

/**
 * Share of a whole: a ring of up to 7 slices plus "Other", swept in on mount.
 * Tap a slice (or its legend row) to highlight it: the others dim and the
 * centre shows its label, count and share. Tap it again, or the centre, to
 * go back to the total. Empty data renders nothing (the caller shows "No data yet.").
 */
export function Donut({
  data,
  size = 168,
  thickness = 20,
  limit = 7,
  otherLabel = 'Other',
  formatValue = formatCount,
  totalLabel = 'Total',
  name = 'Chart',
  accessibilityLabel,
  showLegend = true,
  testID,
}: DonutProps) {
  const { colors, isDark } = useTheme();
  // Never more named slices than palette slots, so two slices never share a colour.
  const keep = Math.min(Math.max(1, limit), CATEGORY_SLOTS);
  const slices = useMemo(() => topWithOther(data, keep, otherLabel), [data, keep, otherLabel]);
  const total = slices.reduce((s, r) => s + r.count, 0);

  // Selection is kept by label so a refetch that reorders rows keeps (or drops) it correctly.
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const selected = selectedLabel === null ? -1 : slices.findIndex((s) => s.label === selectedLabel);
  const selectedShared = useSharedValue(-1);
  useEffect(() => {
    selectedShared.set(selected);
  }, [selected, selectedShared]);

  const counts = useMemo(() => slices.map((s) => s.count), [slices]);
  const sliceColors = useMemo(() => {
    const palette = categoryColors(colors, isDark);
    // A single leftover row keeps its name (see topWithOther) but sits in the "Other" slot and colour.
    return slices.map((s, i) => (s.isOther || i >= palette.length ? otherColor(colors) : palette[i]));
  }, [slices, colors, isDark]);

  if (total <= 0) return null;

  const toggle = (index: number) => {
    const next = index < 0 || index === selected ? null : (slices[index]?.label ?? null);
    if (next !== selectedLabel) haptics.selection();
    setSelectedLabel(next);
  };

  const summary = accessibilityLabel ?? summarizeShares(name, slices, formatValue);
  const focus = selected >= 0 ? slices[selected] : undefined;
  const centreWidth = size - thickness * 2 - space[4];

  return (
    <View testID={testID}>
      <View style={styles.ringWrap}>
        <View
          style={{ width: size, height: size }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={focus ? `${focus.label}, ${formatValue(focus.count)}, ${formatShare(focus.count, total)}` : summary}
        >
          <Ring
            counts={counts}
            colors={sliceColors}
            size={size}
            thickness={thickness}
            selected={selectedShared}
            onTap={toggle}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centre]}>
            <Animated.View key={focus?.label ?? '__total'} entering={FadeIn.duration(durations.fast)} style={[styles.centreInner, { width: centreWidth }]}>
              <Text variant="caption" color="ink3" numberOfLines={1} align="center">
                {focus ? focus.label : totalLabel}
              </Text>
              <Text variant="number" tabular numberOfLines={1} adjustsFontSizeToFit align="center">
                {formatValue(focus ? focus.count : total)}
              </Text>
              {focus ? (
                <Text variant="label" color="ink3" tabular align="center">
                  {formatShare(focus.count, total)}
                </Text>
              ) : null}
            </Animated.View>
          </View>
        </View>
      </View>

      {showLegend ? (
        <View style={styles.legend}>
          {slices.map((s, i) => {
            const isSelected = i === selected;
            const dimmed = selected >= 0 && !isSelected;
            const share = formatShare(s.count, total);
            return (
              <PressableScale
                key={s.label}
                haptic={false}
                onPress={() => toggle(i)}
                accessibilityLabel={`${s.label}, ${formatValue(s.count)}, ${share}`}
                accessibilityState={{ selected: isSelected }}
                accessibilityHint="Highlights it in the chart"
                hitSlop={2}
                style={[styles.row, isSelected ? { backgroundColor: colors.lineSoft } : null, dimmed ? styles.dimmed : null]}
              >
                <View style={[styles.dot, { backgroundColor: sliceColors[i] }]} />
                <Text variant="small" numberOfLines={1} style={styles.rowLabel}>
                  {s.label}
                </Text>
                <Text variant="label" color="ink2" tabular>
                  {formatValue(s.count)}
                </Text>
                <Text variant="label" color="ink3" tabular align="right" style={styles.share}>
                  {share}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

type RingProps = {
  counts: number[];
  colors: string[];
  size: number;
  thickness: number;
  selected: SharedValue<number>;
  onTap: (index: number) => void;
};

function buildArcs(counts: readonly number[], size: number, thickness: number): Arc[] {
  const total = counts.reduce((s, c) => s + c, 0);
  const r = (size - thickness) / 2;
  const oval = rect(size / 2 - r, size / 2 - r, r * 2, r * 2);
  const gapDeg = counts.length > 1 ? (GAP / r) * (180 / Math.PI) : 0;
  let acc = 0;
  return counts.map((count) => {
    const sweep = (count / total) * 360;
    const hitFrom = acc;
    acc += sweep;
    const from = hitFrom + gapDeg / 2;
    // A slice thinner than the gap still gets a sliver so it is never invisible.
    const to = Math.max(acc - gapDeg / 2, from + 0.4);
    // 359.999 avoids the full-circle case where Skia draws an oval from a different start point.
    const span = Math.min(to - from, 359.999);
    const path = Skia.PathBuilder.Make()
      .addArc(oval, from - 90, span)
      .build();
    return { path, from, to: from + span, hitFrom, hitTo: acc };
  });
}

const Ring = memo(function Ring({ counts, colors, size, thickness, selected, onTap }: RingProps) {
  const reduceMotion = useReduceMotion();
  const arcs = useMemo(() => buildArcs(counts, size, thickness), [counts, size, thickness]);
  // Sweep again only when the numbers change, not on every refetch that returns the same rows.
  const countsKey = counts.join(',');

  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withTiming(1, { duration: SWEEP_MS, easing: easeStandard }));
  }, [countsKey, reduceMotion, progress]);

  const tap = useMemo(() => {
    const hitFrom = arcs.map((a) => a.hitFrom);
    const hitTo = arcs.map((a) => a.hitTo);
    const outer = size / 2;
    const inner = size / 2 - thickness;
    return Gesture.Tap()
      .maxDistance(12)
      .onEnd((e, success) => {
        if (!success) return;
        const dx = e.x - outer;
        const dy = e.y - outer;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // The centre clears the highlight; the ring gets a little slack on both edges.
        if (dist < inner - 10) {
          scheduleOnRN(onTap, -1);
          return;
        }
        if (dist > outer + 8) return;
        const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
        for (let i = 0; i < hitFrom.length; i++) {
          if (deg >= hitFrom[i] && deg < hitTo[i]) {
            scheduleOnRN(onTap, i);
            return;
          }
        }
      });
  }, [arcs, size, thickness, onTap]);

  return (
    <GestureDetector gesture={tap}>
      <View style={StyleSheet.absoluteFill}>
        <Canvas style={StyleSheet.absoluteFill}>
          {arcs.map((arc, i) => (
            <SliceArc
              key={i}
              index={i}
              arc={arc}
              color={colors[i]}
              thickness={thickness}
              progress={progress}
              selected={selected}
            />
          ))}
        </Canvas>
      </View>
    </GestureDetector>
  );
});

type SliceArcProps = {
  index: number;
  arc: Arc;
  color: string;
  thickness: number;
  progress: SharedValue<number>;
  selected: SharedValue<number>;
};

/** One slice: its end follows the shared sweep, its opacity follows the highlight. */
function SliceArc({ index, arc, color, thickness, progress, selected }: SliceArcProps) {
  const { from, to } = arc;
  const end = useDerivedValue(() => {
    const swept = progress.get() * 360;
    const t = (swept - from) / (to - from);
    return t < 0 ? 0 : t > 1 ? 1 : t;
  });
  const opacity = useSharedValue(1);
  useAnimatedReaction(
    () => selected.get(),
    (current, previous) => {
      if (current === previous) return;
      opacity.set(withTiming(current < 0 || current === index ? 1 : DIMMED, { duration: durations.base }));
    },
  );
  return <Path path={arc.path} style="stroke" strokeWidth={thickness} strokeCap="butt" color={color} start={0} end={end} opacity={opacity} />;
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  centreInner: { alignItems: 'center', gap: 2 },
  legend: { marginTop: space[4], gap: 2 },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[2],
    borderRadius: radius.sm,
  },
  dimmed: { opacity: 0.5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowLabel: { flex: 1 },
  share: { minWidth: 40 },
});
