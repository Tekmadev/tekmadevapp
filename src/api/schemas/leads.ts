import { z } from 'zod';

import { zInstant, zPage, zTone } from '../types';

/**
 * Schemas for the "leads" domain (contract section 11, Customers; brief 8.6),
 * plus outreach: leads added by hand, touches, follow-ups and owners
 * (the website's docs/admin-api/outreach.md).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * Labels for sources, needs, revenue bands, statuses and touch kinds come from
 * GET /meta (the fragment at the bottom), so the app never hardcodes the
 * website's copy.
 */

/**
 * cal_booking "Booked call", grow "Lead form", lead_magnet "Free tool",
 * portal_signup "Portal sign-up", outreach "Outreach" (added by hand in the app).
 */
export const zLeadSource = z.enum(['cal_booking', 'grow', 'lead_magnet', 'portal_signup', 'outreach']);
export type LeadSource = z.infer<typeof zLeadSource>;

/** Badge tones: new gold, booked ok, everything else muted (from meta). */
export const zLeadStatus = z.enum(['new', 'booked', 'contacted', 'qualified', 'won', 'lost', 'cancelled']);
export type LeadStatus = z.infer<typeof zLeadStatus>;

/** Statuses a person may set. Booked and cancelled mirror the booking calendar (the server refuses them). */
export const zSettableLeadStatus = z.enum(['new', 'contacted', 'qualified', 'won', 'lost']);
export type SettableLeadStatus = z.infer<typeof zSettableLeadStatus>;

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

/** A team member as leads show them: the name when there is one, else the email. */
export const zStaffRef = z.object({ email: z.string(), name: z.string().nullable() });
export type StaffRef = z.infer<typeof zStaffRef>;

export const zLead = z.object({
  id: z.string(),
  /** Null when the form did not ask (some free tool and portal sign-ups): show the email. */
  name: z.string().nullable(),
  /** "" when a lead added by hand has only a phone number. */
  email: z.string(),
  phone: z.string().nullable(),
  business: z.string().nullable(),
  status: zLeadStatus,
  source: zLeadSource,
  /** Null for sources that do not ask (free tools, portal sign-ups). */
  need: zLeadNeed.nullable(),
  revenue: zLeadRevenue.nullable(),
  /** What they wrote, as typed (may be long, may contain line breaks). For outreach: what staff know about them. */
  message: z.string().nullable(),
  /** When the booked call is (or was) scheduled. Only booked calls have one. */
  bookingAt: zInstant.nullable(),
  createdAt: zInstant,
  utm: zLeadUtm,
  /** Full referrer URL of the first visit, or null for direct traffic. */
  referrer: z.string().nullable(),
  /** Set once the lead became a client (portal sign-ups are linked from the start). */
  convertedClientId: z.string().nullable(),
  /*
   * Outreach (optional: leads cached by an older build, and servers before
   * the outreach release, do not have them; read undefined as null).
   */
  /** Their site or a social profile, as typed. */
  website: z.string().nullable().optional(),
  /** The next planned contact; null: none planned. */
  followUpAt: zInstant.nullable().optional(),
  /** Who owns the lead; null: nobody. */
  assignedTo: zStaffRef.nullable().optional(),
  /** Who added it by hand (source outreach only). */
  addedBy: zStaffRef.nullable().optional(),
});
export type Lead = z.infer<typeof zLead>;

/** GET /leads: newest first (soonest follow-up first with `followUp`). */
export const zLeadPage = zPage(zLead);
export type LeadPage = z.infer<typeof zLeadPage>;

/* ---------- outreach ---------- */

/** One way of reaching out. */
export const zTouchKind = z.enum(['call', 'email', 'dm', 'meeting', 'other']);
export type TouchKind = z.infer<typeof zTouchKind>;

/** One contact attempt with a lead. */
export const zTouch = z.object({
  id: z.string(),
  leadId: z.string(),
  kind: zTouchKind,
  /** A short result in their words ("Left a voicemail"). */
  outcome: z.string().nullable(),
  /** A longer note, line breaks kept. */
  note: z.string().nullable(),
  /** Who logged it. */
  by: zStaffRef,
  /** When it happened. */
  at: zInstant,
});
export type Touch = z.infer<typeof zTouch>;

/** GET /leads/:id/touches: newest first. */
export const zTouchPage = zPage(zTouch);
export type TouchPage = z.infer<typeof zTouchPage>;

/** POST /leads/:id/touches: the touch and the lead it changed (status, follow-up). */
export const zLogTouchResult = z.object({ touch: zTouch, lead: zLead });
export type LogTouchResult = z.infer<typeof zLogTouchResult>;

/** GET /leads/assignees: everyone a lead can be assigned to, sorted by name. */
export const zAssignees = z.array(zStaffRef);

/* ---------- meta ---------- */

const option = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string() });
const tonedOption = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string(), tone: zTone });

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  leadSources: z.array(option(zLeadSource)),
  leadStatuses: z.array(tonedOption(zLeadStatus)),
  leadNeeds: z.array(option(zLeadNeed)),
  leadRevenueBands: z.array(option(zLeadRevenue)),
  /** Call, Email, DM, Meeting, Other. Optional: a meta cached before outreach has none (the app's table is the fallback). */
  leadTouchKinds: z.array(option(zTouchKind)).optional(),
});
export type LeadsMeta = z.infer<typeof metaFragment>;
