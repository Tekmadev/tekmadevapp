import type { Transforms3d } from '@shopify/react-native-skia';

import { degToRad, type BeatFrame, type ScatterFrame } from './keyframes';

/**
 * Turns keyframe poses (keyframes.ts) into the transforms the Skia scene draws.
 * Pure worklets: they run on the UI thread every frame, so no React and no Skia
 * objects in here, only numbers and small arrays.
 *
 * Every transform pivots on the logo centre (1500, 1500) in viewBox units; the
 * scene sets that as the Group origin.
 */

/** The logo viewBox is `300 300 2400 2400`. */
export const VIEWBOX_SIZE = 2400;
export const VIEWBOX_MIN = 300;
export const MARK_CENTER = { x: 1500, y: 1500 } as const;

/**
 * Furthest point of any piece from the centre, in viewBox units. The outer arc
 * tips reach about 1216, a little past the 1200 half box, so a spinning mark
 * needs a hair of bleed around its box or the tips get clipped mid turn.
 */
export const MARK_RADIUS = 1217;

/**
 * Unit vector from the centre toward the top outer arc (path 2), measured from
 * the arc's area centroid. Path 3 is its 180 degree twin, so it uses the opposite.
 * Pull to refresh pushes each arc out along its own direction.
 */
export const OUTER_PUSH = { x: -0.0553, y: -0.9985 } as const;

export type MarkPose = {
  /** Path 2 (top outer arc). */
  outerA: Transforms3d;
  /** Path 3 (bottom outer arc). */
  outerB: Transforms3d;
  /** Paths 1 and 4 (inner hooks), as one group. */
  inner: Transforms3d;
  innerOpacity: number;
  /** Whole mark opacity (all four paths). */
  opacity: number;
};

const IDENTITY: Transforms3d = [];

/** The plain logo, at an opacity. */
export function restPose(opacity = 1): MarkPose {
  'worklet';
  return { outerA: IDENTITY, outerB: IDENTITY, inner: IDENTITY, innerOpacity: 1, opacity };
}

/** One beat pose. `scale` multiplies the whole mark (overpull, shrink away). */
export function beatPose(f: BeatFrame, scale = 1, opacity = 1): MarkPose {
  'worklet';
  const outer: Transforms3d = [
    { scale },
    { rotate: degToRad(f.outerRotate) },
    { scale: f.outerScale },
  ];
  return {
    outerA: outer,
    outerB: outer,
    inner: [{ scale }, { rotate: degToRad(f.innerRotate) }, { scale: f.innerScale }],
    innerOpacity: f.innerOpacity,
    opacity,
  };
}

/**
 * A scattered pose: like a beat pose, plus each outer arc pushed `outerOffset`
 * viewBox units away from the centre along its own direction. The push sits
 * inside the rotation, so a rotated arc is pushed along where it now points.
 */
export function scatterPose(f: ScatterFrame, scale = 1, opacity = 1): MarkPose {
  'worklet';
  const rotate = degToRad(f.outerRotate);
  const dx = OUTER_PUSH.x * f.outerOffset;
  const dy = OUTER_PUSH.y * f.outerOffset;
  return {
    outerA: [{ scale }, { rotate }, { translate: [dx, dy] }, { scale: f.outerScale }],
    outerB: [{ scale }, { rotate }, { translate: [-dx, -dy] }, { scale: f.outerScale }],
    inner: [{ scale }, { rotate: degToRad(f.innerRotate) }, { scale: f.innerScale }],
    innerOpacity: f.innerOpacity,
    opacity,
  };
}

/**
 * Layers a scatter on top of a beat frame, `amount` of the way (0 = just the
 * beat, 1 = beat plus the full scatter). The boot splash uses it so the last
 * few percent of its pull together can overlap the first beat without a seam.
 */
export function addScatter(beat: BeatFrame, scatter: ScatterFrame, amount: number): ScatterFrame {
  'worklet';
  const a = Math.min(Math.max(amount, 0), 1);
  return {
    outerRotate: beat.outerRotate + scatter.outerRotate * a,
    outerScale: beat.outerScale * (1 + (scatter.outerScale - 1) * a),
    outerOffset: scatter.outerOffset * a,
    innerRotate: beat.innerRotate + scatter.innerRotate * a,
    innerScale: beat.innerScale * (1 + (scatter.innerScale - 1) * a),
    innerOpacity: beat.innerOpacity * (1 + (scatter.innerOpacity - 1) * a),
  };
}

/** Pull to refresh: nothing at rest, fully visible by 30% of the trigger distance. */
export const PULL_FADE_END = 0.3;
export function pullOpacity(pull: number): number {
  'worklet';
  const k = Math.min(Math.max(pull / PULL_FADE_END, 0), 1);
  // Smoothstep, so the first pixels of pull do not pop.
  return k * k * (3 - 2 * k);
}

/** Overpull past the trigger point grows the locked logo a little, with resistance. */
export const OVERPULL_MAX = 0.1;
export function overpullScale(pull: number): number {
  'worklet';
  const over = Math.max(pull - 1, 0);
  return 1 + (OVERPULL_MAX * over) / (over + 0.5);
}

/**
 * How much bigger than the mark a canvas must be so a pose reaching `radius`
 * viewBox units from the centre is never clipped (1 = the mark's own box).
 */
export function bleedFor(radius: number): number {
  return Math.max(1, radius / (VIEWBOX_SIZE / 2));
}

/** Largest radius a scattered piece reaches: outer scale and push at full scatter. */
export function scatterRadius(f: ScatterFrame, extraScale = 1): number {
  return (MARK_RADIUS * Math.max(f.outerScale, 1) + Math.abs(f.outerOffset)) * extraScale;
}
