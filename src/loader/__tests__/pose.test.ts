import { beatFrame, degToRad, KEY_PEAK, scatterFrame, type BeatParams } from '@/loader/keyframes';
import { LOGO_CENTER, LOGO_PATHS } from '@/loader/logoPaths';
import {
  addScatter,
  beatPose,
  bleedFor,
  MARK_RADIUS,
  OUTER_PUSH,
  OVERPULL_MAX,
  overpullScale,
  PULL_FADE_END,
  pullOpacity,
  restPose,
  scatterPose,
  scatterRadius,
  VIEWBOX_SIZE,
} from '@/loader/pose';

const PARAMS: BeatParams = { innerPull: 0.72, outerPull: 0.9, innerFade: 0.7 };

type Point = [number, number];

/**
 * Flattens one logo path (only M, L, H, V, C and Z occur, absolute or relative)
 * into points, sampling each cubic finely. Good enough to measure the artwork.
 */
function flatten(d: string): Point[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const points: Point[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const num = () => parseFloat(tokens[i++] ?? '0');
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i] ?? '')) cmd = tokens[i++] ?? '';
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toLowerCase()) {
      case 'm': {
        const a = num();
        const b = num();
        x = rel ? x + a : a;
        y = rel ? y + b : b;
        startX = x;
        startY = y;
        points.push([x, y]);
        // Further pairs after a move are line segments.
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'l': {
        const a = num();
        const b = num();
        x = rel ? x + a : a;
        y = rel ? y + b : b;
        points.push([x, y]);
        break;
      }
      case 'h': {
        const a = num();
        x = rel ? x + a : a;
        points.push([x, y]);
        break;
      }
      case 'v': {
        const a = num();
        y = rel ? y + a : a;
        points.push([x, y]);
        break;
      }
      case 'c': {
        const v = [num(), num(), num(), num(), num(), num()] as const;
        const p1: Point = rel ? [x + v[0], y + v[1]] : [v[0], v[1]];
        const p2: Point = rel ? [x + v[2], y + v[3]] : [v[2], v[3]];
        const p3: Point = rel ? [x + v[4], y + v[5]] : [v[4], v[5]];
        for (let k = 1; k <= 64; k++) {
          const t = k / 64;
          const u = 1 - t;
          points.push([
            u * u * u * x + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * y + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
          ]);
        }
        x = p3[0];
        y = p3[1];
        break;
      }
      case 'z':
        x = startX;
        y = startY;
        break;
      default:
        throw new Error(`Unexpected path command ${cmd}`);
    }
  }
  return points;
}

const radiusOf = (points: Point[]) =>
  Math.max(...points.map(([px, py]) => Math.hypot(px - LOGO_CENTER.x, py - LOGO_CENTER.y)));

/** Area centroid of the flattened outline (shoelace formula). */
function centroid(points: Point[]): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < points.length; k++) {
    const [x0, y0] = points[k] as Point;
    const [x1, y1] = points[(k + 1) % points.length] as Point;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  return [cx / (6 * area), cy / (6 * area)];
}

const pathById = (id: 1 | 2 | 3 | 4) => {
  const piece = LOGO_PATHS.find((p) => p.id === id);
  if (!piece) throw new Error(`No path ${id}`);
  return flatten(piece.d);
};

describe('logo geometry constants', () => {
  it('MARK_RADIUS reaches the furthest point of any piece, with no more than a unit to spare', () => {
    const furthest = Math.max(...([1, 2, 3, 4] as const).map((id) => radiusOf(pathById(id))));
    expect(MARK_RADIUS).toBeGreaterThanOrEqual(furthest);
    expect(MARK_RADIUS - furthest).toBeLessThan(1.5);
  });

  it('OUTER_PUSH points from the centre toward the top outer arc, and the bottom arc is its twin', () => {
    expect(Math.hypot(OUTER_PUSH.x, OUTER_PUSH.y)).toBeCloseTo(1, 3);
    const toUnit = ([cx, cy]: Point): Point => {
      const dx = cx - LOGO_CENTER.x;
      const dy = cy - LOGO_CENTER.y;
      const n = Math.hypot(dx, dy);
      return [dx / n, dy / n];
    };
    const top = toUnit(centroid(pathById(2)));
    const bottom = toUnit(centroid(pathById(3)));
    // Within about a quarter of a degree.
    expect(top[0] * OUTER_PUSH.x + top[1] * OUTER_PUSH.y).toBeGreaterThan(0.9999);
    expect(bottom[0] * -OUTER_PUSH.x + bottom[1] * -OUTER_PUSH.y).toBeGreaterThan(0.9999);
  });
});

describe('poses', () => {
  it('restPose is the plain logo at an opacity', () => {
    expect(restPose()).toEqual({ outerA: [], outerB: [], inner: [], innerOpacity: 1, opacity: 1 });
    expect(restPose(0.4).opacity).toBe(0.4);
  });

  it('beatPose turns degrees into radians and moves both arcs together', () => {
    const f = beatFrame(KEY_PEAK, PARAMS);
    const pose = beatPose(f);
    expect(pose.outerA).toEqual([{ scale: 1 }, { rotate: degToRad(-80) }, { scale: 0.9 }]);
    expect(pose.outerB).toEqual(pose.outerA);
    expect(pose.inner).toEqual([{ scale: 1 }, { rotate: degToRad(200) }, { scale: 0.72 }]);
    expect(pose.innerOpacity).toBe(0.7);
    expect(pose.opacity).toBe(1);
  });

  it('beatPose applies a whole mark scale and opacity on top', () => {
    const pose = beatPose(beatFrame(0, PARAMS), 0.5, 0.25);
    expect(pose.outerA[0]).toEqual({ scale: 0.5 });
    expect(pose.inner[0]).toEqual({ scale: 0.5 });
    expect(pose.opacity).toBe(0.25);
  });

  it('scatterPose pushes the two arcs apart in opposite directions', () => {
    const f = scatterFrame(0);
    const pose = scatterPose(f);
    const dx = OUTER_PUSH.x * f.outerOffset;
    const dy = OUTER_PUSH.y * f.outerOffset;
    expect(pose.outerA[2]).toEqual({ translate: [dx, dy] });
    expect(pose.outerB[2]).toEqual({ translate: [-dx, -dy] });
    expect(pose.innerOpacity).toBe(0);
  });

  it('a full pull is the logo: no push, no turn, no scale', () => {
    const pose = scatterPose(scatterFrame(1));
    // A zero push can come out as -0, which draws the same, so compare numbers loosely.
    const flat = (t: object[]) => JSON.parse(JSON.stringify(t)) as unknown;
    expect(flat(pose.outerA)).toEqual([{ scale: 1 }, { rotate: 0 }, { translate: [0, 0] }, { scale: 1 }]);
    expect(flat(pose.outerB)).toEqual([{ scale: 1 }, { rotate: 0 }, { translate: [0, 0] }, { scale: 1 }]);
    expect(flat(pose.inner)).toEqual([{ scale: 1 }, { rotate: 0 }, { scale: 1 }]);
    expect(pose.innerOpacity).toBe(1);
  });
});

describe('addScatter (boot splash pull together)', () => {
  it('is just the beat at amount 0', () => {
    const beat = beatFrame(0.2, PARAMS);
    expect(addScatter(beat, scatterFrame(0.55), 0)).toEqual({ ...beat, outerOffset: 0 });
  });

  it('is the scatter pose at amount 1 over a resting beat', () => {
    const from = scatterFrame(0.55);
    const out = addScatter(beatFrame(0, PARAMS), from, 1);
    expect(out.outerRotate).toBeCloseTo(from.outerRotate, 9);
    expect(out.outerScale).toBeCloseTo(from.outerScale, 9);
    expect(out.outerOffset).toBeCloseTo(from.outerOffset, 9);
    expect(out.innerRotate).toBeCloseTo(from.innerRotate, 9);
    expect(out.innerScale).toBeCloseTo(from.innerScale, 9);
    expect(out.innerOpacity).toBeCloseTo(from.innerOpacity, 9);
  });

  it('clamps the amount', () => {
    const beat = beatFrame(0, PARAMS);
    const from = scatterFrame(0.55);
    expect(addScatter(beat, from, 2)).toEqual(addScatter(beat, from, 1));
    expect(addScatter(beat, from, -1)).toEqual(addScatter(beat, from, 0));
  });
});

describe('pull to refresh helpers', () => {
  it('shows nothing at rest or when pushed up, and everything by PULL_FADE_END', () => {
    expect(pullOpacity(0)).toBe(0);
    expect(pullOpacity(-0.4)).toBe(0);
    expect(pullOpacity(PULL_FADE_END)).toBe(1);
    expect(pullOpacity(2)).toBe(1);
    let previous = 0;
    for (let k = 0; k <= 30; k++) {
      const o = pullOpacity((k / 30) * PULL_FADE_END);
      expect(o).toBeGreaterThanOrEqual(previous);
      previous = o;
    }
  });

  it('overpull grows the locked logo a little, never past OVERPULL_MAX', () => {
    expect(overpullScale(0.5)).toBe(1);
    expect(overpullScale(1)).toBe(1);
    expect(overpullScale(1.5)).toBeGreaterThan(1);
    expect(overpullScale(3)).toBeGreaterThan(overpullScale(1.5));
    expect(overpullScale(1000)).toBeLessThan(1 + OVERPULL_MAX);
  });
});

describe('canvas bleed', () => {
  it('never shrinks the canvas below the mark', () => {
    expect(bleedFor(0)).toBe(1);
    expect(bleedFor(VIEWBOX_SIZE / 2)).toBe(1);
    expect(bleedFor(MARK_RADIUS)).toBeGreaterThan(1);
  });

  it('leaves room for the fully scattered pieces', () => {
    const f = scatterFrame(0);
    expect(scatterRadius(f)).toBeCloseTo(MARK_RADIUS * f.outerScale + f.outerOffset, 9);
    expect(scatterRadius(f, 1.1)).toBeCloseTo(scatterRadius(f) * 1.1, 9);
  });
});
