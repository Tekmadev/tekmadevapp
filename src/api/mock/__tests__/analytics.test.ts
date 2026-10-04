import { api, setAuthBridge } from '@/api/client';
import { analyticsQuery, getAnalytics } from '@/api/endpoints/analytics';
import { ApiError } from '@/api/errors';
import { analyticsMock, metaFixture } from '@/api/mock/fixtures/analytics';
import { ANALYTICS_RANGES, metaFragment, zAnalytics, type Analytics, type AnalyticsRange } from '@/api/schemas/analytics';
import { addDays, todayToronto, weekdayOf } from '@/lib/dates';

/**
 * The analytics domain through the real mock transport: one response per range,
 * the bucket shapes the chart expects (local labels, never offsets), totals that
 * agree with the series and the top lists, the comparison rules, and the empty state.
 */

let token = '';
const asOwner = () => {
  token = `mock.usr_owner01.${Date.now() + 3_600_000}`;
};
const asManager = () => {
  token = `mock.usr_mgr01.${Date.now() + 3_600_000}`;
};
const asStaff = () => {
  token = `mock.usr_staff01.${Date.now() + 3_600_000}`;
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
});
beforeEach(() => {
  asOwner();
  analyticsMock.reset();
});

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

const SHAPES: Record<AnalyticsRange, { bucket: Analytics['bucket']; points?: number; t: RegExp; label: RegExp }> = {
  '24h': { bucket: 'hour', points: 24, t: /^\d{4}-\d{2}-\d{2}T\d{2}:00:00$/, label: /^(1[0-2]|[1-9]) (AM|PM)$/ },
  '7d': { bucket: 'day', points: 7, t: /^\d{4}-\d{2}-\d{2}$/, label: /^[A-Z][a-z]{2} \d{1,2}$/ },
  '30d': { bucket: 'day', points: 30, t: /^\d{4}-\d{2}-\d{2}$/, label: /^[A-Z][a-z]{2} \d{1,2}$/ },
  '3m': { bucket: 'week', points: 13, t: /^\d{4}-\d{2}-\d{2}$/, label: /^Week of [A-Z][a-z]{2} \d{1,2}(, \d{4})?$/ },
  '6m': { bucket: 'week', points: 26, t: /^\d{4}-\d{2}-\d{2}$/, label: /^Week of [A-Z][a-z]{2} \d{1,2}(, \d{4})?$/ },
  '1y': { bucket: 'month', points: 12, t: /^\d{4}-\d{2}-01$/, label: /^[A-Z][a-z]{2} \d{4}$/ },
  all: { bucket: 'month', t: /^\d{4}-\d{2}-01$/, label: /^[A-Z][a-z]{2} \d{4}$/ },
};

const sum = (rows: { count: number }[]) => rows.reduce((a, r) => a + r.count, 0);

describe('meta fragment', () => {
  it('matches its (empty) schema', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
    expect(ANALYTICS_RANGES.map((r) => r.label)).toEqual(['24 hours', '7 days', '30 days', '3 months', '6 months', '1 year', 'All time']);
  });
});

describe('GET /analytics', () => {
  it.each(Object.keys(SHAPES) as AnalyticsRange[])('returns the %s shape', async (range) => {
    const data = await getAnalytics(range);
    expect(zAnalytics.safeParse(data).success).toBe(true);
    const shape = SHAPES[range];
    expect(data.range).toBe(range);
    expect(data.bucket).toBe(shape.bucket);
    if (shape.points) expect(data.series).toHaveLength(shape.points);
    expect(data.series.every((p) => shape.t.test(p.t) && shape.label.test(p.label) && p.title.length > 0)).toBe(true);
    // Points are in order and the last one is the current bucket.
    expect(data.series.every((p, i) => i === 0 || data.series[i - 1].t < p.t)).toBe(true);
    expect(data.total).toBe(sum(data.series));
    expect(data.total).toBeGreaterThan(0);
    // Every pageview has a source, a device and a country; the other top lists never exceed the total.
    expect(sum(data.topSources)).toBe(data.total);
    expect(sum(data.devices)).toBe(data.total);
    expect(sum(data.countries)).toBe(data.total);
    expect(sum(data.topPages)).toBeLessThanOrEqual(data.total);
    expect(sum(data.topReferrers)).toBeLessThanOrEqual(data.total);
    expect(data.topPages.length).toBeLessThanOrEqual(10);
    expect(data.countries[0]).toMatchObject({ label: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' });
    for (const list of [data.topSources, data.devices, data.topPages, data.countries, data.topReferrers]) {
      expect(list.every((r, i) => r.count > 0 && (i === 0 || list[i - 1].count >= r.count))).toBe(true);
    }
    // The busiest bucket is the biggest point.
    const max = Math.max(...data.series.map((p) => p.count));
    expect(data.peak?.count).toBe(max);
    expect(data.series.some((p) => p.label === data.peak?.label && p.count === max)).toBe(true);
    expect(data.averagePer).toBe(range === '24h' ? 'hour' : 'day');
    expect(data.trackingSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('defaults to 30 days and is the same for managers and staff (analytics.view)', async () => {
    const plain = await api.get<Analytics>('/analytics');
    expect(plain.range).toBe('30d');
    asManager();
    const manager = await getAnalytics('30d');
    expect(manager.total).toBe(plain.total);
    expect(manager.series).toEqual(plain.series);
    asStaff();
    const staff = await getAnalytics('30d');
    expect(staff.series).toEqual(plain.series);
  });

  it('compares with the period before only when that period was tracked', async () => {
    for (const range of ['24h', '7d', '30d', '3m', '6m'] as const) {
      const data = await getAnalytics(range);
      expect(data.prevTotal).toEqual(expect.any(Number));
      expect(data.change).toBeCloseTo((data.total - (data.prevTotal ?? 0)) / (data.prevTotal ?? 1), 3);
    }
    for (const range of ['1y', 'all'] as const) {
      const data = await getAnalytics(range);
      expect(data.prevTotal).toBeNull();
      expect(data.change).toBeNull();
    }
    const all = await getAnalytics('all');
    // "All time" starts in the month tracking started.
    expect(all.series[0].t.slice(0, 7)).toBe(all.trackingSince?.slice(0, 7));
  });

  it('looks like a local agency site: 60 to 220 a day, busier on weekdays', async () => {
    const data = await getAnalytics('30d');
    const today = todayToronto();
    const full = data.series.filter((p) => p.t !== today);
    // Spikes (a blog post doing well) may go higher; quiet Sundays may dip lower.
    const typical = full.filter((p) => p.count >= 55 && p.count <= 240);
    expect(typical.length).toBeGreaterThanOrEqual(full.length - 3);
    const avg = (rows: { count: number }[]) => sum(rows) / Math.max(rows.length, 1);
    const weekend = full.filter((p) => [0, 6].includes(weekdayOf(p.t)));
    const weekday = full.filter((p) => ![0, 6].includes(weekdayOf(p.t)));
    expect(avg(weekday)).toBeGreaterThan(avg(weekend) * 1.4);
    // Days are consecutive Toronto dates ending today.
    expect(data.series[data.series.length - 1].t).toBe(today);
    expect(data.series[0].t).toBe(addDays(today, -29));
  });

  it('is stable: the same range gives the same numbers', async () => {
    const a = await getAnalytics('6m');
    const b = await getAnalytics('6m');
    expect(b.series.slice(0, -1)).toEqual(a.series.slice(0, -1));
  });

  it('shows nothing (not zeros in the lists) when nothing was tracked', async () => {
    analyticsMock.setEmpty(true);
    const data = await getAnalytics('7d');
    expect(zAnalytics.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({ total: 0, prevTotal: null, change: null, peak: null, trackingSince: null, topSources: [], devices: [], topPages: [], countries: [], topReferrers: [] });
    expect(data.series).toHaveLength(7);
  });

  it('rejects an unknown range', async () => {
    const e = await apiError(api.get('/analytics', { query: { range: '2w' } }));
    expect([e.status, e.code, e.message]).toEqual([400, 'range', 'Unknown range. Use 24h, 7d, 30d, 3m, 6m, 1y or all.']);
  });

  it('builds query options keyed by range', () => {
    expect(analyticsQuery('7d').queryKey).toEqual(['analytics', '7d']);
    expect(analyticsQuery().queryKey).toEqual(['analytics', '30d']);
  });
});
