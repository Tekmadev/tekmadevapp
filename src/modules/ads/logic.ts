import { ApiError, errorMessage } from '@/api/errors';
import type { AdsAd, AdsCampaign, AdsCampaignStatus, AdsConnectedReport, AdsDay, AdsLastSync, AdsMeta, AdsRange } from '@/api/schemas/ads';
import type { Money } from '@/api/types';
import type { AreaPoint } from '@/components/charts/AreaChart';
import type { Tone } from '@/design/tokens';
import {
  formatCalendarDate,
  formatDateTime,
  monthName,
  parseCalendarDate,
  relativeTime,
  toDate,
  todayToronto,
  torontoDateOf,
  torontoParts,
  weekdayName,
  weekdayOf,
} from '@/lib/dates';
import { formatCount, formatPercent, plural } from '@/lib/format';
import { formatCents, formatMoney } from '@/lib/money';
import { clampScale, formatKpi } from '@/modules/overview/logic';

/**
 * Pure helpers for Ads (brief 8.10): copy, the sync line, metric lists for the
 * campaign and ad cards, chart points, and the column maths that keeps money
 * whole (never cut off, never rounded) at every font scale.
 */

/* ---------- copy ---------- */

/** Brief 8.10, exact. */
export const PULLING = 'Pulling from Meta…';
export const REFUSED = 'Meta refused the pull. The inbox has the reason; an expired token is the usual cause.';
export const NO_SPEND = 'No ad spend in this range.';
export const NO_CAMPAIGN_SPEND = 'This campaign spent nothing in this range.';
/** A long job that outlived the 2 minute timeout may still finish on the server: never "try again". */
export const PULL_TIMEOUT = 'Meta is taking longer than 2 minutes. The pull may still finish; the sync time updates when it does.';
export const MISSING = 'n/a';

/** "Pulled {n} ad-day rows from Meta." (one row reads "row"). */
export function pulledMessage(rows: number): string {
  return `Pulled ${formatCount(rows)} ad-day ${plural(rows, 'row', 'rows')} from Meta.`;
}

/**
 * The failure toast for "Refresh from Meta", or null when nothing should show
 * (a cancelled request, or 401/403/426, which the client already handles).
 */
export function pullFailureMessage(error: unknown, timedOut: boolean): string | null {
  if (timedOut) return PULL_TIMEOUT;
  if (error instanceof ApiError) {
    if (error.kind === 'aborted' || error.status === 401 || error.status === 403 || error.status === 426) return null;
    if (isMetaRefusal(error)) return REFUSED;
  }
  return errorMessage(error);
}

/** Meta said no (502 upstream): the inbox has the full reason. */
export function isMetaRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 502 || error.code === 'upstream');
}

/** The range in words, for chart summaries ("last 30 days"). */
export const RANGE_WORDS: Record<AdsRange, string> = {
  '7d': 'last 7 days',
  '14d': 'last 14 days',
  '30d': 'last 30 days',
  '3m': 'last 3 months',
  all: 'last 12 months',
};

/* ---------- sync line ---------- */

export type SyncLine =
  | { kind: 'never'; label: string }
  | { kind: 'ok'; label: string }
  | { kind: 'failed'; label: string; when: string; error: string | null };

/** "just now", "5 min ago", "3 h ago" today; "Sep 28, 2:41 PM" before today (Toronto days). */
export function syncTime(at: string, now: Date): string {
  // toDate trims microseconds, which Hermes may refuse.
  const then = toDate(at);
  if (!then) return '';
  // A server clock a moment ahead reads as now.
  if (then.getTime() >= now.getTime()) return 'just now';
  if (torontoDateOf(then) === todayToronto(now)) return relativeTime(then, now);
  return formatDateTime(then, now);
}

/** "Synced <time>", or "Last sync failed" with the time and the server's reason. */
export function syncLine(lastSync: AdsLastSync | null, now: Date): SyncLine {
  if (!lastSync) return { kind: 'never', label: 'Not synced yet' };
  const when = syncTime(lastSync.at, now);
  if (lastSync.ok) return { kind: 'ok', label: when ? `Synced ${when}` : 'Synced' };
  const error = lastSync.error?.trim() ? lastSync.error.trim() : null;
  return { kind: 'failed', label: 'Last sync failed', when, error };
}

/* ---------- labels from GET /meta ---------- */

const STATUS_FALLBACK: Record<AdsCampaignStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  archived: { label: 'Archived', tone: 'muted' },
};

/** The campaign status badge: GET /meta's label and tone, the brief's set until it loads. */
export function campaignStatusBadge(meta: Pick<AdsMeta, 'adsCampaignStatuses'> | undefined, status: AdsCampaignStatus): { label: string; tone: Tone } {
  const found = meta?.adsCampaignStatuses?.find((s) => s.value === status);
  if (found) return { label: found.label, tone: found.tone };
  return STATUS_FALLBACK[status] ?? { label: status, tone: 'neutral' };
}

/* ---------- numbers ---------- */

/** Exact money, or "n/a" when the server sent null (nothing to divide by). */
export function moneyOrMissing(money: Money | null | undefined): string {
  return money ? formatMoney(money) : MISSING;
}

/** Return on spend: 1.92 → "1.9x". Null when nothing was spent. */
export function formatRoas(roas: number | null | undefined): string | null {
  if (roas == null || !Number.isFinite(roas)) return null;
  return `${(Math.round(roas * 10) / 10).toFixed(1)}x`;
}

/** Link click-through rate, one decimal: 0.0142 → "CTR 1.4%". */
export function ctrLine(ctr: number): string {
  return `CTR ${formatPercent(ctr, 1)}`;
}

/** The Sales KPI's sub line: "$2,991 revenue · 1.9x return on spend". */
export function salesLine(revenue: Money, roas: number | null): string {
  const r = formatRoas(roas);
  return r ? `${formatMoney(revenue)} revenue · ${r} return on spend` : `${formatMoney(revenue)} revenue`;
}

/** Spend per outcome as a sub line ("$45.10 per lead"), or null when there was no such outcome. */
export function perLine(cost: Money | null | undefined, unit: string): string | null {
  return cost ? `${formatMoney(cost)} per ${unit}` : null;
}

/** Money spent, or a campaign that ran, in the range. Otherwise the calm empty line shows. */
export function hasSpend(report: AdsConnectedReport): boolean {
  return report.totals.spend.amount > 0 || report.campaigns.length > 0;
}

/* ---------- KPI panels ---------- */

export type KpiItem = {
  key: string;
  /** Mono eyebrow ("COST PER LINK CLICK"), up to two lines. */
  label: string;
  /** Null means the figure is missing: "Not available", never a zero. */
  value: number | null;
  format: (value: number) => string;
  sub?: string | null;
  /** Gold number, for the one figure that matters most (Spend). */
  emphasis?: boolean;
};

const moneyFormat = (currency: string) => (cents: number) => formatCents(cents, currency);

/** "What Meta reports": Spend, Impressions (reach), Link clicks (CTR), Cost per link click. */
export function metaKpis(report: AdsConnectedReport): KpiItem[] {
  const { totals } = report;
  const currency = totals.spend.currency;
  return [
    { key: 'spend', label: 'Spend', value: totals.spend.amount, format: moneyFormat(currency), emphasis: true },
    { key: 'impressions', label: 'Impressions', value: totals.impressions, format: formatKpi, sub: `Reach ${formatCount(totals.reach)}` },
    { key: 'linkClicks', label: 'Link clicks', value: totals.linkClicks, format: formatKpi, sub: ctrLine(totals.ctr) },
    {
      key: 'costPerLinkClick',
      label: 'Cost per link click',
      value: totals.costPerLinkClick?.amount ?? null,
      format: moneyFormat(totals.costPerLinkClick?.currency ?? currency),
    },
  ];
}

/** "What the site recorded from those ads": Visits, Leads, Booked calls, Sales (revenue, return on spend). */
export function siteKpis(report: AdsConnectedReport): KpiItem[] {
  const { outcomes, cost } = report;
  return [
    { key: 'visits', label: 'Visits', value: outcomes.visits, format: formatKpi, sub: perLine(cost.perVisit, 'visit') },
    { key: 'leads', label: 'Leads', value: outcomes.leads, format: formatKpi, sub: perLine(cost.perLead, 'lead') },
    { key: 'booked', label: 'Booked calls', value: outcomes.booked, format: formatKpi, sub: perLine(cost.perBooked, 'booked call') },
    { key: 'sales', label: 'Sales', value: outcomes.sales, format: formatKpi, sub: salesLine(outcomes.revenue, outcomes.roas) },
  ];
}

/** The figures as shown, for the column maths. */
export function kpiTexts(items: readonly KpiItem[]): string[] {
  return items.flatMap((i) => (i.value != null && Number.isFinite(i.value) ? [i.format(i.value)] : []));
}

/* ---------- campaign and ad cards ---------- */

export type Metric = {
  key: string;
  label: string;
  /** Display text; "n/a" when the divisor was 0. */
  value: string;
  /** What TalkBack reads. */
  spoken: string;
};

type CardRow = Pick<AdsCampaign, 'linkClicks' | 'visits' | 'leads' | 'booked' | 'sales' | 'revenue' | 'costPerLead' | 'costPerSale'>;

const count = (key: string, label: string, n: number): Metric => {
  const value = formatCount(n);
  return { key, label, value, spoken: `${label} ${value}` };
};

const money = (key: string, label: string, m: Money | null): Metric => {
  const value = moneyOrMissing(m);
  return { key, label, value, spoken: `${label} ${m ? value : 'not available'}` };
};

/** Everything on a campaign (or ad) card under its spend, in the brief's order. */
export function cardMetrics(row: CardRow): Metric[] {
  return [
    count('linkClicks', 'Link clicks', row.linkClicks),
    count('visits', 'Visits', row.visits),
    count('leads', 'Leads', row.leads),
    count('booked', 'Booked', row.booked),
    count('sales', 'Sales', row.sales),
    money('revenue', 'Revenue', row.revenue),
    money('costPerLead', 'Cost per lead', row.costPerLead),
    money('costPerSale', 'Cost per sale', row.costPerSale),
  ];
}

/** One sentence for TalkBack: name, status, spend, then every metric. */
export function cardSpoken(name: string | null, status: string | null, spend: Money, metrics: readonly Metric[]): string {
  return [name, status, `Spend ${formatMoney(spend)}`, ...metrics.map((m) => m.spoken)].filter(Boolean).join(', ');
}

/** The campaign behind a drill-down, from the range's report. */
export function findCampaign(report: AdsConnectedReport, id: string): AdsCampaign | null {
  return report.campaigns.find((c) => c.id === id) ?? null;
}

/** The campaign's ads, in the server's order (by spend). */
export function adsOf(report: AdsConnectedReport, campaignId: string): AdsAd[] {
  return report.ads.filter((a) => a.campaignId === campaignId);
}

/* ---------- charts ---------- */

/** "Saturday, September 12" (plus the year when it is not this year), for the scrub tooltip. */
export function dayTitle(date: string, now: Date): string {
  const p = parseCalendarDate(date);
  if (!p) return date;
  const base = `${weekdayName(weekdayOf(date))}, ${monthName(p.month)} ${p.day}`;
  return p.year === torontoParts(now).year ? base : `${base}, ${p.year}`;
}

/** Points for "Spend per day" (cents) or "Visits from ads per day". Dates are Toronto text, never parsed with new Date(). */
export function dayPoints(days: readonly AdsDay[], pick: 'spend' | 'visits', now: Date): AreaPoint[] {
  return days.map((d) => ({
    label: formatCalendarDate(d.date, now),
    value: pick === 'spend' ? d.spend.amount : d.visits,
    title: dayTitle(d.date, now),
  }));
}

/* ---------- layout maths ---------- */

/** Rough advance widths in em for Geist figures: digits and $ are tabular; separators are narrow. */
function charEm(ch: string): number {
  if (ch === ',' || ch === '.' || ch === ' ') return 0.3;
  if (ch === 'x' || ch === '/') return 0.52;
  return 0.6;
}

/** Estimated width in dp of a figure set at `fontSize` (sp) with `tracking` em letter spacing, at font scale 1. */
export function estimateTextWidth(text: string, fontSize: number, tracking = 0): number {
  let em = 0;
  for (const ch of text) em += charEm(ch) + tracking;
  return em * fontSize;
}

export type GridSpec = {
  /** Width of the box the cells share, in dp. */
  width: number;
  fontScale: number;
  /** Every value that will show in a cell. */
  texts: readonly string[];
  fontSize: number;
  tracking?: number;
  /** Gap between cells (dp). */
  gap: number;
  /** Most columns to use. */
  max: number;
};

/**
 * How many columns fit the widest value whole. Money is never cut off or
 * rounded to fit; the grid gives each cell more room instead.
 */
export function gridColumns({ width, fontScale, texts, fontSize, tracking = 0, gap, max }: GridSpec): number {
  // Text never scales past 1.3; below 1 counts as 1 so the estimate stays safe.
  const scale = clampScale(fontScale);
  const widest = texts.reduce((w, t) => Math.max(w, estimateTextWidth(t, fontSize, tracking) * scale), 0);
  for (let columns = Math.max(1, Math.floor(max)); columns > 1; columns--) {
    const cell = (width - gap * (columns - 1)) / columns;
    if (cell >= widest) return columns;
  }
  return 1;
}

/** Split into rows of `columns` cells (the last row may be short). */
export function chunk<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}
