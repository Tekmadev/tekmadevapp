import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import { zDemoPage, zDemoRequest, type DemoBusiness, type DemoListStatus, type DemoPage, type DemoRequest, type DemoStatus } from '../schemas/demos';

/**
 * Typed endpoints and query keys for demo requests (contract "Demo requests:
 * API contract v1", 2026-10-05). The list pages newest first with an opaque
 * cursor and carries `counts` for the filter chips. Every write answers the
 * full request (with its events), which the screens put straight in the cache.
 */

export const DEMOS_PAGE_SIZE = 30;

/** Requests on a client's or a lead's Demo card: one page, every status. */
export const DEMO_CARD_LIMIT = 20;

export type DemoListParams = {
  /** One status, `open` (requested, building, ready) or `all`. Default `open`. */
  status?: DemoListStatus | null;
  /** Only the caller's own requests. */
  mine?: boolean;
  clientId?: string | null;
  leadId?: string | null;
  /** Page size (default 30, max 100). */
  limit?: number;
};

/** Normalised so equal filters always share one cache entry. */
const listKeyParams = (params: DemoListParams) => ({
  status: params.status ?? 'open',
  mine: params.mine === true,
  clientId: params.clientId || null,
  leadId: params.leadId || null,
  limit: params.limit ?? DEMOS_PAGE_SIZE,
});

/** Who a Demo card is for: a client or a lead. */
export type DemoTarget = { clientId: string; leadId?: undefined } | { leadId: string; clientId?: undefined };

export const demoKeys = {
  all: ['demos'] as const,
  lists: () => ['demos', 'list'] as const,
  list: (params: DemoListParams) => ['demos', 'list', listKeyParams(params)] as const,
  /** A client's or a lead's Demo card (a plain page, not infinite): under lists(), so list refreshes reach it. */
  card: (target: DemoTarget) => ['demos', 'list', 'card', listKeyParams({ ...target, status: 'all', limit: DEMO_CARD_LIMIT })] as const,
  details: () => ['demos', 'detail'] as const,
  detail: (id: string) => ['demos', 'detail', id] as const,
};

/** GET /demos?status=&mine=1&clientId=&leadId=&cursor=&limit=: newest first by createdAt. */
export function getDemos(params: DemoListParams & { cursor?: string | null }, signal?: AbortSignal) {
  const key = listKeyParams(params);
  return api.get<DemoPage>('/demos', {
    query: {
      status: key.status,
      mine: key.mine ? 1 : undefined,
      clientId: key.clientId ?? undefined,
      leadId: key.leadId ?? undefined,
      // Passed back exactly as the server sent it.
      cursor: params.cursor ?? undefined,
      limit: key.limit,
    },
    schema: zDemoPage,
    signal,
  });
}

/** GET /demos/:id -> the request with its events (oldest first). 404 `not_found` when it is gone. */
export function getDemo(id: string, signal?: AbortSignal) {
  return api.get<DemoRequest>(`/demos/${seg(id)}`, { schema: zDemoRequest, signal });
}

/** The business fields as the form sends them (blank optional fields as null). */
export type DemoBusinessInput = DemoBusiness;

/** POST /demos: exactly one of clientId / leadId. */
export type NewDemoInput = ({ clientId: string; leadId?: undefined } | { leadId: string; clientId?: undefined }) & {
  business: DemoBusinessInput;
  wants?: string | null;
  neededBy?: string | null;
  /**
   * Already built (needs `demos.manage`, else 403 `forbidden`): an https link,
   * and the request starts ready with the caller as the builder. Null or
   * blank: an ordinary request.
   */
  demoUrl?: string | null;
};

/**
 * POST /demos -> 201 the request. The key goes in the body (the contract) and
 * in the Idempotency-Key header (like every other create): the same key and
 * body return the first result, so a retry never asks twice.
 * 400 `target`, 400 `validation` (fields, `demoUrl` included), 403 `forbidden`
 * for a link without `demos.manage`, 409 `idempotency_conflict` for the key
 * with a different body (a different link too), 404 for an unknown client or lead.
 */
export function createDemo(input: NewDemoInput, idempotencyKey: string) {
  return api.post<DemoRequest>('/demos', { ...input, idempotencyKey }, { schema: zDemoRequest, idempotencyKey });
}

/**
 * PATCH /demos/:id: only the keys sent change; null clears. Status, link,
 * builder and note need `demos.manage`, except a requester marking their own
 * request shown (when ready) or cancelled (while requested or building).
 */
export type DemoPatch = {
  business?: Partial<DemoBusinessInput>;
  wants?: string | null;
  neededBy?: string | null;
  status?: DemoStatus;
  demoUrl?: string | null;
  builderEmail?: string | null;
  builderNote?: string | null;
};

/**
 * PATCH /demos/:id -> the full request with events. 409 `demo_closed` once
 * shown or cancelled, 400 `demo_url` "Add the demo link first." for ready
 * without a link, 403 `forbidden` when it is not yours and you cannot manage.
 */
export function updateDemo(id: string, patch: DemoPatch) {
  return api.patch<DemoRequest>(`/demos/${seg(id)}`, patch, { schema: zDemoRequest });
}

export function demosInfiniteQuery(params: DemoListParams = {}) {
  return infiniteQueryOptions({
    queryKey: demoKeys.list(params),
    queryFn: ({ pageParam, signal }) => getDemos({ ...params, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function demoQuery(id: string) {
  return queryOptions({
    queryKey: demoKeys.detail(id),
    queryFn: ({ signal }) => getDemo(id, signal),
  });
}

/** The Demo card on a client or a lead: their newest requests, every status. */
export function demoCardQuery(target: DemoTarget) {
  return queryOptions({
    queryKey: demoKeys.card(target),
    queryFn: ({ signal }) => getDemos({ ...target, status: 'all', limit: DEMO_CARD_LIMIT }, signal),
  });
}
