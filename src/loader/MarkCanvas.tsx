import { Canvas, Group, Path, Skia, type SkPath, type Transforms3d } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, type DerivedValue } from 'react-native-reanimated';

import { LOGO_PATHS } from './logoPaths';
import { MARK_CENTER, VIEWBOX_MIN, VIEWBOX_SIZE, type MarkPose } from './pose';

/**
 * The one Skia scene every animated mark draws: the four logo paths, the outer
 * arcs and the inner hooks in their own groups, all pivoting on the logo centre.
 * React only renders this when size, colour or the value sources change, never
 * per frame: the shared values drive the canvas on the UI thread.
 *
 * Two ways in:
 * - `MarkCanvas` takes one derived `pose` (pull to refresh, boot splash, breathing mark).
 * - `MarkScene` takes one shared value per Skia prop, with no pose object in
 *   between. `BlackHole` uses it, since a screen can hold many of them.
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

type Frame = {
  /** Size of the 2400 unit viewBox in dp (the footprint this takes in layout). */
  size: number;
  /**
   * Canvas scale relative to `size` (1.1 = 10% bigger), centred over the
   * footprint, so scattered or spinning pieces are never clipped.
   */
  bleed: number;
  color: string;
};

export type MarkCanvasProps = Frame & {
  pose: DerivedValue<MarkPose>;
};

export type MarkSceneProps = Frame & {
  /** Path 2 (top outer arc). Also path 3 when `outerB` is left out. */
  outerA: DerivedValue<Transforms3d>;
  /** Path 3 (bottom outer arc). Leave it out when both arcs share one transform: they draw as one group. */
  outerB?: DerivedValue<Transforms3d>;
  /** Paths 1 and 4 (inner hooks), as one group. */
  inner: DerivedValue<Transforms3d>;
  innerOpacity: DerivedValue<number>;
  /** Whole mark opacity (all four paths). */
  opacity: DerivedValue<number>;
};

/** The scene from one pose: a derived value per Skia prop, read from the pose. */
export const MarkCanvas = memo(function MarkCanvas({ size, bleed, color, pose }: MarkCanvasProps) {
  const outerA = useDerivedValue(() => pose.get().outerA);
  const outerB = useDerivedValue(() => pose.get().outerB);
  const inner = useDerivedValue(() => pose.get().inner);
  const innerOpacity = useDerivedValue(() => pose.get().innerOpacity);
  const opacity = useDerivedValue(() => pose.get().opacity);

  return (
    <MarkScene
      size={size}
      bleed={bleed}
      color={color}
      outerA={outerA}
      outerB={outerB}
      inner={inner}
      innerOpacity={innerOpacity}
      opacity={opacity}
    />
  );
});

/** The scene from one shared value per Skia prop (no pose object, no derived values). */
export const MarkScene = memo(function MarkScene({ size, bleed, color, outerA, outerB, inner, innerOpacity, opacity }: MarkSceneProps) {
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
          {outerB ? (
            <>
              <Group origin={MARK_CENTER} transform={outerA}>
                <Path path={ARC_2} />
              </Group>
              <Group origin={MARK_CENTER} transform={outerB}>
                <Path path={ARC_3} />
              </Group>
            </>
          ) : (
            <Group origin={MARK_CENTER} transform={outerA}>
              <Path path={ARC_2} />
              <Path path={ARC_3} />
            </Group>
          )}
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
