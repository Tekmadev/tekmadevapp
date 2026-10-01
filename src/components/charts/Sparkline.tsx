import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '@/design/theme';

import { layoutSeries, monotoneSegments } from './scale';

export type SparklineProps = {
  /** Values in order (oldest first). Fewer than two values renders nothing. */
  values: readonly number[];
  /** Height in dp (default 28). Width fills the parent unless given. */
  height?: number;
  width?: number;
  /** 'gold' for the headline trend; 'muted' when it sits beside a stronger accent. */
  tone?: 'gold' | 'muted';
};

const PAD = 3;

/**
 * A tiny trend line for StatCards: no axes, no labels, just the shape, with a
 * dot on the latest value. Decorative: the card's number and sub line carry
 * the meaning for TalkBack, so it is hidden from accessibility. It does not
 * animate (the card's count-up already moves).
 */
export function Sparkline({ values, height = 28, width: fixedWidth, tone = 'gold' }: SparklineProps) {
  const { colors } = useTheme();
  const [measured, setMeasured] = useState(0);
  const width = fixedWidth ?? measured;

  const geometry = useMemo(() => {
    if (values.length < 2 || width <= 0) return null;
    const l = layoutSeries(values, width, height, { top: PAD, bottom: PAD, left: PAD, right: PAD }, 1);
    // Scale to this series' own range so a flat-ish week still shows its shape.
    const finite = values.map((v) => (Number.isFinite(v) ? v : 0));
    const lo = Math.min(...finite);
    const hi = Math.max(...finite);
    const span = hi - lo || 1;
    const ys = finite.map((v) => (hi === lo ? height / 2 : height - PAD - ((v - lo) / span) * (height - PAD * 2)));
    const b = Skia.PathBuilder.Make().moveTo(l.xs[0], ys[0]);
    for (const s of monotoneSegments(l.xs, ys)) b.cubicTo(s.c1x, s.c1y, s.c2x, s.c2y, s.x, s.y);
    return { path: b.build(), endX: l.xs[l.xs.length - 1], endY: ys[ys.length - 1] };
  }, [values, width, height]);

  if (values.length < 2) return null;

  const color = tone === 'gold' ? colors.gold : colors.ink4;
  const onLayout = fixedWidth
    ? undefined
    : (e: LayoutChangeEvent) => {
        const next = Math.round(e.nativeEvent.layout.width);
        if (next !== measured) setMeasured(next);
      };

  return (
    <View
      onLayout={onLayout}
      style={[styles.box, { height }, fixedWidth ? { width: fixedWidth } : null]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {geometry ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={geometry.path} style="stroke" strokeWidth={1.5} strokeJoin="round" strokeCap="round" color={color} />
          <Circle cx={geometry.endX} cy={geometry.endY} r={2.5} color={colors.gold} />
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch' },
});
