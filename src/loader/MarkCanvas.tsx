import { Canvas, Group, Path, Skia, type SkPath, type Transforms3d } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, type DerivedValue } from 'react-native-reanimated';

import { LOGO_PATHS } from './logoPaths';
import { MARK_CENTER, VIEWBOX_MIN, VIEWBOX_SIZE, type MarkPose } from './pose';

/**
 * The one Skia scene every animated mark draws: the four logo paths, the outer
 * arcs and the inner hooks in their own groups, all pivoting on the logo centre.
 * A single derived `pose` drives everything on the UI thread; React only renders
 * this when size, colour or the pose source change, never per frame.
 */

function parse(d: string): SkPath {
  // MakeFromSVGString returns null for bad data; an empty path keeps the scene drawable.
  return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
}

/** Parsed once for the life of the app. Paths 1 and 4 are the hooks, 2 and 3 the arcs. */
const PATH_BY_ID = new Map(LOGO_PATHS.map((piece) => [piece.id, parse(piece.d)]));
const HOOK_1 = PATH_BY_ID.get(1) ?? Skia.Path.Make();
const ARC_2 = PATH_BY_ID.get(2) ?? Skia.Path.Make();
const ARC_3 = PATH_BY_ID.get(3) ?? Skia.Path.Make();
const HOOK_4 = PATH_BY_ID.get(4) ?? Skia.Path.Make();

export type MarkCanvasProps = {
  /** Size of the 2400 unit viewBox in dp (the footprint this takes in layout). */
  size: number;
  /**
   * Canvas scale relative to `size` (1.1 = 10% bigger), centred over the
   * footprint, so scattered or spinning pieces are never clipped.
   */
  bleed: number;
  color: string;
  pose: DerivedValue<MarkPose>;
};

export const MarkCanvas = memo(function MarkCanvas({ size, bleed, color, pose }: MarkCanvasProps) {
  const outerA = useDerivedValue(() => pose.get().outerA);
  const outerB = useDerivedValue(() => pose.get().outerB);
  const inner = useDerivedValue(() => pose.get().inner);
  const innerOpacity = useDerivedValue(() => pose.get().innerOpacity);
  const opacity = useDerivedValue(() => pose.get().opacity);

  // Whole dp of padding so the canvas lands on the same pixel grid as its footprint.
  const pad = Math.ceil((size * (bleed - 1)) / 2);
  const canvasSize = size + pad * 2;

  // Maps viewBox units to dp. Skia applies the last entry first: shift the
  // viewBox origin to 0, scale it to `size`, then move it inside the padding.
  const viewBox = useMemo<Transforms3d>(
    () => [{ translate: [pad, pad] }, { scale: size / VIEWBOX_SIZE }, { translate: [-VIEWBOX_MIN, -VIEWBOX_MIN] }],
    [pad, size],
  );
  const canvasStyle = useMemo(
    () => ({ position: 'absolute' as const, left: -pad, top: -pad, width: canvasSize, height: canvasSize }),
    [pad, canvasSize],
  );

  return (
    <View style={[styles.box, { width: size, height: size }]} pointerEvents="none">
      <Canvas style={canvasStyle} pointerEvents="none">
        <Group transform={viewBox} color={color} opacity={opacity} antiAlias>
          <Group origin={MARK_CENTER} transform={outerA}>
            <Path path={ARC_2} />
          </Group>
          <Group origin={MARK_CENTER} transform={outerB}>
            <Path path={ARC_3} />
          </Group>
          <Group origin={MARK_CENTER} transform={inner} opacity={innerOpacity}>
            <Path path={HOOK_1} />
            <Path path={HOOK_4} />
          </Group>
        </Group>
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { overflow: 'visible' },
});
