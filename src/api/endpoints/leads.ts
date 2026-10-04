import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import {
  zAssignees,
  zLead,
  zLeadPage,
  zLogTouchResult,
  zTouchPage,
  type Lead,
  type LeadNeed,
  type LeadPage,
  type LeadRevenue,
  type LeadSource,
  type LeadStatus,
  type LeadsMeta,
  type LogTouchResult,
  type SettableLeadStatus,
  type StaffRef,
  type TouchKind,
  type TouchPage,
} from '../schemas/leads';
import type { Meta } from '../schemas/meta';
import { getMeta, sessionKeys } from './session';

/**
 * Typed endpoints and query keys for the "leads" domain (brief 8.6) and its
 * outreach endpoints (the website's docs/admin-api/outreach.md): adding a lead
 * by hand, touches, follow-ups and who owns a lead.
 * Search and filters run on the server; the lists page with an opaque cursor.
 * The "Lead forms" section is the same list filtered to source `grow`.
 */

export const LEADS_PAGE_SIZE = 30;

/** Rows in the "Lead forms" section above the Leads list ("View all" filters the list to them). */
export const LEAD_FORMS_ROWS = 3;

/** Touches per page on the lead detail. */
export const TOUCHES_PAGE_SIZE = 30;

/**
 * The follow-up queue: at or before now (`due`), after now (`upcoming`), or
 * any planned (`any`). With one, the list is sorted soonest follow-up first.
 */
export type LeadFollowUpFilter = 'due' | 'upcoming' | 'any';

export type LeadListParams = {
  /** Free text: name, email, business or phone. */
  q?: string | null;
  source?: LeadSource | null;
  status?: LeadStatus | null;
  need?: LeadNeed | null;
  /** `me`, `none` or a team member's email. */
  assigned?: string | null;
  followUp?: LeadFollowUpFilter | null;
  /** Page size (default 30, max 100). */
  limit?: number;
};

/** Normalised so equal filters always share one cache entry. */
const listKeyParams = (params: LeadListParams) => ({
  q: params.q?.trim() || null,
  source: params.source ?? null,
  status: params.status ?? null,
  need: params.need ?? null,
  assigned: params.assigned?.trim() || null,
  followUp: params.followUp ?? null,
  limit: params.limit ?? LEADS_PAGE_SIZE,
});

export const leadKeys = {
  all: ['leads'] as const,
  lists: () => ['leads', 'list'] as const,
  list: (params: LeadListParams) => ['leads', 'list', listKeyParams(params)] as const,
  /** The "Lead forms" section (a plain page, not infinite): under lists(), so list refreshes reach it. */
  forms: (params: LeadListParams) => ['leads', 'list', 'forms', listKeyParams({ ...params, source: 'grow' })] as const,
  detail: (id: string) => ['leads', 'detail', id] as const,
  /** A lead's touches, newest first (infinite). */
  touches: (id: string) => ['leads', 'touches', id] as const,
  /** Everyone a lead can be assigned to. */
  assignees: () => ['leads', 'assignees'] as const,
};

/** GET /leads?q=&source=&status=&need=&assigned=&followUp=&cursor=: newest first (soonest follow-up first with followUp). */
export function getLeads(params: LeadListParams & { cursor?: string | null }, signal?: AbortSignal) {
  const key = listKeyParams(params);
  return api.get<LeadPage>('/leads', {
    query: {
      q: key.q ?? undefined,
      source: key.source ?? undefined,
      status: key.status ?? undefined,
      need: key.need ?? undefined,
      assigned: key.assigned ?? undefined,
      followUp: key.followUp ?? undefined,
      // Passed back exactly as the server sent it.
      cursor: params.cursor ?? undefined,
      limit: key.limit,
    },
    schema: zLeadPage,
    signal,
  });
}

/** GET /leads/:id: every field, the message and the attribution. */
export function getLead(id: string, signal?: AbortSignal) {
  return api.get<Lead>(`/leads/${seg(id)}`, { schema: zLead, signal });
}

/**
 * POST /leads: a lead added by hand (source `outreach`). Every key is optional
 * but the server needs a name or a business, and an email or a phone number.
 * Without `assignedTo` the lead is assigned to the person adding it.
 */
export type NewLeadInput = {
  name?: string | null;
  business?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  need?: LeadNeed | null;
  revenue?: LeadRevenue | null;
  /** What you know about them. */
  message?: string | null;
  status?: SettableLeadStatus;
  followUpAt?: string | null;
  /** A team member's email; null: nobody. Absent: the caller. */
  assignedTo?: string | null;
};

/** POST /leads (Idempotency-Key) -> 201 the full Lead. 409 `duplicate` when the email is already a lead. */
export function createLead(input: NewLeadInput, idempotencyKey: string) {
  return api.post<Lead>('/leads', input, { schema: zLead, idempotencyKey });
}

/** PATCH /leads/:id: only the keys sent change; null clears the follow-up or the owner. */
export type LeadPatch = {
  status?: SettableLeadStatus;
  followUpAt?: string | null;
  assignedTo?: string | null;
};

/** PATCH /leads/:id -> the full Lead. */
export function updateLead(id: string, patch: LeadPatch) {
  return api.patch<Lead>(`/leads/${seg(id)}`, patch, { schema: zLead });
}

/** GET /leads/:id/touches?cursor=&limit=: newest first. */
export function getTouches(id: string, cursor: string | null, signal?: AbortSignal) {
  return api.get<TouchPage>(`/leads/${seg(id)}/touches`, {
    query: { cursor: cursor ?? undefined, limit: TOUCHES_PAGE_SIZE },
    schema: zTouchPage,
    signal,
  });
}

export type LogTouchInput = {
  kind: TouchKind;
  outcome?: string | null;
  note?: string | null;
  /** When it happened (ISO instant); absent: now (the server's clock). */
  at?: string;
  status?: SettableLeadStatus;
  /** Set or clear the next follow-up in the same call; absent: unchanged. */
  followUpAt?: string | null;
};

/**
 * POST /leads/:id/touches (Idempotency-Key) -> 201 { touch, lead }. The server
 * decides what the touch does to the lead (a call, email, DM or meeting on a
 * "new" lead makes it "contacted"); the answer carries the updated lead.
 */
export function logTouch(id: string, input: LogTouchInput, idempotencyKey: string) {
  return api.post<LogTouchResult>(`/leads/${seg(id)}/touches`, input, { schema: zLogTouchResult, idempotencyKey });
}

/** GET /leads/assignees: the whole team (any role), names and emails only, sorted by name. */
export function getAssignees(signal?: AbortSignal) {
  return api.get<StaffRef[]>('/leads/assignees', { schema: zAssignees, signal });
}

export function leadsInfiniteQuery(params: LeadListParams = {}) {
  return infiniteQueryOptions({
    queryKey: leadKeys.list(params),
    queryFn: ({ pageParam, signal }) => getLeads({ ...params, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function leadQuery(id: string) {
  return queryOptions({
    queryKey: leadKeys.detail(id),
    queryFn: ({ signal }) => getLead(id, signal),
  });
}

/** A lead's touches, newest first, a page at a time. */
export function touchesInfiniteQuery(id: string) {
  return infiniteQueryOptions({
    queryKey: leadKeys.touches(id),
    queryFn: ({ pageParam, signal }) => getTouches(id, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** The "Assigned to" choices. The team changes rarely: fresh for 10 minutes. */
export function assigneesQuery() {
  return queryOptions({
    queryKey: leadKeys.assignees(),
    queryFn: ({ signal }) => getAssignees(signal),
    staleTime: 10 * 60_000,
  });
}

/**
 * The "Lead forms" section on top of the Leads list (brief 8.6): the newest
 * lead form submissions (source `grow`) that also match the list's other
 * filters. One short page; the list itself pages through the rest.
 */
export function leadFormsQuery(params: Omit<LeadListParams, 'source'> = {}) {
  const forms: LeadListParams = { ...params, source: 'grow', limit: params.limit ?? LEAD_FORMS_ROWS };
  return queryOptions({
    queryKey: leadKeys.forms(forms),
    queryFn: ({ signal }) => getLeads(forms, signal),
  });
}

/**
 * The leads slice of GET /meta (sources, statuses with tones, needs, revenue
 * bands, touch kinds). Shares the one ['meta'] cache entry with every other
 * domain; the labels change only with a server deploy, so it stays fresh for
 * an hour.
 */
export function leadsMetaQuery() {
  return queryOptions({
    queryKey: sessionKeys.meta,
    queryFn: ({ signal }) => getMeta(signal),
    staleTime: 60 * 60_000,
    select: (meta: Meta): LeadsMeta => meta,
  });
}
