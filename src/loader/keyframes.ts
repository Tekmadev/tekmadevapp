/**
 * The black hole beat (brief section 5), as pure math that runs on the UI thread.
 *
 * One beat is a linear progress p in [0, 1]. Keyframes:
 *
 * | p           | outer arcs (paths 2, 3)          | inner hooks (paths 1, 4)                          |
 * |-------------|----------------------------------|---------------------------------------------------|
 * | 0           | rotate 0deg, scale 1             | rotate 0deg, scale 1, opacity 1                   |
 * | 0.32        | rotate -80deg, scale outerPull   | rotate +200deg, scale innerPull, opacity innerFade |
 * | 0.62 .. 1   | rotate -180deg, scale 1 (held)   | rotate +360deg, scale 1, opacity 1 (held)         |
 *
 * Easing is cubic-bezier(0.55, 0, 0.2, 1) applied per segment, like CSS keyframes.
 * Positive rotation is clockwise. -180deg outer and +360deg inner both land on the
 * original logo (it is 180 degree symmetric), so the loop is seamless.
 */

export const KEY_PEAK = 0.32;
export const KEY_REST = 0.62;

export const OUTER_PEAK_DEG = -80;
export const OUTER_END_DEG = -180;
export const INNER_PEAK_DEG = 200;
export const INNER_END_DEG = 360;

export type BeatParams = { innerPull: number; outerPull: number; innerFade: number };

export type BeatFrame = {
  /** Degrees, positive is clockwise. */
  outerRotate: number;
  outerScale: number;
  innerRotate: number;
  innerScale: number;
  innerOpacity: number;
};

/**
 * CSS cubic-bezier(x1, y1, x2, y2) evaluated at time x in [0, 1].
 * Newton-Raphson with a bisection fallback, the same approach browsers use.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  let t = x;
  for (let i = 0; i < 8; i++) {
    const xt = ((ax * t + bx) * t + cx) * t - x;
    if (Math.abs(xt) < 1e-6) {
      return ((ay * t + by) * t + cy) * t;
    }
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(d) < 1e-6) break;
    t -= xt / d;
  }
  // Bisection fallback.
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 30; i++) {
    const xt = ((ax * t + bx) * t + cx) * t;
    if (Math.abs(xt - x) < 1e-6) break;
    if (xt < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return ((ay * t + by) * t + cy) * t;
}

/** The beat easing: cubic-bezier(0.55, 0, 0.2, 1). */
export function easeBeatAt(x: number): number {
  'worklet';
  return cubicBezier(0.55, 0, 0.2, 1, x);
}

function mix(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}

/** Wrap any progress into [0, 1) so a repeating clock can be passed directly. */
export function wrapProgress(p: number): number {
  'worklet';
  const w = p - Math.floor(p);
  return w < 0 ? w + 1 : w;
}

/** The pose of every piece at progress p (0..1) of one beat. */
export function beatFrame(p: number, params: BeatParams): BeatFrame {
  'worklet';
  if (p <= 0) {
    return { outerRotate: 0, outerScale: 1, innerRotate: 0, innerScale: 1, innerOpacity: 1 };
  }
  if (p < KEY_PEAK) {
    const t = easeBeatAt(p / KEY_PEAK);
    return {
      outerRotate: mix(0, OUTER_PEAK_DEG, t),
      outerScale: mix(1, params.outerPull, t),
      innerRotate: mix(0, INNER_PEAK_DEG, t),
      innerScale: mix(1, params.innerPull, t),
      innerOpacity: mix(1, params.innerFade, t),
    };
  }
  if (p < KEY_REST) {
    const t = easeBeatAt((p - KEY_PEAK) / (KEY_REST - KEY_PEAK));
    return {
      outerRotate: mix(OUTER_PEAK_DEG, OUTER_END_DEG, t),
      outerScale: mix(params.outerPull, 1, t),
      innerRotate: mix(INNER_PEAK_DEG, INNER_END_DEG, t),
      innerScale: mix(params.innerPull, 1, t),
      innerOpacity: mix(params.innerFade, 1, t),
    };
  }
  return { outerRotate: OUTER_END_DEG, outerScale: 1, innerRotate: INNER_END_DEG, innerScale: 1, innerOpacity: 1 };
}

/**
 * Reduced motion: no rotation or scale. All four paths fade together,
 * opacity 1, 0.4, 1 over 1.6s, ease-in-out, forever. `p` is progress through that 1.6s cycle.
 */
export const REDUCED_CYCLE_MS = 1600;
export function reducedOpacity(p: number): number {
  'worklet';
  const x = wrapProgress(p);
  // ease-in-out: cubic-bezier(0.42, 0, 0.58, 1), down for the first half, back up for the second.
  const half = x < 0.5 ? x / 0.5 : (x - 0.5) / 0.5;
  const e = cubicBezier(0.42, 0, 0.58, 1, half);
  return x < 0.5 ? mix(1, 0.4, e) : mix(0.4, 1, e);
}

/**
 * Pull to refresh: the pieces start scattered and are pulled together in
 * proportion to the pull (0 = fully scattered, 1 = locked into the logo).
 * Outer arcs are rotated out and pushed away; inner hooks are rotated and faded.
 */
export type ScatterFrame = BeatFrame & { outerOffset: number };
export function scatterFrame(pull: number): ScatterFrame {
  'worklet';
  const k = Math.min(Math.max(pull, 0), 1);
  // Ease so the last stretch of the pull "snaps" together.
  const t = cubicBezier(0.2, 0, 0, 1, k);
  return {
    outerRotate: mix(-70, 0, t),
    outerScale: mix(1.18, 1, t),
    outerOffset: mix(260, 0, t),
    innerRotate: mix(150, 0, t),
    innerScale: mix(0.55, 1, t),
    innerOpacity: mix(0, 1, t),
  };
}

export const degToRad = (deg: number) => {
  'worklet';
  return (deg * Math.PI) / 180;
};
