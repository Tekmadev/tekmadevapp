import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { api, seg } from '../client';
import { zLinkClickPage, zShortLink, zShortLinks, type LinkClickPage, type LinkCreate, type LinksMeta, type ShortLink } from '../schemas/links';
import type { Meta } from '../schemas/meta';
import { getMeta, sessionKeys } from './session';

/**
 * Typed endpoints and query keys for the "links" domain (owner only): branded
 * short links on the root domain, and their click history.
 *
 * After a create, toggle or delete, invalidate `linkKeys.list()` (and the
 * clicks lists after a delete: the history stays, the counter goes).
 */

export const LINK_CLICKS_PAGE_SIZE = 30;

export type LinkClicksParams = {
  /** One link's history, or null/undefined for every link ("Recent clicks"). */
  linkId?: string | null;
  limit?: number;
};

const clicksKeyParams = (params: LinkClicksParams) => ({
  linkId: params.linkId ?? null,
  limit: params.limit ?? LINK_CLICKS_PAGE_SIZE,
});

export const linkKeys = {
  all: ['links'] as const,
  list: () => ['links', 'list'] as const,
  clicksLists: () => ['links', 'clicks'] as const,
  clicks: (params: LinkClicksParams) => ['links', 'clicks', clicksKeyParams(params)] as const,
};

/** GET /links: every link, newest first, with click counts and `shareUrl`. */
export function getLinks(signal?: AbortSignal) {
  return api.get<ShortLink[]>('/links', { schema: zShortLinks, signal });
}

/**
 * POST /links. The server lowercases the slug. Errors: 400 `slug`, `reserved`,
 * `destination` (with `fields`), 409 `dupe`. Links cannot be edited afterwards.
 */
export function createLink(input: LinkCreate, idempotencyKey: string) {
  return api.post<ShortLink>('/links', input, { schema: zShortLink, idempotencyKey });
}

/** PATCH /links/:id: Disable (answers 404 at once) or Enable. The only change a link allows. */
export function setLinkActive(id: string, active: boolean) {
  return api.patch<ShortLink>(`/links/${seg(id)}`, { active }, { schema: zShortLink });
}

/** DELETE /links/:id: clicks stay on record, the counter is gone and the slug can be reused. */
export function deleteLink(id: string) {
  return api.delete<null>(`/links/${seg(id)}`, { schema: z.null() });
}

/** GET /links/clicks: newest first, for one link or for all of them. */
export function getLinkClicks(params: LinkClicksParams & { cursor?: string | null }, signal?: AbortSignal) {
  return api.get<LinkClickPage>('/links/clicks', {
    query: {
      linkId: params.linkId ?? undefined,
      // Passed back exactly as the server sent it.
      cursor: params.cursor ?? undefined,
      limit: params.limit ?? LINK_CLICKS_PAGE_SIZE,
    },
    schema: zLinkClickPage,
    signal,
  });
}

export function linksQuery() {
  return queryOptions({
    queryKey: linkKeys.list(),
    queryFn: ({ signal }) => getLinks(signal),
  });
}

export function linkClicksInfiniteQuery(params: LinkClicksParams) {
  return infiniteQueryOptions({
    queryKey: linkKeys.clicks(params),
    queryFn: ({ pageParam, signal }) => getLinkClicks({ ...params, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * The links slice of GET /meta (reserved slugs, UTM suggestions, status labels
 * and tones). Shares the one ['meta'] cache entry with every other domain; the
 * values change only with a server deploy, so it stays fresh for an hour.
 */
export function linksMetaQuery() {
  return queryOptions({
    queryKey: sessionKeys.meta,
    queryFn: ({ signal }) => getMeta(signal),
    staleTime: 60 * 60_000,
    select: (meta: Meta): LinksMeta => meta,
  });
}
