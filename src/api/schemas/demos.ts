import { z } from 'zod';

import { zDate, zInstant } from '../types';

/**
 * Schemas for demo requests (contract "Demo requests: API contract v1",
 * 2026-10-05): a salesperson asks for a demo website for a client or a lead,
 * an owner or manager builds it, then the salesperson shows it.
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * What the caller may do with a request is the server's `can` (the app only
 * renders it); the status copy is the contract's and lives in
 * src/modules/demos/labels.ts.
 */

/** requested -> building -> ready -> shown; any open status -> cancelled; ready -> building (rework). */
export const zDemoStatus = z.enum(['requested', 'building', 'ready', 'shown', 'cancelled']);
export type DemoStatus = z.infer<typeof zDemoStatus>;

/** The open statuses (the list's default filter `open`). Shown and cancelled are closed. */
export const OPEN_DEMO_STATUSES: readonly DemoStatus[] = ['requested', 'building', 'ready'];

/** GET /demos `status` filter: one status, `open` (the default) or `all`. */
export const zDemoListStatus = z.enum(['open', 'requested', 'building', 'ready', 'shown', 'cancelled', 'all']);
export type DemoListStatus = z.infer<typeof zDemoListStatus>;

/** The business the demo is for. The first four are required (1 or more characters). */
export const zDemoBusiness = z.object({
  /** 1..120 */
  name: z.string(),
  /** Kind of business ("Plumber", "Hair salon"), 1..80 */
  type: z.string(),
  /** City or area served, 1..120 */
  area: z.string(),
  /** What they sell or do, 1..1000 */
  offer: z.string(),
  /** Current website or social links, free text, 0..500 */
  website: z.string().nullable(),
  /** Logo and brand colours, free text, 0..500 */
  brand: z.string().nullable(),
  /** Who their customers are, 0..500 */
  customers: z.string().nullable(),
});
export type DemoBusiness = z.infer<typeof zDemoBusiness>;

export const zDemoEventType = z.enum(['created', 'edited', 'status', 'builder', 'link']);
export type DemoEventType = z.infer<typeof zDemoEventType>;

/** One line of a request's history. `from` and `to` are statuses, builder emails or links, by type. */
export const zDemoEvent = z.object({
  at: zInstant,
  /** The team member's email. */
  by: z.string(),
  byName: z.string().nullable(),
  type: zDemoEventType,
  from: z.string().nullable(),
  to: z.string().nullable(),
});
export type DemoEvent = z.infer<typeof zDemoEvent>;

/** What the caller may do now (server decides; the app only renders). */
export const zDemoCan = z.object({
  edit: z.boolean(),
  cancel: z.boolean(),
  markShown: z.boolean(),
  /** The builder controls: status steps, link, builder, note. */
  manage: z.boolean(),
});
export type DemoCan = z.infer<typeof zDemoCan>;

export const zDemoRequest = z.object({
  id: z.string(),
  status: zDemoStatus,
  /** At least one of clientId / leadId is set. A converted lead keeps its leadId and gains the clientId. */
  clientId: z.string().nullable(),
  /** The linked client's business name (display). */
  clientName: z.string().nullable(),
  leadId: z.string().nullable(),
  /** The linked lead's business or person name (display). */
  leadName: z.string().nullable(),
  business: zDemoBusiness,
  /** What the client wants to see in the demo, 0..2000 */
  wants: z.string().nullable(),
  /** A Toronto calendar date, when it is needed. */
  neededBy: zDate.nullable(),
  /** https URL, set when ready (required to enter `ready`). */
  demoUrl: z.string().nullable(),
  /** Who is building it (a team member email). */
  builderEmail: z.string().nullable(),
  /** Note from the builder to the salesperson, 0..1000 */
  builderNote: z.string().nullable(),
  /** Email of the team member who asked. */
  requestedBy: z.string(),
  requestedByName: z.string().nullable(),
  createdAt: zInstant,
  updatedAt: zInstant,
  readyAt: zInstant.nullable(),
  shownAt: zInstant.nullable(),
  cancelledAt: zInstant.nullable(),
  /** Detail only (GET /demos/:id), oldest first. List rows send []. */
  events: z.array(zDemoEvent),
  can: zDemoCan,
});
export type DemoRequest = z.infer<typeof zDemoRequest>;

/** Counts ignore the status filter (and `mine`) but respect clientId / leadId. `mine`: the caller's open requests. */
export const zDemoCounts = z.object({
  open: z.number().int(),
  requested: z.number().int(),
  building: z.number().int(),
  ready: z.number().int(),
  mine: z.number().int(),
});
export type DemoCounts = z.infer<typeof zDemoCounts>;

export const zDemoPage = z.object({
  items: z.array(zDemoRequest),
  nextCursor: z.string().nullable(),
  counts: zDemoCounts,
});
export type DemoPage = z.infer<typeof zDemoPage>;

/** Inline field error keys (400 `validation`), as the server names them. */
export type DemoField =
  | 'businessName'
  | 'businessType'
  | 'area'
  | 'offer'
  | 'website'
  | 'brand'
  | 'customers'
  | 'wants'
  | 'neededBy'
  | 'demoUrl'
  | 'builderEmail'
  | 'builderNote';
