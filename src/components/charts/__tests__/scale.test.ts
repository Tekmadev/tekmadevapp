import {
  compactNumber,
  formatCount,
  formatShare,
  layoutSeries,
  monotoneSegments,
  nearestIndex,
  niceScale,
  summarizeSeries,
  summarizeShares,
  topWithOther,
} from '../scale';

describe('number formatting', () => {
  it('groups counts', () => {
    expect(formatCount(3412)).toBe('3,412');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('compacts axis labels', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(950)).toBe('950');
    expect(compactNumber(1000)).toBe('1K');
    expect(compactNumber(1200)).toBe('1.2K');
    expect(compactNumber(12_000)).toBe('12K');
    expect(compactNumber(240_000)).toBe('240K');
    expect(compactNumber(1_250_000)).toBe('1.3M');
    expect(compactNumber(2.5)).toBe('2.5');
    // Rounding never prints a unit's own ceiling.
    expect(compactNumber(999_499)).toBe('999K');
    expect(compactNumber(999_600)).toBe('1M');
    expect(compactNumber(999_960_000)).toBe('1B');
  });

  it('shows shares as whole percents, with <1% for slivers', () => {
    expect(formatShare(42, 100)).toBe('42%');
    expect(formatShare(1, 300)).toBe('<1%');
    expect(formatShare(0, 300)).toBe('0%');
    expect(formatShare(5, 0)).toBe('0%');
  });
});

describe('niceScale', () => {
  it('keeps the top gridline close to the peak', () => {
    expect(niceScale(214, 3)).toEqual({ step: 80, max: 240 });
    expect(niceScale(3412, 3)).toEqual({ step: 1500, max: 4500 });
    expect(niceScale(90, 3)).toEqual({ step: 30, max: 90 });
  });

  it('never steps under 1 for whole counts', () => {
    expect(niceScale(2, 3)).toEqual({ step: 1, max: 3 });
    expect(niceScale(0, 3)).toEqual({ step: 1, max: 3 });
  });

  it('allows fractional steps for fractional data', () => {
    const { step, max } = niceScale(0.9, 3, false);
    expect(step).toBeCloseTo(0.3);
    expect(max).toBeGreaterThanOrEqual(0.9);
  });
});

describe('layoutSeries', () => {
  const insets = { top: 18, bottom: 8, left: 8, right: 8 };

  it('spreads points evenly and maps 0 to the baseline', () => {
    const l = layoutSeries([0, 120, 240], 216, 180, insets);
    expect(l.xs).toEqual([8, 108, 208]);
    expect(l.baseline).toBe(172);
    expect(l.ys[0]).toBe(172);
    expect(l.ys[2]).toBe(18);
    expect(l.grid.map((g) => g.value)).toEqual([80, 160, 240]);
  });

  it('centres a single point', () => {
    const l = layoutSeries([5], 216, 180, insets);
    expect(l.xs).toEqual([108]);
  });
});

describe('nearestIndex', () => {
  it('snaps to the nearest evenly spaced point and clamps', () => {
    expect(nearestIndex(8, 3, 8, 200)).toBe(0);
    expect(nearestIndex(60, 3, 8, 200)).toBe(1);
    expect(nearestIndex(500, 3, 8, 200)).toBe(2);
    expect(nearestIndex(-40, 3, 8, 200)).toBe(0);
    expect(nearestIndex(100, 1, 8, 200)).toBe(0);
  });
});

describe('monotoneSegments', () => {
  it('never overshoots between points', () => {
    const xs = [0, 10, 20, 30, 40];
    const ys = [100, 100, 0, 0, 50];
    const segs = monotoneSegments(xs, ys);
    expect(segs).toHaveLength(4);
    for (let i = 0; i < segs.length; i++) {
      const lo = Math.min(ys[i], ys[i + 1]);
      const hi = Math.max(ys[i], ys[i + 1]);
      expect(segs[i].c1y).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(segs[i].c1y).toBeLessThanOrEqual(hi + 1e-9);
      expect(segs[i].c2y).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(segs[i].c2y).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('returns nothing for fewer than two points', () => {
    expect(monotoneSegments([0], [1])).toEqual([]);
  });
});

describe('topWithOther', () => {
  const rows = [
    { label: 'Google', count: 50 },
    { label: 'Direct', count: 30 },
    { label: 'Instagram', count: 10 },
    { label: 'Bing', count: 5 },
    { label: 'Zero', count: 0 },
  ];

  it('keeps the top rows and folds the rest into Other', () => {
    const out = topWithOther(rows, 2);
    expect(out.map((r) => r.label)).toEqual(['Google', 'Direct', 'Other']);
    expect(out[2]).toMatchObject({ count: 15, isOther: true });
  });

  it('keeps a single leftover row under its own name', () => {
    const out = topWithOther(rows, 3);
    expect(out.map((r) => r.label)).toEqual(['Google', 'Direct', 'Instagram', 'Bing']);
    expect(out.some((r) => r.isOther)).toBe(false);
  });

  it('drops zero rows', () => {
    expect(topWithOther(rows, 7).map((r) => r.label)).not.toContain('Zero');
  });
});

describe('TalkBack summaries', () => {
  it('summarises a series without parsing labels', () => {
    const data = [
      { label: 'Sep 11', value: 120 },
      { label: 'Sep 12', value: 214 },
      { label: 'Sep 13', value: 3078 - 3000 },
    ];
    expect(summarizeSeries({ name: 'Pageviews', period: 'last 30 days', data })).toBe(
      'Pageviews, last 30 days, total 412, peak 214 on Sep 12',
    );
  });

  it('prefers the long title for the peak', () => {
    const data = [{ label: '14:00', value: 9, title: 'Today, 2 PM' }];
    expect(summarizeSeries({ name: 'Pageviews', data })).toBe('Pageviews, total 9, peak 9 on Today, 2 PM');
  });

  it('says when there is nothing', () => {
    expect(summarizeSeries({ name: 'Pageviews', data: [] })).toBe('Pageviews, no data yet');
  });

  it('summarises shares', () => {
    expect(
      summarizeShares('Traffic sources', [
        { label: 'Google', count: 3 },
        { label: 'Direct', count: 1 },
      ]),
    ).toBe('Traffic sources, total 4: Google 75%, Direct 25%');
  });
});
