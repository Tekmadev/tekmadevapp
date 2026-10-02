import { ApiError, networkError } from '@/api/errors';
import type { AdsCampaign, AdsConnectedReport } from '@/api/schemas/ads';

import {
  adsOf,
  campaignStatusBadge,
  cardMetrics,
  cardSpoken,
  chunk,
  ctrLine,
  dayPoints,
  findCampaign,
  formatRoas,
  gridColumns,
  hasSpend,
  kpiTexts,
  metaKpis,
  perLine,
  PULL_TIMEOUT,
  pulledMessage,
  pullFailureMessage,
  REFUSED,
  salesLine,
  siteKpis,
  syncLine,
} from '../logic';

// Friday, October 2, 2026 at 12:00 PM in Toronto (EDT).
const NOW = new Date('2026-10-02T16:00:00Z');
const cad = (amount: number) => ({ amount, currency: 'CAD' });

const campaign = (over: Partial<AdsCampaign> = {}): AdsCampaign => ({
  id: 'c1',
  name: 'Webline: Hamilton trades',
  status: 'active',
  spend: cad(123_456),
  linkClicks: 1204,
  visits: 980,
  leads: 54,
  booked: 12,
  sales: 0,
  revenue: cad(0),
  costPerLead: cad(2286),
  costPerSale: null,
  ...over,
});

const report = (over: Partial<AdsConnectedReport> = {}): AdsConnectedReport => ({
  connected: true,
  range: '30d',
  lastSync: null,
  totals: { spend: cad(298_743), impressions: 212_480, reach: 98_231, linkClicks: 3140, ctr: 0.01478, costPerLinkClick: cad(95) },
  outcomes: { visits: 2500, leads: 120, booked: 31, sales: 3, revenue: cad(299_100), roas: 1.0012 },
  cost: { perVisit: cad(119), perLead: cad(2490), perBooked: null, perSale: cad(99_581) },
  days: [
    { date: '2026-09-12', spend: cad(1050), visits: 31 },
    { date: '2026-09-13', spend: cad(0), visits: 0 },
  ],
  campaigns: [campaign()],
  ads: [
    { ...campaign(), id: 'a1', campaignId: 'c1', name: 'Video' },
    { ...campaign(), id: 'a2', campaignId: 'c2', name: 'Other campaign' },
  ],
  ...over,
});

describe('pull copy', () => {
  it('says how many rows came in, with the brief wording', () => {
    expect(pulledMessage(42)).toBe('Pulled 42 ad-day rows from Meta.');
    expect(pulledMessage(1204)).toBe('Pulled 1,204 ad-day rows from Meta.');
    expect(pulledMessage(1)).toBe('Pulled 1 ad-day row from Meta.');
  });

  it('turns a Meta refusal into the brief message and stays quiet when nothing failed', () => {
    const upstream = new ApiError({ status: 502, code: 'upstream', message: 'Meta said no.' });
    expect(pullFailureMessage(upstream, false)).toBe(REFUSED);
    expect(REFUSED).toBe('Meta refused the pull. The inbox has the reason; an expired token is the usual cause.');
    expect(pullFailureMessage(networkError('timeout'), true)).toBe(PULL_TIMEOUT);
    expect(pullFailureMessage(networkError('aborted'), false)).toBeNull();
    expect(pullFailureMessage(new ApiError({ status: 403, code: 'owner_only', message: 'x' }), false)).toBeNull();
    const missing = new ApiError({ status: 503, code: 'not_configured', message: 'The server is missing a setting for this feature.' });
    expect(pullFailureMessage(missing, false)).toBe('The server is missing a setting for this feature.');
  });
});

describe('syncLine', () => {
  it('reads "Synced <time>" in Toronto time', () => {
    expect(syncLine({ at: '2026-10-02T15:54:59.123456Z', ok: true, error: null }, NOW)).toEqual({ kind: 'ok', label: 'Synced 5 min ago' });
    expect(syncLine({ at: '2026-10-02T15:59:50Z', ok: true, error: null }, NOW).label).toBe('Synced just now');
    // A server clock a little ahead is still "just now".
    expect(syncLine({ at: '2026-10-02T16:00:30Z', ok: true, error: null }, NOW).label).toBe('Synced just now');
    // Before today: the date and time, never "Yesterday".
    expect(syncLine({ at: '2026-10-01T18:41:00Z', ok: true, error: null }, NOW).label).toBe('Synced Oct 1, 2:41 PM');
  });

  it('says the last sync failed, with when and why', () => {
    expect(syncLine({ at: '2026-10-02T10:00:00Z', ok: false, error: ' Meta refused the pull: the access token expired. ' }, NOW)).toEqual({
      kind: 'failed',
      label: 'Last sync failed',
      when: '6 h ago',
      error: 'Meta refused the pull: the access token expired.',
    });
    expect(syncLine({ at: '2026-10-02T10:00:00Z', ok: false, error: '' }, NOW)).toMatchObject({ error: null });
  });

  it('has a line for a report that never synced', () => {
    expect(syncLine(null, NOW)).toEqual({ kind: 'never', label: 'Not synced yet' });
  });
});

describe('labels and numbers', () => {
  it('uses the meta status labels, with the brief set as the fallback', () => {
    const meta = { adsCampaignStatuses: [{ value: 'paused' as const, label: 'On hold', tone: 'neutral' as const }] };
    expect(campaignStatusBadge(meta, 'paused')).toEqual({ label: 'On hold', tone: 'neutral' });
    expect(campaignStatusBadge(meta, 'active')).toEqual({ label: 'Active', tone: 'ok' });
    expect(campaignStatusBadge(undefined, 'archived')).toEqual({ label: 'Archived', tone: 'muted' });
  });

  it('formats return on spend, CTR and per-outcome costs', () => {
    expect(formatRoas(1.92)).toBe('1.9x');
    expect(formatRoas(0)).toBe('0.0x');
    expect(formatRoas(null)).toBeNull();
    expect(ctrLine(0.01478)).toBe('CTR 1.5%');
    expect(salesLine(cad(299_100), 1.0012)).toBe('$2,991 revenue · 1.0x return on spend');
    expect(salesLine(cad(7750), null)).toBe('$77.50 revenue');
    expect(perLine(cad(2490), 'lead')).toBe('$24.90 per lead');
    expect(perLine(null, 'lead')).toBeNull();
  });

  it('builds both KPI panels from the report, never inventing a zero', () => {
    const r = report({ totals: { ...report().totals, costPerLinkClick: null } });
    const meta = metaKpis(r);
    expect(meta.map((k) => k.label)).toEqual(['Spend', 'Impressions', 'Link clicks', 'Cost per link click']);
    expect(meta[0]).toMatchObject({ value: 298_743, emphasis: true });
    expect(meta[0].format(298_743)).toBe('$2,987.43');
    expect(meta[1].sub).toBe('Reach 98,231');
    expect(meta[1].format(212_480)).toBe('212.5K');
    expect(meta[2].sub).toBe('CTR 1.5%');
    expect(meta[3].value).toBeNull();

    const site = siteKpis(r);
    expect(site.map((k) => k.label)).toEqual(['Visits', 'Leads', 'Booked calls', 'Sales']);
    expect(site.map((k) => k.sub)).toEqual(['$1.19 per visit', '$24.90 per lead', null, '$2,991 revenue · 1.0x return on spend']);
    // The missing cost is left out of the column maths.
    expect(kpiTexts(meta)).toEqual(['$2,987.43', '212.5K', '3,140']);
  });

  it('knows when nothing was spent', () => {
    expect(hasSpend(report())).toBe(true);
    expect(hasSpend(report({ totals: { ...report().totals, spend: cad(0) }, campaigns: [] }))).toBe(false);
  });
});

describe('campaign and ad cards', () => {
  it('lists the metrics in order, with n/a where the divisor was 0', () => {
    const metrics = cardMetrics(campaign());
    expect(metrics.map((m) => [m.label, m.value])).toEqual([
      ['Link clicks', '1,204'],
      ['Visits', '980'],
      ['Leads', '54'],
      ['Booked', '12'],
      ['Sales', '0'],
      ['Revenue', '$0'],
      ['Cost per lead', '$22.86'],
      ['Cost per sale', 'n/a'],
    ]);
    expect(metrics[7].spoken).toBe('Cost per sale not available');
    expect(cardSpoken('Webline', 'Active', cad(123_456), metrics.slice(0, 1))).toBe('Webline, Active, Spend $1,234.56, Link clicks 1,204');
  });

  it('finds a campaign and only its own ads', () => {
    const r = report();
    expect(findCampaign(r, 'c1')?.name).toBe('Webline: Hamilton trades');
    expect(findCampaign(r, 'nope')).toBeNull();
    expect(adsOf(r, 'c1').map((a) => a.id)).toEqual(['a1']);
  });
});

describe('dayPoints', () => {
  it('labels Toronto dates as text, with a long title for the scrub', () => {
    const spend = dayPoints(report().days, 'spend', NOW);
    expect(spend[0]).toEqual({ label: 'Sep 12', value: 1050, title: 'Saturday, September 12' });
    expect(dayPoints(report().days, 'visits', NOW).map((p) => p.value)).toEqual([31, 0]);
    const lastYear = dayPoints([{ date: '2025-11-05', spend: cad(1), visits: 1 }], 'spend', NOW)[0];
    expect([lastYear.label, lastYear.title]).toEqual(['Nov 5, 2025', 'Wednesday, November 5, 2025']);
  });
});

describe('gridColumns', () => {
  // A 412dp phone loses 66dp to gutters, borders and card padding.
  const kpi = { width: 346, fontSize: 28, tracking: -0.04, gap: 16, max: 2 };
  const metric = { width: 346, fontSize: 17, tracking: -0.01, gap: 12, max: 3 };

  it('keeps two KPI columns while the widest figure fits whole', () => {
    expect(gridColumns({ ...kpi, fontScale: 1, texts: ['$2,987.43', '212.5K'] })).toBe(2);
    expect(gridColumns({ ...kpi, fontScale: 1.3, texts: ['$2,987.43'] })).toBe(2);
    expect(gridColumns({ ...kpi, fontScale: 1, texts: ['$123,456.78'] })).toBe(2);
    expect(gridColumns({ ...kpi, fontScale: 1.3, texts: ['$123,456.78'] })).toBe(1);
    // A narrow phone at 1.3x stacks rather than cutting money off.
    expect(gridColumns({ ...kpi, width: 294, fontScale: 1.3, texts: ['$2,987.43'] })).toBe(1);
    expect(gridColumns({ ...kpi, fontScale: 1, texts: [] })).toBe(2);
  });

  it('drops the metric grid from three columns to two when a value would not fit', () => {
    expect(gridColumns({ ...metric, fontScale: 1, texts: ['$2,991', '1,204', 'n/a'] })).toBe(3);
    expect(gridColumns({ ...metric, fontScale: 1, texts: ['$12,345.67'] })).toBe(3);
    expect(gridColumns({ ...metric, fontScale: 1.3, texts: ['$12,345.67'] })).toBe(2);
    // Font scales below 1 count as 1.
    expect(gridColumns({ ...metric, fontScale: 0.85, texts: ['$12,345.67'] })).toBe(3);
  });

  it('chunks cells into rows', () => {
    expect(chunk([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]]);
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
  });
});
