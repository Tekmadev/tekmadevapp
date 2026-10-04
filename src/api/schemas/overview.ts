import { z } from 'zod';

import { zInstant, zLabelCount } from '../types';
import { zAnalyticsPoint } from './analytics';
import { zSubscription } from './billing';
import { zOnboardingStage } from './clients';
import { zLead } from './leads';
import { zNotificationSummary } from './notifications';

/**
 * Schemas for the "overview" domain: GET /overview, the Home screen in one call
 * (contract section 11; brief 8.3). Validation only: no transforms, no defaults
 * (see src/api/types.ts).
 *
 * Every number is computed by the server from the same rows the other screens
 * list, so a count on Home always matches the list it opens.
 */

/** The 2 x 2 KPI grid. */
export const zOverviewKpis = z.object({
  /** Every lead (GET /leads with no filters). */
  totalLeads: z.number().int(),
  /** Leads with status `booked`. */
  bookedCalls: z.number().int(),
  /**
   * Live-mode subscriptions that are active, trialing or past due, Webline Care
   * included. Null without `overview.revenue` (staff): hidden, never sent as 0.
   */
  activeSubs: z.number().int().nullable(),
  /** Pageviews over the last 30 days: the `total` of GET /analytics?range=30d. */
  pageviews30d: z.number().int(),
});
export type OverviewKpis = z.infer<typeof zOverviewKpis>;

/** "Needs you" counts. Real clients only (test clients never count). */
export const zOverviewAttention = z.object({
  /** Open needs-action rows in the caller's inbox (same as `inbox.needsAction`). */
  needsAction: z.number().int(),
  /** Clients whose current onboarding run is blocked. */
  blockedOnboardings: z.number().int(),
  /** CRM appointments waiting for review, summed over every client. */
  callsToReview: z.number().int(),
  /** Clients whose latest intake is submitted and not reviewed yet. */
  intakesToReview: z.number().int(),
  /** Live clients behind pace on a guarantee that is still running. */
  behindPace: z.number().int(),
});
export type OverviewAttention = z.infer<typeof zOverviewAttention>;

/** One client behind a "Needs you" card. `url` is the web admin path of the section that needs you. */
const attentionClient = {
  clientId: z.string(),
  businessName: z.string(),
  /** e.g. "/admin/clients/cl_x#calls" (mapped with src/lib/deeplinks.ts). */
  url: z.string(),
};

/**
 * The clients behind each client card, so a card opens the exact list it
 * counts. Beyond the contract: requested in docs/api-requests/overview.md.
 * Lengths (and the sum of `count` for calls) equal the `attention` numbers.
 */
export const zAttentionClients = z.object({
  blockedOnboardings: z.array(
    z.object({
      ...attentionClient,
      /** Derived stage of the blocked run. */
      stage: zOnboardingStage.nullable(),
      blockedReason: z.string().nullable(),
    }),
  ),
  callsToReview: z.array(z.object({ ...attentionClient, count: z.number().int() })),
  intakesToReview: z.array(z.object({ ...attentionClient, version: z.number().int(), submittedAt: zInstant.nullable() })),
  behindPace: z.array(
    z.object({
      ...attentionClient,
      counted: z.number().int(),
      target: z.number().int(),
      expectedByNow: z.number().int(),
      daysLeft: z.number().int(),
    }),
  ),
});
export type AttentionClients = z.infer<typeof zAttentionClients>;

/** The 30 day traffic block: the same numbers as GET /analytics?range=30d. */
export const zOverviewTraffic = z.object({
  /** 30 daily points, oldest first. Labels are local Toronto text: never parse them as dates. */
  series: z.array(zAnalyticsPoint),
  /** Every source, biggest first (the Donut groups everything past the top 7 as Other). */
  topSources: z.array(zLabelCount),
  /** Top 10 pages. */
  topPages: z.array(zLabelCount),
});
export type OverviewTraffic = z.infer<typeof zOverviewTraffic>;

/** A short link and its visits over the same 30 Toronto days as the traffic block. */
export const zTopLink = z.object({
  id: z.string(),
  slug: z.string(),
  /** The link's internal label (null when it has none: show "/<slug>"). */
  label: z.string().nullable(),
  count: z.number().int(),
});
export type TopLink = z.infer<typeof zTopLink>;

export const zOverview = z.object({
  kpis: zOverviewKpis,
  attention: zOverviewAttention,
  attentionClients: zAttentionClients,
  traffic: zOverviewTraffic,
  /**
   * Top 10 short links with clicks in the period, busiest first. Empty when none
   * had a visit. Null without `links.view`.
   */
  topLinks: z.array(zTopLink).nullable(),
  /** The 8 newest leads (the first rows of GET /leads). */
  recentLeads: z.array(zLead),
  /**
   * The 8 newest live-mode subscriptions (the first rows of GET /billing/subscriptions).
   * Null without `overview.revenue` (staff), never an empty list.
   */
  recentSubscriptions: z.array(zSubscription).nullable(),
  /** The caller's inbox summary (same as GET /notifications/summary). */
  inbox: zNotificationSummary,
});
export type Overview = z.infer<typeof zOverview>;

/** This domain's slice of GET /meta (composed in schemas/meta.ts). Home needs no enums of its own. */
export const metaFragment = z.object({});
export type OverviewMeta = z.infer<typeof metaFragment>;
