import {
  beatFrame,
  cubicBezier,
  degToRad,
  easeBeatAt,
  INNER_END_DEG,
  INNER_PEAK_DEG,
  KEY_PEAK,
  KEY_REST,
  OUTER_END_DEG,
  OUTER_PEAK_DEG,
  reducedOpacity,
  scatterFrame,
  wrapProgress,
  type BeatFrame,
  type BeatParams,
} from '@/loader/keyframes';

/**
 * Reference CSS cubic-bezier: plain bisection on the curve parameter, slow but
 * obviously right. The production solver (Newton with a bisection fallback) must agree.
 */
function referenceBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const t = (lo + hi) / 2;
    const xt = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
    if (xt < x) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}

/** The default settings from brief section 5. */
const PARAMS: BeatParams = { innerPull: 0.72, outerPull: 0.9, innerFade: 0.7 };

const REST_START: BeatFrame = { outerRotate: 0, outerScale: 1, innerRotate: 0, innerScale: 1, innerOpacity: 1 };
const REST_END: BeatFrame = { outerRotate: -180, outerScale: 1, innerRotate: 360, innerScale: 1, innerOpacity: 1 };

const samples = (from: number, to: number, steps: number) =>
  Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);

/** Angles that draw the same logo: it is 180 degree rotationally symmetric. */
const samePose = (a: number, b: number) => ((((a - b) % 180) + 180) % 180) === 0;

describe('cubicBezier', () => {
  it('matches known CSS timing values', () => {
    // ease, ease-in, ease-out at the midpoint (as computed by browsers).
    expect(cubicBezier(0.25, 0.1, 0.25, 1, 0.5)).toBeCloseTo(0.8024, 4);
    expect(cubicBezier(0.25, 0.1, 0.25, 1, 0.25)).toBeCloseTo(0.4085, 4);
    expect(cubicBezier(0.42, 0, 1, 1, 0.5)).toBeCloseTo(0.3154, 4);
    expect(cubicBezier(0, 0, 0.58, 1, 0.5)).toBeCloseTo(0.6846, 4);
  });

  it('agrees with a reference solver across the whole curve', () => {
    const curves: [number, number, number, number][] = [
      [0.25, 0.1, 0.25, 1],
      [0.42, 0, 0.58, 1],
      [0.55, 0, 0.2, 1],
      [0.2, 0, 0, 1],
      [0.1, 0.6, 0.2, 1],
      // Overshooting y values must work too.
      [0.68, -0.55, 0.27, 1.55],
    ];
    for (const [x1, y1, x2, y2] of curves) {
      for (const x of samples(0, 1, 50)) {
        expect(cubicBezier(x1, y1, x2, y2, x)).toBeCloseTo(referenceBezier(x1, y1, x2, y2, x), 5);
      }
    }
  });

  it('is the identity for linear (within the solver tolerance of 1e-6)', () => {
    for (const x of samples(0, 1, 20)) {
      expect(cubicBezier(0, 0, 1, 1, x)).toBeCloseTo(x, 5);
    }
  });

  it('pins the endpoints and clamps outside [0, 1]', () => {
    expect(cubicBezier(0.55, 0, 0.2, 1, 0)).toBe(0);
    expect(cubicBezier(0.55, 0, 0.2, 1, 1)).toBe(1);
    expect(cubicBezier(0.55, 0, 0.2, 1, -0.5)).toBe(0);
    expect(cubicBezier(0.55, 0, 0.2, 1, 1.5)).toBe(1);
  });

  it('is symmetric for ease-in-out', () => {
    expect(cubicBezier(0.42, 0, 0.58, 1, 0.5)).toBeCloseTo(0.5, 6);
    for (const x of samples(0, 1, 20)) {
      expect(cubicBezier(0.42, 0, 0.58, 1, x) + cubicBezier(0.42, 0, 0.58, 1, 1 - x)).toBeCloseTo(1, 5);
    }
  });

  it('easeBeatAt is the brief curve cubic-bezier(0.55, 0, 0.2, 1) and only goes forward', () => {
    expect(easeBeatAt(0.5)).toBeCloseTo(referenceBezier(0.55, 0, 0.2, 1, 0.5), 6);
    let previous = -Infinity;
    for (const x of samples(0, 1, 200)) {
      const y = easeBeatAt(x);
      expect(y).toBeGreaterThanOrEqual(previous);
      previous = y;
    }
  });
});

describe('beatFrame keyframes', () => {
  it('starts at the logo (p = 0)', () => {
    expect(beatFrame(0, PARAMS)).toEqual(REST_START);
  });

  it('hits the peak exactly at p = 0.32', () => {
    expect(KEY_PEAK).toBe(0.32);
    expect(beatFrame(0.32, PARAMS)).toEqual({
      outerRotate: OUTER_PEAK_DEG,
      outerScale: PARAMS.outerPull,
      innerRotate: INNER_PEAK_DEG,
      innerScale: PARAMS.innerPull,
      innerOpacity: PARAMS.innerFade,
    });
    expect(OUTER_PEAK_DEG).toBe(-80);
    expect(INNER_PEAK_DEG).toBe(200);
  });

  it('holds the rest pose from 0.62 to 1', () => {
    expect(KEY_REST).toBe(0.62);
    expect(OUTER_END_DEG).toBe(-180);
    expect(INNER_END_DEG).toBe(360);
    for (const p of [0.62, 0.7, 0.8, 0.9, 0.999, 1]) {
      expect(beatFrame(p, PARAMS)).toEqual(REST_END);
    }
  });

  it('is eased per segment at p = 0.16 (halfway into the pull)', () => {
    const e = referenceBezier(0.55, 0, 0.2, 1, 0.5);
    const f = beatFrame(0.16, PARAMS);
    expect(f.outerRotate).toBeCloseTo(-80 * e, 4);
    expect(f.innerRotate).toBeCloseTo(200 * e, 4);
    expect(f.outerScale).toBeCloseTo(1 + (PARAMS.outerPull - 1) * e, 6);
    expect(f.innerScale).toBeCloseTo(1 + (PARAMS.innerPull - 1) * e, 6);
    expect(f.innerOpacity).toBeCloseTo(1 + (PARAMS.innerFade - 1) * e, 6);
  });

  it('is eased per segment at p = 0.47 (halfway into the release)', () => {
    const e = referenceBezier(0.55, 0, 0.2, 1, 0.5);
    const f = beatFrame(0.47, PARAMS);
    expect(f.outerRotate).toBeCloseTo(-80 + (-180 - -80) * e, 4);
    expect(f.innerRotate).toBeCloseTo(200 + (360 - 200) * e, 4);
    expect(f.outerScale).toBeCloseTo(PARAMS.outerPull + (1 - PARAMS.outerPull) * e, 6);
    expect(f.innerScale).toBeCloseTo(PARAMS.innerPull + (1 - PARAMS.innerPull) * e, 6);
    expect(f.innerOpacity).toBeCloseTo(PARAMS.innerFade + (1 - PARAMS.innerFade) * e, 6);
  });

  it('is continuous into the peak and into the rest', () => {
    const beforePeak = beatFrame(KEY_PEAK - 1e-9, PARAMS);
    expect(beforePeak.outerRotate).toBeCloseTo(OUTER_PEAK_DEG, 3);
    expect(beforePeak.innerRotate).toBeCloseTo(INNER_PEAK_DEG, 3);
    expect(beforePeak.innerScale).toBeCloseTo(PARAMS.innerPull, 4);
    const beforeRest = beatFrame(KEY_REST - 1e-9, PARAMS);
    expect(beforeRest.outerRotate).toBeCloseTo(OUTER_END_DEG, 3);
    expect(beforeRest.innerRotate).toBeCloseTo(INNER_END_DEG, 3);
    expect(beforeRest.innerOpacity).toBeCloseTo(1, 4);
  });

  it('rotates monotonically within each segment (outer counterclockwise, inner clockwise)', () => {
    for (const [from, to] of [
      [0, KEY_PEAK],
      [KEY_PEAK, KEY_REST],
    ]) {
      let outer = Infinity;
      let inner = -Infinity;
      for (const p of samples(from, to, 100)) {
        const f = beatFrame(p, PARAMS);
        expect(f.outerRotate).toBeLessThanOrEqual(outer);
        expect(f.innerRotate).toBeGreaterThanOrEqual(inner);
        outer = f.outerRotate;
        inner = f.innerRotate;
      }
    }
  });

  it('pulls in, then releases (scale and fade)', () => {
    let previous = beatFrame(0, PARAMS);
    for (const p of samples(0, KEY_PEAK, 50).slice(1)) {
      const f = beatFrame(p, PARAMS);
      expect(f.innerScale).toBeLessThanOrEqual(previous.innerScale);
      expect(f.outerScale).toBeLessThanOrEqual(previous.outerScale);
      expect(f.innerOpacity).toBeLessThanOrEqual(previous.innerOpacity);
      previous = f;
    }
    for (const p of samples(KEY_PEAK, KEY_REST, 50).slice(1)) {
      const f = beatFrame(p, PARAMS);
      expect(f.innerScale).toBeGreaterThanOrEqual(previous.innerScale);
      expect(f.outerScale).toBeGreaterThanOrEqual(previous.outerScale);
      expect(f.innerOpacity).toBeGreaterThanOrEqual(previous.innerOpacity);
      previous = f;
    }
  });

  it('uses the given settings, not the defaults', () => {
    const hard: BeatParams = { innerPull: 0.5, outerPull: 0.75, innerFade: 0.2 };
    const f = beatFrame(KEY_PEAK, hard);
    expect(f.innerScale).toBe(0.5);
    expect(f.outerScale).toBe(0.75);
    expect(f.innerOpacity).toBe(0.2);
  });

  it('clamps progress outside one beat to the rest poses', () => {
    expect(beatFrame(-0.2, PARAMS)).toEqual(REST_START);
    expect(beatFrame(1.4, PARAMS)).toEqual(REST_END);
  });
});

describe('seamless loop', () => {
  it('ends where it holds: the frame at p = 1 is the rest pose', () => {
    expect(beatFrame(1, PARAMS)).toEqual(beatFrame(KEY_REST, PARAMS));
  });

  it('lands on the original logo: -180 outer and +360 inner are the start pose by symmetry', () => {
    const end = beatFrame(1, PARAMS);
    const start = beatFrame(0, PARAMS);
    expect(samePose(end.outerRotate, start.outerRotate)).toBe(true);
    expect(samePose(end.innerRotate, start.innerRotate)).toBe(true);
    expect(end.outerScale).toBe(start.outerScale);
    expect(end.innerScale).toBe(start.innerScale);
    expect(end.innerOpacity).toBe(start.innerOpacity);
    // Sanity check of the helper: the peak is not a symmetric pose.
    expect(samePose(OUTER_PEAK_DEG, 0)).toBe(false);
  });

  it('wraps a running clock into one beat', () => {
    expect(wrapProgress(0)).toBe(0);
    expect(wrapProgress(0.25)).toBe(0.25);
    expect(wrapProgress(1)).toBe(0);
    expect(wrapProgress(3.5)).toBe(0.5);
    expect(wrapProgress(-0.25)).toBe(0.75);
    expect(beatFrame(wrapProgress(2.32), PARAMS).innerRotate).toBeCloseTo(INNER_PEAK_DEG, 3);
  });
});

describe('reducedOpacity', () => {
  it('fades 1, 0.4, 1 over one cycle', () => {
    expect(reducedOpacity(0)).toBe(1);
    expect(reducedOpacity(0.5)).toBe(0.4);
    expect(reducedOpacity(1)).toBe(1);
  });

  it('eases in and out symmetrically, never leaving [0.4, 1]', () => {
    expect(reducedOpacity(0.25)).toBeCloseTo(0.7, 6);
    expect(reducedOpacity(0.75)).toBeCloseTo(0.7, 6);
    for (const p of samples(0, 1, 100)) {
      const o = reducedOpacity(p);
      expect(o).toBeGreaterThanOrEqual(0.4 - 1e-9);
      expect(o).toBeLessThanOrEqual(1 + 1e-9);
      expect(o).toBeCloseTo(reducedOpacity(1 - p), 5);
    }
  });

  it('repeats every cycle', () => {
    expect(reducedOpacity(1.25)).toBeCloseTo(reducedOpacity(0.25), 9);
    expect(reducedOpacity(-0.5)).toBeCloseTo(0.4, 9);
  });
});

describe('scatterFrame (pull to refresh)', () => {
  it('is fully scattered at no pull', () => {
    expect(scatterFrame(0)).toEqual({
      outerRotate: -70,
      outerScale: 1.18,
      outerOffset: 260,
      innerRotate: 150,
      innerScale: 0.55,
      innerOpacity: 0,
    });
  });

  it('locks into the logo at full pull, the same pose the beat starts from', () => {
    const { outerOffset, ...pose } = scatterFrame(1);
    expect(outerOffset).toBe(0);
    expect(pose).toEqual(beatFrame(0, PARAMS));
  });

  it('clamps the pull to [0, 1]', () => {
    expect(scatterFrame(-1)).toEqual(scatterFrame(0));
    expect(scatterFrame(3)).toEqual(scatterFrame(1));
  });

  it('comes together steadily as the pull grows', () => {
    let previous = scatterFrame(0);
    for (const k of samples(0, 1, 50).slice(1)) {
      const f = scatterFrame(k);
      expect(f.outerOffset).toBeLessThanOrEqual(previous.outerOffset);
      expect(f.innerOpacity).toBeGreaterThanOrEqual(previous.innerOpacity);
      expect(f.innerScale).toBeGreaterThanOrEqual(previous.innerScale);
      expect(f.outerRotate).toBeGreaterThanOrEqual(previous.outerRotate);
      expect(f.innerRotate).toBeLessThanOrEqual(previous.innerRotate);
      previous = f;
    }
  });
});

describe('degToRad', () => {
  it('converts for Skia transforms', () => {
    expect(degToRad(0)).toBe(0);
    expect(degToRad(180)).toBeCloseTo(Math.PI, 12);
    expect(degToRad(-90)).toBeCloseTo(-Math.PI / 2, 12);
    expect(degToRad(360)).toBeCloseTo(2 * Math.PI, 12);
  });
});
