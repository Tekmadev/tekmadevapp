import { z } from 'zod';

import { zInstant, zPage, zTone } from '../types';

/**
 * Schemas for the "email" domain (contract section 11, Marketing > Email; brief 8.11).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * This app never sends email. Campaigns are tracking registrations for emails
 * the CRM sends: the campaign `key` is the `c=` value in a template's pixel and links.
 */

/* ------------------------------------------------------------------ */
/* Overview and campaigns                                              */
/* ------------------------------------------------------------------ */

export const zEmailStats = z.object({
  activeSubscribers: z.number().int(),
  new30d: z.number().int(),
  opens30d: z.number().int(),
  clicks30d: z.number().int(),
});
export type EmailStats = z.infer<typeof zEmailStats>;

export const zCampaign = z.object({
  id: z.string(),
  /** Lowercase letters, digits and dashes, e.g. "welcome" or "newsletter-2026-07". */
  key: z.string(),
  name: z.string(),
  subject: z.string().nullable(),
  /** A template key from GET /email/templates, or free text. */
  template: z.string().nullable(),
  /** The "Note" field of the form. */
  description: z.string().nullable(),
  /** Counted since this campaign was added (re-adding a key starts again from 0). */
  opens: z.number().int(),
  clicks: z.number().int(),
  /** Paused is a label only: opens and clicks are still counted. */
  active: z.boolean(),
  createdAt: zInstant,
});
export type Campaign = z.infer<typeof zCampaign>;

export const zEngagementType = z.enum(['open', 'click']);
export type EngagementType = z.infer<typeof zEngagementType>;

export const zEngagementEvent = z.object({
  id: z.string(),
  at: zInstant,
  type: zEngagementType,
  campaignKey: z.string(),
  /** The clicked URL. Null for opens. */
  link: z.string().nullable(),
  /** "mobile", "desktop" or "tablet". */
  device: z.string().nullable(),
  /** Country name, e.g. "Canada". */
  country: z.string().nullable(),
});
export type EngagementEvent = z.infer<typeof zEngagementEvent>;

/** GET /email/overview. `recentEvents` is the latest opens and clicks, newest first. */
export const zEmailOverview = z.object({
  stats: zEmailStats,
  campaigns: z.array(zCampaign),
  recentEvents: z.array(zEngagementEvent),
});
export type EmailOverview = z.infer<typeof zEmailOverview>;

/** Body of POST /email/campaigns. */
export type CampaignCreate = {
  key: string;
  name: string;
  subject?: string | null;
  template?: string | null;
  description?: string | null;
};

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /email/templates. `html` is copied exactly (it carries the
 * `{{contact.first_name}}` and `{{unsubscribe}}` merge tags the CRM fills in);
 * `previewHtml` has sample values for the WebView preview. `key` is the
 * campaign key its tracking pixel and links use.
 */
export const zEmailTemplate = z.object({
  key: z.string(),
  name: z.string(),
  subject: z.string(),
  useWhen: z.string(),
  html: z.string(),
  previewHtml: z.string(),
});
export type EmailTemplate = z.infer<typeof zEmailTemplate>;
export const zEmailTemplates = z.array(zEmailTemplate);

/* ------------------------------------------------------------------ */
/* Subscribers and consent                                             */
/* ------------------------------------------------------------------ */

export const zSubscriberStatus = z.enum(['active', 'unsubscribed', 'bounced', 'complained']);
export type SubscriberStatus = z.infer<typeof zSubscriberStatus>;
export const SUBSCRIBER_STATUSES: readonly SubscriberStatus[] = zSubscriberStatus.options;

/** Why they left (the unsubscribe page asks). Labels come from GET /meta. */
export const zUnsubscribeReason = z.enum(['too_many', 'not_relevant', 'never_signed_up', 'other']);
export type UnsubscribeReason = z.infer<typeof zUnsubscribeReason>;

/** Where an unsubscribe came from ("via the unsubscribe page", "via the CRM"...). */
export const zUnsubscribeSource = z.enum(['unsubscribe_page', 'crm', 'crm_permanent', 'admin']);
export type UnsubscribeSource = z.infer<typeof zUnsubscribeSource>;

export const zSubscriber = z.object({
  id: z.string(),
  email: z.string(),
  /** Where they signed up (a key with a label in GET /meta `subscriberSources`; show the key when unknown). */
  source: z.string(),
  status: zSubscriberStatus,
  /** Set when they said why they left. */
  reason: zUnsubscribeReason.nullable(),
  /** Set for unsubscribed rows. */
  unsubscribeSource: zUnsubscribeSource.nullable(),
  /** The "CRM / No CRM" badge: a CRM contact exists for this address. */
  inCrm: z.boolean(),
  /** Country name, e.g. "Canada". */
  country: z.string().nullable(),
  signedUpAt: zInstant,
  /** When the status last left "active" (unsubscribe, bounce or complaint). */
  unsubscribedAt: zInstant.nullable(),
});
export type Subscriber = z.infer<typeof zSubscriber>;

export const zSubscriberPage = zPage(zSubscriber);
export type SubscriberPage = z.infer<typeof zSubscriberPage>;

/** Timeline entries: subscribed, resubscribed, unsubscribed, bounced, "Marked as spam", "Said why they left". */
export const zConsentEventType = z.enum(['subscribed', 'resubscribed', 'unsubscribed', 'bounced', 'complained', 'reason']);
export type ConsentEventType = z.infer<typeof zConsentEventType>;

export const zConsentEvent = z.object({
  at: zInstant,
  event: zConsentEventType,
  /** Where it happened: a signup source key, or an unsubscribe source key ("unsubscribe_page", "crm"...). */
  source: z.string(),
  /** Privacy policy version in force (null for bounces and complaints). */
  policyVersion: z.string().nullable(),
  /** For "reason" and "unsubscribed" events, when they said why. */
  reason: zUnsubscribeReason.optional(),
});
export type ConsentEvent = z.infer<typeof zConsentEvent>;

/**
 * GET /email/subscribers/:id, and what POST .../unsubscribe returns.
 * Consent history is newest first.
 */
export const zSubscriberDetail = z.object({
  subscriber: zSubscriber,
  consentHistory: z.array(zConsentEvent),
});
export type SubscriberDetail = z.infer<typeof zSubscriberDetail>;

/* ------------------------------------------------------------------ */
/* GET /meta fragment                                                  */
/* ------------------------------------------------------------------ */

const zLabel = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string() });

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  /** Active gold; unsubscribed, bounced and complained muted. */
  subscriberStatuses: z.array(z.object({ value: zSubscriberStatus, label: z.string(), tone: zTone })),
  /** "Too many emails", "Not relevant to me", "I never signed up", "Something else". */
  unsubscribeReasons: z.array(zLabel(zUnsubscribeReason)),
  /** "via the unsubscribe page", "via the CRM", "via the CRM, as permanent", "via the admin". */
  unsubscribeSources: z.array(zLabel(zUnsubscribeSource)),
  /** Labels for signup sources ("Website footer", "Free tool"...). */
  subscriberSources: z.array(zLabel(z.string())),
  consentEvents: z.array(zLabel(zConsentEventType)),
  /** Active gold, paused muted. */
  campaignStatuses: z.array(z.object({ value: z.enum(['active', 'paused']), label: z.string(), tone: zTone })),
  /** Open muted, click gold. */
  engagementTypes: z.array(z.object({ value: zEngagementType, label: z.string(), tone: zTone })),
});
export type EmailMeta = z.infer<typeof metaFragment>;
