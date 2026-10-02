import {
  DEFAULT_ANALYTICS_RANGE,
  zAnalyticsRange,
  type Analytics,
  type AnalyticsBucket,
  type AnalyticsPoint,
  type AnalyticsRange,
  type CountryCount,
} from '@/api/schemas/analytics';
import type { HBarDatum } from '@/components/charts/HBars';
import { MAX_FONT_SCALE } from '@/design/typography';
import { formatCalendarDate } from '@/lib/dates';
import { formatChange, formatCompact, formatCount } from '@/lib/format';

/**
 * Pure helpers for the Analytics tab (brief 8.9), kept out of the components so
 * they can be unit tested: the range param, the KPI copy and number formats,
 * the country flags, and the KPI grid columns.
 */

/** Brief 8.9: every chart and list says this when it has nothing to show. */
export const NO_DATA = 'No data yet.';
/** Brief 8.9: the Pageviews sub line when the period before had no traffic. */
export const NOTHING_BEFORE = 'Nothing in the period before';
/** Brief 8.9: the footnote under the last list. */
export const FOOTNOTE = 'First-party, cookieless traffic.';

/* ---------- range ---------- */

/** The `range` route param, or 30 days when it is missing or unknown. */
export function toRange(value: string | string[] | undefined): AnalyticsRange {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = zAnalyticsRange.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ANALYTICS_RANGE;
}

/**
 * The bucket the server uses for a range (docs/api-requests/analytics.md). Only
 * the skeleton uses it, to title its blocks before the data says so.
 */
const EXPECTED_BUCKET: Record<AnalyticsRange, AnalyticsBucket> = {
  '24h': 'hour',
  '7d': 'day',
  '30d': 'day',
  '3m': 'week',
  '6m': 'week',
  '1y': 'month',
  all: 'month',
};

export function expectedBucket(range: AnalyticsRange): AnalyticsBucket {
  return EXPECTED_BUCKET[range];
}

/** 24 hours averages per hour; every other range per day (the API's `averagePer`). */
export function expectedAveragePer(range: AnalyticsRange): Analytics['averagePer'] {
  return range === '24h' ? 'hour' : 'day';
}

/** The range in words for TalkBack ("Pageviews, last 30 days, total 3,412, ..."). */
const PERIOD: Record<AnalyticsRange, string> = {
  '24h': 'last 24 hours',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '3m': 'last 3 months',
  '6m': 'last 6 months',
  '1y': 'last 12 months',
  all: 'all time',
};

export function periodPhrase(range: AnalyticsRange): string {
  return PERIOD[range];
}

/* ---------- copy ---------- */

/** "Pageviews by day". */
export function chartTitle(bucket: AnalyticsBucket): string {
  return `Pageviews by ${bucket}`;
}

/** "Average per hour" or "Average per day". */
export function averageLabel(per: Analytics['averagePer']): string {
  return `Average per ${per}`;
}

/** "Busiest hour", "Busiest day", "Busiest week", "Busiest month". */
export function peakLabel(bucket: AnalyticsBucket): string {
  return `Busiest ${bucket}`;
}

/**
 * The Pageviews sub line, from the API's comparison rules:
 * - no comparable period before (`prevTotal` null): "Tracking started Jun 19, 2025",
 *   or "Nothing in the period before" when nothing was ever tracked;
 * - an empty period before (`prevTotal` 0): "Nothing in the period before";
 * - otherwise: "Up 12% on the period before (1,204)" (or "Down 3% ...", "No change ...").
 */
export function pageviewsSub(data: Pick<Analytics, 'total' | 'prevTotal' | 'change' | 'trackingSince'>, now: Date): string {
  const { total, prevTotal, change, trackingSince } = data;
  if (prevTotal === null) return trackingSince ? `Tracking started ${formatCalendarDate(trackingSince, now)}` : NOTHING_BEFORE;
  if (!(prevTotal > 0)) return NOTHING_BEFORE;
  // The server sends the ratio; work it out only if it is missing.
  const text = formatChange(change ?? (total - prevTotal) / prevTotal);
  return text ? `${text} on the period before (${formatCount(prevTotal)})` : NOTHING_BEFORE;
}

/**
 * Under the busiest count: which bucket it was. An hour label ("2 PM") does not
 * say which day, so hours use the point's tooltip title ("Wed, Sep 30, 2 PM").
 * Labels are text from the server, never parsed as dates.
 */
export function peakCaption(data: Pick<Analytics, 'bucket' | 'peak' | 'series'>): string {
  const { peak } = data;
  if (!peak) return NO_DATA;
  if (data.bucket !== 'hour') return peak.label;
  const point = data.series.find((p) => p.label === peak.label && p.count === peak.count);
  return point?.title ?? peak.label;
}

/**
 * The busiest bucket's count. With no traffic at all the API sends no peak, and
 * every bucket really is 0; anything else missing stays missing ("Not available").
 */
export function peakValue(data: Pick<Analytics, 'peak' | 'total'>): number | null {
  if (data.peak) return data.peak.count;
  return data.total === 0 ? 0 : null;
}

/* ---------- numbers ---------- */

/** Full-width total: exact up to 9,999,999, then "12.4M". */
export function formatTotal(value: number): string {
  return Math.abs(value) >= 10_000_000 ? formatCompact(value) : formatCount(value);
}

/** Half-width cards: exact up to 99,999, then "124.8K" (like Home's KPI grid). */
export function formatKpi(value: number): string {
  return Math.abs(value) >= 100_000 ? formatCompact(value) : formatCount(value);
}

/** Averages: one decimal under 10 ("4.6" an hour, ".0" dropped), whole numbers above ("142"). */
export function formatAverage(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 10) return formatKpi(value);
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? formatCount(rounded) : rounded.toFixed(1);
}

/** True when a chart has at least one pageview to draw (an all-zero line says nothing). */
export function hasTraffic(rows: readonly { count: number }[]): boolean {
  return rows.some((r) => r.count > 0);
}

/** Series points for the AreaChart. Labels and titles stay server text. */
export function chartPoints(series: readonly AnalyticsPoint[]) {
  return series.map((p) => ({ label: p.label, value: p.count, title: p.title }));
}

/* ---------- countries ---------- */

/** Regional indicator symbol letter A. */
const REGIONAL_A = 0x1f1e6;
/** "Unknown" codes some geo lookups use; they have no flag. */
const NO_FLAG_CODES: ReadonlySet<string> = new Set(['XX', 'ZZ']);
/** For a row without a flag when others have one, so the names still line up. */
export const UNKNOWN_FLAG = '\u{1F310}';

/**
 * "CA" to the Canadian flag emoji: each letter becomes its regional indicator
 * symbol, which Android draws as the flag. Anything that is not two letters
 * (or is a placeholder code) has no flag.
 */
export function flagFromCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || NO_FLAG_CODES.has(cc)) return null;
  return String.fromCodePoint(REGIONAL_A + cc.charCodeAt(0) - 65, REGIONAL_A + cc.charCodeAt(1) - 65);
}

/** Top countries as bars: the flag built from the ISO code (the server's own emoji as a fallback), then the name. */
export function countryRows(countries: readonly CountryCount[]): HBarDatum[] {
  const flags = countries.map((c) => flagFromCode(c.code) ?? (c.flag?.trim() || null));
  const anyFlag = flags.some((f) => f !== null);
  return countries.map((c, i) => {
    const row: HBarDatum = { key: c.code?.trim() || c.label, label: c.label, value: c.count };
    const leading = flags[i] ?? (anyFlag ? UNKNOWN_FLAG : null);
    if (leading) row.leading = leading;
    return row;
  });
}

/* ---------- KPI grid ---------- */

/** Geist Mono 500 at 11sp with 18% tracking: about 8.6dp per character (as on Home). */
const EYEBROW_CHAR_DP = 8.6;
/** Screen gutters (2 x 16) and the gap between the two cards (12). */
const ROW_CHROME = 16 * 2 + 12;
/** Card padding (2 x 16) and borders (2 x 1). */
const CARD_CHROME = 16 * 2 + 2;

/**
 * The two small KPI cards sit side by side when both labels fit a half-width
 * card at this font scale ("AVERAGE PER HOUR" is the longest); otherwise they
 * stack, so a label is never cut off.
 */
export function kpiColumns(windowWidth: number, fontScale: number, labels: readonly string[]): 1 | 2 {
  const scale = clampScale(fontScale);
  const inner = (windowWidth - ROW_CHROME) / 2 - CARD_CHROME;
  const longest = labels.reduce((max, l) => Math.max(max, l.length), 0);
  return inner >= longest * EYEBROW_CHAR_DP * scale ? 2 : 1;
}

/** Text never grows past 1.3x (Text caps it), and layouts never shrink below 1x. */
export function clampScale(fontScale: number): number {
  return Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE);
}
