import {
  CLOSE_DISTANCE_MAX,
  CLOSE_VELOCITY,
  limitDrag,
  maxSheetHeight,
  nearestIndex,
  rubberBand,
  settleDrag,
  SHEET_TOP_GAP,
  snapHeights,
  snapOffsets,
} from '../sheetMath';

describe('maxSheetHeight', () => {
  it('caps a sheet at 92% of the window', () => {
    expect(maxSheetHeight(1000, 24)).toBe(920);
  });

  it('never reaches under the status bar on short windows', () => {
    expect(maxSheetHeight(400, 60)).toBe(400 - 60 - SHEET_TOP_GAP);
  });

  it('is never negative', () => {
    expect(maxSheetHeight(10, 40)).toBe(0);
  });
});

describe('snapHeights', () => {
  it('turns fractions into heights, shortest first', () => {
    expect(snapHeights([0.9, 0.5], 1000, 920)).toEqual([500, 900]);
  });

  it('clamps to the allowed range and drops duplicates', () => {
    expect(snapHeights([0.95, 1.2, 0.02], 1000, 920)).toEqual([100, 920]);
  });

  it('ignores junk and falls back to the tallest sheet', () => {
    expect(snapHeights([Number.NaN, Number.POSITIVE_INFINITY], 1000, 920)).toEqual([920]);
    expect(snapHeights([], 1000, 920)).toEqual([920]);
  });
});

describe('snapOffsets', () => {
  it('measures each resting place from the tallest one', () => {
    expect(snapOffsets([500, 900])).toEqual([0, 400]);
    expect(snapOffsets([700])).toEqual([0]);
    expect(snapOffsets([])).toEqual([0]);
  });
});

describe('rubberBand', () => {
  it('gives about half the pull at first and never passes the limit', () => {
    expect(rubberBand(0, 56)).toBe(0);
    expect(rubberBand(-10, 56)).toBe(0);
    expect(rubberBand(10, 56)).toBeGreaterThan(4);
    expect(rubberBand(10, 56)).toBeLessThan(6);
    expect(rubberBand(10_000, 56)).toBeLessThan(56);
  });

  it('grows with the pull', () => {
    expect(rubberBand(40, 56)).toBeGreaterThan(rubberBand(20, 56));
  });
});

describe('nearestIndex', () => {
  it('finds the closest value', () => {
    expect(nearestIndex([0, 400], 150)).toBe(0);
    expect(nearestIndex([0, 400], 250)).toBe(1);
    expect(nearestIndex([0], 900)).toBe(0);
  });
});

describe('limitDrag', () => {
  const offsets = [0, 400];

  it('passes drags between the limits through', () => {
    expect(limitDrag(120, offsets, true, true, 56)).toBe(120);
  });

  it('rubber-bands above the top, or stops there for a scroll body', () => {
    const banded = limitDrag(-100, offsets, true, true, 56);
    expect(banded).toBeLessThan(0);
    expect(banded).toBeGreaterThan(-56);
    expect(limitDrag(-100, offsets, true, false, 56)).toBe(0);
  });

  it('lets a dismissible sheet go below its lowest point, and resists when it is not', () => {
    expect(limitDrag(700, offsets, true, true, 56)).toBe(700);
    const held = limitDrag(700, offsets, false, true, 56);
    expect(held).toBeGreaterThan(400);
    expect(held).toBeLessThan(456);
  });
});

describe('settleDrag', () => {
  const offsets = [0, 400];
  const height = 900;

  it('settles on the nearest snap point', () => {
    expect(settleDrag(120, 0, offsets, height, true)).toEqual({ close: false, index: 0, target: 0 });
    expect(settleDrag(300, 0, offsets, height, true)).toEqual({ close: false, index: 1, target: 400 });
  });

  it('lets a fling carry it to the next snap point', () => {
    expect(settleDrag(150, 2000, offsets, height, true)).toMatchObject({ close: false, index: 1 });
    expect(settleDrag(300, -2000, offsets, height, true)).toMatchObject({ close: false, index: 0 });
  });

  it('closes when dragged far enough below the lowest point', () => {
    expect(settleDrag(400 + CLOSE_DISTANCE_MAX + 1, 0, offsets, height, true)).toEqual({ close: true });
  });

  it('closes on a fast fling down near the bottom', () => {
    expect(settleDrag(410, CLOSE_VELOCITY + 1, offsets, height, true)).toEqual({ close: true });
  });

  it('does not close when the finger is already moving back up', () => {
    expect(settleDrag(400 + CLOSE_DISTANCE_MAX + 1, -800, offsets, height, true)).toMatchObject({ close: false });
  });

  it('never closes a sheet that cannot be dismissed', () => {
    expect(settleDrag(800, 5000, offsets, height, false)).toEqual({ close: false, index: 1, target: 400 });
  });

  it('uses a share of a short content sheet as the distance', () => {
    // A 200dp sheet closes after 30% of it (60dp), well before the 160dp cap.
    expect(settleDrag(70, 0, [0], 200, true)).toEqual({ close: true });
    expect(settleDrag(50, 0, [0], 200, true)).toEqual({ close: false, index: 0, target: 0 });
  });
});
