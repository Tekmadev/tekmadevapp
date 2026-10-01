import { z } from 'zod';

import { zInstant, zPage, zTone } from '../types';

/**
 * Schemas for the "leads" domain (contract section 11, Customers; brief 8.6).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * Labels for sources, needs, revenue bands and statuses come from GET /meta
 * (the fragment at the bottom), so the app never hardcodes the website's copy.
 */

/** cal_booking "Booked call", grow "Lead form", lead_magnet "Free tool", portal_signup "Portal sign-up". */
export const zLeadSource = z.enum(['cal_booking', 'grow', 'lead_magnet', 'portal_signup']);
export type LeadSource = z.infer<typeof zLeadSource>;

/** Badge tones: new gold, booked ok, everything else muted (from meta). */
export const zLeadStatus = z.enum(['new', 'booked', 'contacted', 'qualified', 'won', 'lost', 'cancelled']);
export type LeadStatus = z.infer<typeof zLeadStatus>;

/** What the lead says they need (booking and lead forms). */
export const zLeadNeed = z.enum(['customers', 'website', 'custom', 'content', 'unsure']);
export type LeadNeed = z.infer<typeof zLeadNeed>;

/** Monthly revenue band (booking and lead forms). */
export const zLeadRevenue = z.enum(['pre', 'under_10k', '10k_20k', '20k_50k', '50k_100k', '100k_plus']);
export type LeadRevenue = z.infer<typeof zLeadRevenue>;

/** First-touch attribution. Each part is null when the visit carried no UTM tag. */
export const zLeadUtm = z.object({
  source: z.string().nullable(),
  medium: z.string().nullable(),
  campaign: z.string().nullable(),
});
export type LeadUtm = z.infer<typeof zLeadUtm>;

export const zLead = z.object({
  id: z.string(),
  /** Null when the form did not ask (some free tool and portal sign-ups): show the email. */
  name: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  business: z.string().nullable(),
  status: zLeadStatus,
  source: zLeadSource,
  /** Null for sources that do not ask (free tools, portal sign-ups). */
  need: zLeadNeed.nullable(),
  revenue: zLeadRevenue.nullable(),
  /** What they wrote, as typed (may be long, may contain line breaks). */
  message: z.string().nullable(),
  /** When the booked call is (or was) scheduled. Only booked calls have one. */
  bookingAt: zInstant.nullable(),
  createdAt: zInstant,
  utm: zLeadUtm,
  /** Full referrer URL of the first visit, or null for direct traffic. */
  referrer: z.string().nullable(),
  /** Set once the lead became a client (portal sign-ups are linked from the start). */
  convertedClientId: z.string().nullable(),
});
export type Lead = z.infer<typeof zLead>;

/** GET /leads: newest first. */
export const zLeadPage = zPage(zLead);
export type LeadPage = z.infer<typeof zLeadPage>;

/* ---------- meta ---------- */

const option = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string() });
const tonedOption = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string(), tone: zTone });

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  leadSources: z.array(option(zLeadSource)),
  leadStatuses: z.array(tonedOption(zLeadStatus)),
  leadNeeds: z.array(option(zLeadNeed)),
  leadRevenueBands: z.array(option(zLeadRevenue)),
});
export type LeadsMeta = z.infer<typeof metaFragment>;
