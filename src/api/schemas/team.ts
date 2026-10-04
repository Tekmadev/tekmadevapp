import { z } from 'zod';

import { zInstant, zRole, zTone } from '../types';
import { zCreditRole } from './clients';
import { zStaffRef } from './leads';

/**
 * Schemas for the "team" domain (contract section 11, Sales and settings; brief 8.16),
 * plus staff management (the website's docs/admin-api/staff.md): pausing
 * access and the activity board.
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 */

export const zTeamMember = z.object({
  /** The login and the key for PATCH and DELETE /team/:email. */
  email: z.string(),
  name: z.string().nullable(),
  role: zRole,
  /** Null: never signed in. */
  lastSignInAt: zInstant.nullable(),
  addedAt: zInstant,
  /** Set by the server environment: show a lock, it is never re-roled, paused or removed. */
  envOwner: z.boolean(),
  /*
   * Staff management (optional: servers and caches from before it do not send
   * them; read undefined as not paused).
   */
  /** Access paused: cannot sign in, gets no pushes. Nothing is deleted. */
  paused: z.boolean().optional(),
  /** When it was paused; null when not paused. */
  pausedAt: zInstant.nullable().optional(),
  /** Who paused them; null when not paused. */
  pausedBy: zStaffRef.nullable().optional(),
});
export type TeamMember = z.infer<typeof zTeamMember>;

/** GET /team: env owners, then owners, then managers and staff, oldest first. Paused people stay in the list. */
export const zTeam = z.array(zTeamMember);
export type Team = z.infer<typeof zTeam>;

export const zTeamRemoveResult = z.object({ email: z.string(), deleted: z.literal(true) });
export type TeamRemoveResult = z.infer<typeof zTeamRemoveResult>;

/* ---------- the activity board ---------- */

/** Toronto calendar days: today and the 6 (or 29) days before it, or everything. */
export const zActivityRange = z.enum(['7d', '30d', 'all']);
export type ActivityRange = z.infer<typeof zActivityRange>;

/** One of a person's credit rows on a client created in the range, newest client first. */
export const zActivityCredit = z.object({
  clientId: z.string(),
  businessName: z.string(),
  role: zCreditRole,
  /** 0.01 to 100, two decimals at most. */
  share: z.number(),
  /** When the client was created. */
  wonAt: zInstant,
});
export type ActivityCredit = z.infer<typeof zActivityCredit>;

export const zStaffActivityRow = z.object({
  email: z.string(),
  name: z.string().nullable(),
  role: zRole,
  paused: z.boolean(),
  /** Leads they added by hand (they are its finder), created in the range. */
  leadsFound: z.number(),
  /** Touches they logged in the range, by kind. */
  touches: z.object({
    call: z.number(),
    email: z.number(),
    dm: z.number(),
    meeting: z.number(),
    other: z.number(),
    total: z.number(),
  }),
  /** Leads assigned to them with a follow-up today (Toronto) or before today. Not ranged. */
  followUps: z.object({ dueToday: z.number(), overdue: z.number() }),
  /** Leads they booked, booked in the range. */
  callsBooked: z.number(),
  /** Their credit shares / 100 over clients created in the range: 1.5 is one whole client and a half. */
  clientsWon: z.number(),
  /** Distinct clients where they changed or added a task, logged a call, or wrote a note or an update, in the range. */
  clientsHelped: z.number(),
  credits: z.array(zActivityCredit),
});
export type StaffActivityRow = z.infer<typeof zStaffActivityRow>;

/** GET /team/activity (everyone) and GET /me/activity (exactly one row, the caller's). */
export const zStaffActivity = z.object({
  range: zActivityRange,
  /** Start of the range: Toronto midnight as an instant; null for all time. */
  since: zInstant.nullable(),
  /** YYYY-MM-DD in Toronto: what "due today" means. */
  today: z.string(),
  rows: z.array(zStaffActivityRow),
});
export type StaffActivity = z.infer<typeof zStaffActivity>;

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  /** The role picker and badges: Owner gold, Manager neutral, with the help line under each choice. */
  teamRoles: z.array(z.object({ value: zRole, label: z.string(), help: z.string(), tone: zTone })),
  /**
   * The credits editor's roles: Finder, Booker, Other with their help lines.
   * Optional: a meta cached before staff management has none (the app's table is the fallback).
   */
  creditRoles: z.array(z.object({ value: zCreditRole, label: z.string(), help: z.string() })).optional(),
  /** The activity board's range chips: 7 days, 30 days, All time. Optional like creditRoles. */
  activityRanges: z.array(z.object({ value: zActivityRange, label: z.string() })).optional(),
});
export type TeamMeta = z.infer<typeof metaFragment>;
