import { api, setAuthBridge } from '@/api/client';
import { adsQuery, getAds, refreshAds } from '@/api/endpoints/ads';
import { ApiError } from '@/api/errors';
import { adsMock, adsState, metaFixture } from '@/api/mock/fixtures/ads';
import { notificationRows } from '@/api/mock/fixtures/notifications';
import { ADS_RANGES, metaFragment, zAdsRefreshResult, zAdsReport, type AdsConnectedReport, type AdsRange, type AdsReport } from '@/api/schemas/ads';
import { addDays, todayToronto } from '@/lib/dates';

/**
 * The ads domain (owner only) through the real mock transport: every range adds
 * up (days, campaigns and ads against the totals), managers get 403, the long
 * refresh job succeeds twice then fails on every 3rd call with the documented
 * 502, the failure reaches the inbox, and the "not connected" state has no numbers.
 */

let token = '';
const asOwner = () => {
  token = `mock.usr_owner01.${Date.now() + 3_600_000}`;
};
const asManager = () => {
  token = `mock.usr_mgr01.${Date.now() + 3_600_000}`;
};

const ownerOnly = jest.fn();
beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token, ownerOnly });
});
beforeEach(() => {
  asOwner();
  adsMock.reset();
  ownerOnly.mockClear();
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

function connected(report: AdsReport): AdsConnectedReport {
  if (!report.connected) throw new Error('Expected a connected report');
  return report;
}

const cents = (rows: { spend: { amount: number } }[]) => rows.reduce((a, r) => a + r.spend.amount, 0);
const total = <K extends string>(rows: Record<K, number>[], key: K) => rows.reduce((a, r) => a + r[key], 0);

const DAYS: Record<AdsRange, number> = { '7d': 7, '14d': 14, '30d': 30, '3m': 90, all: 331 };

describe('meta fragment', () => {
  it('matches its schema', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
    expect(ADS_RANGES.map((r) => r.label)).toEqual(['7d', '14d', '30d', '3 months', 'All']);
  });
});

describe('GET /ads', () => {
  it.each(Object.keys(DAYS) as AdsRange[])('adds up for %s', async (range) => {
    const report = await getAds(range);
    expect(zAdsReport.safeParse(report).success).toBe(true);
    const r = connected(report);
    expect(r.range).toBe(range);

    // Consecutive Toronto days ending today ("All" is the last 12 months, from the first ad).
    const today = todayToronto();
    expect(r.days).toHaveLength(DAYS[range]);
    expect(r.days[r.days.length - 1].date).toBe(today);
    expect(r.days[0].date).toBe(addDays(today, -(DAYS[range] - 1)));

    // Days, campaigns and ads all add up to the totals.
    expect(cents(r.days)).toBe(r.totals.spend.amount);
    expect(cents(r.campaigns)).toBe(r.totals.spend.amount);
    expect(cents(r.ads)).toBe(r.totals.spend.amount);
    expect(r.days.reduce((a, d) => a + d.visits, 0)).toBe(r.outcomes.visits);
    expect(total(r.campaigns, 'leads')).toBe(r.outcomes.leads);
    expect(total(r.campaigns, 'booked')).toBe(r.outcomes.booked);
    expect(total(r.campaigns, 'sales')).toBe(r.outcomes.sales);
    expect(total(r.campaigns, 'linkClicks')).toBe(r.totals.linkClicks);
    expect(r.campaigns.reduce((a, c) => a + c.revenue.amount, 0)).toBe(r.outcomes.revenue.amount);
    for (const c of r.campaigns) {
      const inside = r.ads.filter((a) => a.campaignId === c.id);
      expect(inside.length).toBeGreaterThan(0);
      expect(cents(inside)).toBe(c.spend.amount);
      expect(total(inside, 'leads')).toBe(c.leads);
      expect(c.costPerLead?.amount ?? null).toBe(c.leads > 0 ? Math.round(c.spend.amount / c.leads) : null);
      expect(c.costPerSale?.amount ?? null).toBe(c.sales > 0 ? Math.round(c.spend.amount / c.sales) : null);
    }

    // Sorted by spend, highest first.
    expect(r.campaigns.every((c, i) => i === 0 || r.campaigns[i - 1].spend.amount >= c.spend.amount)).toBe(true);
    expect(r.ads.every((a, i) => i === 0 || r.ads[i - 1].spend.amount >= a.spend.amount)).toBe(true);

    // Derived numbers match what they are derived from.
    expect(r.totals.ctr).toBeCloseTo(r.totals.linkClicks / r.totals.impressions, 4);
    expect(r.totals.costPerLinkClick?.amount).toBe(Math.round(r.totals.spend.amount / r.totals.linkClicks));
    expect(r.outcomes.roas).toBeCloseTo(r.outcomes.revenue.amount / r.totals.spend.amount, 2);
    expect(r.cost.perLead?.amount).toBe(Math.round(r.totals.spend.amount / r.outcomes.leads));
    expect(r.totals.reach).toBeLessThan(r.totals.impressions);
    expect(r.outcomes.visits).toBeLessThanOrEqual(r.totals.linkClicks);
  });

  it('grows with the range and keeps cents', async () => {
    const week = connected(await getAds('7d'));
    const month = connected(await getAds('30d'));
    const year = connected(await getAds('all'));
    expect(month.totals.spend.amount).toBeGreaterThan(week.totals.spend.amount);
    expect(year.totals.reach).toBeGreaterThan(month.totals.reach);
    // A paused campaign shows up in a range where it spent, an archived one only in "All".
    expect(month.campaigns.some((c) => c.status === 'paused')).toBe(true);
    expect(month.campaigns.some((c) => c.status === 'archived')).toBe(false);
    expect(year.campaigns.some((c) => c.status === 'archived')).toBe(true);
    expect(year.days.some((d) => d.spend.amount === 0)).toBe(true);
    expect(month.days.some((d) => d.spend.amount % 100 !== 0)).toBe(true);
  });

  it('defaults to 30 days and rejects an unknown range', async () => {
    const plain = connected(await api.get<AdsReport>('/ads'));
    expect(plain.range).toBe('30d');
    const e = await apiError(api.get('/ads', { query: { range: '1y' } }));
    expect([e.status, e.code, e.message]).toEqual([400, 'range', 'Unknown range. Use 7d, 14d, 30d, 3m or all.']);
  });

  it('is owner only', async () => {
    asManager();
    const read = await apiError(getAds('30d'));
    expect([read.status, read.message]).toEqual([403, 'That section is owner only.']);
    const refresh = await apiError(refreshAds());
    expect(refresh.status).toBe(403);
    expect(ownerOnly).toHaveBeenCalledTimes(2);
    // A refused manager never runs the job.
    expect(adsState.refreshCalls).toBe(0);
  });

  it('starts with the failed pull the inbox reports', async () => {
    const r = connected(await getAds('30d'));
    expect(r.lastSync).toMatchObject({ ok: false, error: 'Meta refused the pull: the access token expired.' });
  });
});

describe('POST /ads/refresh', () => {
  it('works twice, then fails on every 3rd call with the documented 502', async () => {
    const before = connected(await getAds('7d')).lastSync?.at ?? '';

    const first = await refreshAds();
    expect(zAdsRefreshResult.safeParse(first).success).toBe(true);
    expect(first.rowsUpserted).toBeGreaterThan(0);
    // The mutation shows in the next read: a fresh, successful sync.
    const synced = connected(await getAds('7d')).lastSync;
    expect(synced).toMatchObject({ ok: true, error: null });
    expect((synced?.at ?? '') > before).toBe(true);

    expect((await refreshAds()).rowsUpserted).toBeGreaterThan(0);

    const row = notificationRows.find((n) => n.event_key === 'system.meta_pull_failed' && n.entity_id === 'act_1048893');
    const occurrences = row?.occurrences ?? 0;
    const e = await apiError(refreshAds());
    expect([e.status, e.code, e.message]).toEqual([502, 'upstream', 'Meta refused the pull. The inbox has the reason; an expired token is the usual cause.']);
    expect(connected(await getAds('7d')).lastSync).toMatchObject({ ok: false, error: 'Meta refused the pull: the access token expired.' });
    // The inbox row is bumped, not duplicated.
    expect(row?.occurrences).toBe(occurrences + 1);
    expect(notificationRows.filter((n) => n.event_key === 'system.meta_pull_failed' && !n.is_test)).toHaveLength(1);

    // And the cycle goes on.
    await refreshAds();
    await refreshAds();
    expect((await apiError(refreshAds())).status).toBe(502);
  });
});

describe('not connected', () => {
  it('sends no numbers at all, and the refresh says what is missing', async () => {
    adsMock.setConnected(false);
    const report = await getAds('30d');
    expect(zAdsReport.safeParse(report).success).toBe(true);
    expect(report).toEqual({ connected: false, range: '30d', lastSync: null });
    const e = await apiError(refreshAds());
    expect([e.status, e.code, e.message]).toEqual([503, 'not_configured', 'The server is missing a setting for this feature.']);
    expect(adsState.refreshCalls).toBe(0);
  });

  it('builds query options keyed by range', () => {
    expect(adsQuery('14d').queryKey).toEqual(['ads', '14d']);
    expect(adsQuery().queryKey).toEqual(['ads', '30d']);
  });
});
