import type { Notice } from '@/lib/notice';

import { overflowNotices, reconcileToasts, stackOffsets, TOAST_ESTIMATED_HEIGHT, TOAST_GAP } from '../toastStack';

const n = (id: number, message = `m${id}`): Notice => ({ id, tone: 'ok', message });

describe('reconcileToasts', () => {
  it('shows the newest first and at most two', () => {
    const items = reconcileToasts([], [n(1), n(2), n(3)]);
    expect(items.map((i) => [i.notice.id, i.leaving])).toEqual([
      [3, false],
      [2, false],
    ]);
  });

  it('keeps a dismissed toast as leaving, where it was', () => {
    const before = reconcileToasts([], [n(1), n(2)]);
    const after = reconcileToasts(before, [n(2)]);
    expect(after.map((i) => [i.notice.id, i.leaving])).toEqual([
      [2, false],
      [1, true],
    ]);
  });

  it('pushes the oldest out when a third arrives', () => {
    const before = reconcileToasts([], [n(1), n(2)]);
    const after = reconcileToasts(before, [n(1), n(2), n(3)]);
    expect(after.map((i) => [i.notice.id, i.leaving])).toEqual([
      [3, false],
      [2, false],
      [1, true],
    ]);
  });

  it('keeps leaving toasts until they are removed', () => {
    const one = reconcileToasts([], [n(1)]);
    const leaving = reconcileToasts(one, []);
    expect(leaving).toEqual([{ notice: n(1), leaving: true }]);
    expect(reconcileToasts(leaving, [])).toEqual([{ notice: n(1), leaving: true }]);
  });
});

describe('overflowNotices', () => {
  it('lists what fell out of the visible two', () => {
    expect(overflowNotices([n(1), n(2)])).toEqual([]);
    expect(overflowNotices([n(1), n(2), n(3)]).map((x) => x.id)).toEqual([1]);
  });
});

describe('stackOffsets', () => {
  it('stacks measured heights with a gap and skips leaving toasts', () => {
    const items = [
      { notice: n(3), leaving: false },
      { notice: n(9), leaving: true },
      { notice: n(2), leaving: false },
      { notice: n(1), leaving: false },
    ];
    const offsets = stackOffsets(items, { 3: 70 });
    expect(offsets.get(3)).toBe(0);
    expect(offsets.has(9)).toBe(false);
    expect(offsets.get(2)).toBe(70 + TOAST_GAP);
    expect(offsets.get(1)).toBe(70 + TOAST_GAP + TOAST_ESTIMATED_HEIGHT + TOAST_GAP);
  });
});
