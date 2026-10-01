import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import { zLead, zLeadPage, type Lead, type LeadNeed, type LeadPage, type LeadSource, type LeadStatus } from '../schemas/leads';

/**
 * Typed endpoints and query keys for the "leads" domain (brief 8.6).
 * Search and filters run on the server; the list pages with an opaque cursor.
 * The "Lead forms" section is the same list filtered to source `grow`.
 */

export const LEADS_PAGE_SIZE = 30;

export type LeadListParams = {
  /** Free text: name, email, business or phone. */
  q?: string | null;
  source?: LeadSource | null;
  status?: LeadStatus | null;
  need?: LeadNeed | null;
  /** Page size (default 30, max 100). */
  limit?: number;
};

/** Normalised so equal filters always share one cache entry. */
const listKeyParams = (params: LeadListParams) => ({
  q: params.q?.trim() || null,
  source: params.source ?? null,
  status: params.status ?? null,
  need: params.need ?? null,
  limit: params.limit ?? LEADS_PAGE_SIZE,
});

export const leadKeys = {
  all: ['leads'] as const,
  lists: () => ['leads', 'list'] as const,
  list: (params: LeadListParams) => ['leads', 'list', listKeyParams(params)] as const,
  detail: (id: string) => ['leads', 'detail', id] as const,
};

/** GET /leads?q=&source=&status=&need=&cursor=: newest first. */
export function getLeads(params: LeadListParams & { cursor?: string | null }, signal?: AbortSignal) {
  const key = listKeyParams(params);
  return api.get<LeadPage>('/leads', {
    query: {
      q: key.q ?? undefined,
      source: key.source ?? undefined,
      status: key.status ?? undefined,
      need: key.need ?? undefined,
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
