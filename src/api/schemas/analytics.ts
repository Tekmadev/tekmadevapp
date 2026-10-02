import { z } from 'zod';

import { zDate, zLabelCount } from '../types';

/**
 * Schemas for the "analytics" domain (first-party, cookieless pageviews;
 * contract section 11, Insights; brief 8.9). Validation only: no transforms.
 *
 * Chart points carry local Toronto labels without an offset
 * ("2026-09-30T14:00:00" or "2026-09-30"): they are text, never parse them as dates.
 */

export const zAnalyticsRange = z.enum(['24h', '7d', '30d', '3m', '6m', '1y', 'all']);
export type AnalyticsRange = z.infer<typeof zAnalyticsRange>;

/** Range chips in order, with the brief's labels. 30 days is the default. */
export const ANALYTICS_RANGES: readonly { value: AnalyticsRange; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All time' },
];
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = '30d';

/** 24h: hour, 7d and 30d: day, 3m and 6m: week (Monday start), 1y and all: month. */
export const zAnalyticsBucket = z.enum(['hour', 'day', 'week', 'month']);
export type AnalyticsBucket = z.infer<typeof zAnalyticsBucket>;

export const zAnalyticsPoint = z.object({
  /** Local Toronto label: "2026-09-30T14:00:00" (hour) or "2026-09-30" (day, week start, month start). */
  t: z.string(),
  count: z.number().int(),
  /** Axis label: "2 PM", "Sep 30", "Week of Sep 7", "Sep 2026". */
  label: z.string(),
  /** Scrub tooltip heading: "Wed, Sep 30, 2 PM", "Wednesday, September 30", "Sep 7 to Sep 13", "September 2026". */
  title: z.string(),
});
export type AnalyticsPoint = z.infer<typeof zAnalyticsPoint>;

/**
 * Countries: the label is the country name. `code` is the ISO 3166-1 alpha-2
 * code ("CA"); the app builds the flag emoji from it (Hermes has no
 * Intl.DisplayNames, so the name still comes from the server). `flag` is an
 * optional ready-made emoji, used only when there is no code.
 */
export const zCountryCount = zLabelCount.extend({ code: z.string().optional(), flag: z.string().optional() });
export type CountryCount = z.infer<typeof zCountryCount>;

export const zAnalytics = z.object({
  range: zAnalyticsRange,
  bucket: zAnalyticsBucket,
  total: z.number().int(),
  /** Pageviews in the period before. Null when that period is not fully tracked ("Tracking started <date>"). */
  prevTotal: z.number().int().nullable(),
  /** (total - prevTotal) / prevTotal as a ratio (0.12 = up 12%). Null without a comparison or when prevTotal is 0. */
  change: z.number().nullable(),
  /** Average pageviews per `averagePer` over the range. */
  average: z.number(),
  /** 24h: per hour. Every other range: per day. */
  averagePer: z.enum(['hour', 'day']),
  /** The busiest bucket ("Busiest hour/day/week/month"). Null when there is no traffic. */
  peak: z.object({ label: z.string(), count: z.number().int() }).nullable(),
  /** Toronto date tracking started. Null when nothing was ever tracked. */
  trackingSince: zDate.nullable(),
  series: z.array(zAnalyticsPoint),
  topSources: z.array(zLabelCount),
  devices: z.array(zLabelCount),
  topPages: z.array(zLabelCount),
  countries: z.array(zCountryCount),
  topReferrers: z.array(zLabelCount),
});
export type Analytics = z.infer<typeof zAnalytics>;

/**
 * This domain's slice of GET /meta (composed in schemas/meta.ts). The contract's
 * meta list has nothing for analytics; the range labels are UI copy (above).
 */
export const metaFragment = z.object({});
export type AnalyticsMeta = z.infer<typeof metaFragment>;
