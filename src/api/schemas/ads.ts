import { z } from 'zod';

import { zDate, zInstant, zMoney, zTone } from '../types';

/**
 * Schemas for the "ads" domain (Meta ads, owner only; contract section 11,
 * Insights; brief 8.10). Validation only: no transforms, no defaults.
 *
 * Two kinds of numbers: what Meta reports (spend, impressions, link clicks) and
 * what the site recorded from those ads (visits, leads, booked calls, sales).
 */

export const zAdsRange = z.enum(['7d', '14d', '30d', '3m', 'all']);
export type AdsRange = z.infer<typeof zAdsRange>;

/** Range chips in order, with the brief's labels. "All" means the last 12 months. */
export const ADS_RANGES: readonly { value: AdsRange; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
  { value: '3m', label: '3 months' },
  { value: 'all', label: 'All' },
];
export const DEFAULT_ADS_RANGE: AdsRange = '30d';

/** The last pull from Meta (hourly on the server, or "Refresh from Meta"). */
export const zAdsLastSync = z.object({
  at: zInstant,
  ok: z.boolean(),
  /** Why the last pull failed (readable text); null when it worked. */
  error: z.string().nullable(),
});
export type AdsLastSync = z.infer<typeof zAdsLastSync>;

/** "What Meta reports". `ctr` is a ratio (0.0142 = 1.42%). Costs are null when nothing was clicked. */
export const zAdsTotals = z.object({
  spend: zMoney,
  impressions: z.number().int(),
  reach: z.number().int(),
  linkClicks: z.number().int(),
  ctr: z.number(),
  costPerLinkClick: zMoney.nullable(),
});
export type AdsTotals = z.infer<typeof zAdsTotals>;

/** "What the site recorded from those ads". `roas` is revenue / spend (null when nothing was spent). */
export const zAdsOutcomes = z.object({
  visits: z.number().int(),
  leads: z.number().int(),
  booked: z.number().int(),
  sales: z.number().int(),
  revenue: zMoney,
  roas: z.number().nullable(),
});
export type AdsOutcomes = z.infer<typeof zAdsOutcomes>;

/** Spend per outcome over the range; null when there was no such outcome. */
export const zAdsCost = z.object({
  perVisit: zMoney.nullable(),
  perLead: zMoney.nullable(),
  perBooked: zMoney.nullable(),
  perSale: zMoney.nullable(),
});
export type AdsCost = z.infer<typeof zAdsCost>;

/** One Toronto day, for the "Spend per day" and "Visits from ads per day" charts. */
export const zAdsDay = z.object({ date: zDate, spend: zMoney, visits: z.number().int() });
export type AdsDay = z.infer<typeof zAdsDay>;

export const zAdsCampaignStatus = z.enum(['active', 'paused', 'archived']);
export type AdsCampaignStatus = z.infer<typeof zAdsCampaignStatus>;

/** Campaign cards, sorted by spend (highest first). */
export const zAdsCampaign = z.object({
  id: z.string(),
  name: z.string(),
  status: zAdsCampaignStatus,
  spend: zMoney,
  linkClicks: z.number().int(),
  visits: z.number().int(),
  leads: z.number().int(),
  booked: z.number().int(),
  sales: z.number().int(),
  revenue: zMoney,
  costPerLead: zMoney.nullable(),
  costPerSale: zMoney.nullable(),
});
export type AdsCampaign = z.infer<typeof zAdsCampaign>;

/** The ads inside a campaign (tap a campaign card), sorted by spend. */
export const zAdsAd = z.object({
  id: z.string(),
  campaignId: z.string(),
  name: z.string(),
  spend: zMoney,
  linkClicks: z.number().int(),
  visits: z.number().int(),
  leads: z.number().int(),
});
export type AdsAd = z.infer<typeof zAdsAd>;

const zAdsConnected = z.object({
  connected: z.literal(true),
  range: zAdsRange,
  /** Null until the first pull ever ran. */
  lastSync: zAdsLastSync.nullable(),
  totals: zAdsTotals,
  outcomes: zAdsOutcomes,
  cost: zAdsCost,
  days: z.array(zAdsDay),
  campaigns: z.array(zAdsCampaign),
  ads: z.array(zAdsAd),
});

/** No Meta ad account id or access token on the server: nothing to show, never zeros. */
const zAdsNotConnected = z.object({
  connected: z.literal(false),
  range: zAdsRange,
  lastSync: zAdsLastSync.nullable(),
});

/** GET /ads. Check `connected` first: only a connected report has numbers. */
export const zAdsReport = z.discriminatedUnion('connected', [zAdsConnected, zAdsNotConnected]);
export type AdsReport = z.infer<typeof zAdsReport>;
export type AdsConnectedReport = z.infer<typeof zAdsConnected>;

/** POST /ads/refresh: how many ad-day rows the pull wrote ("Pulled {n} ad-day rows from Meta."). */
export const zAdsRefreshResult = z.object({ rowsUpserted: z.number().int() });
export type AdsRefreshResult = z.infer<typeof zAdsRefreshResult>;

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  adsCampaignStatuses: z.array(z.object({ value: zAdsCampaignStatus, label: z.string(), tone: zTone })),
});
export type AdsMeta = z.infer<typeof metaFragment>;
