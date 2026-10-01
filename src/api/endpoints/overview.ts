import { keepPreviousData, queryOptions } from '@tanstack/react-query';

import { api } from '../client';
import { zOverview, type Overview } from '../schemas/overview';
import { search, sessionKeys } from './session';

/** Typed endpoints and query keys for the "overview" domain (Home, brief 8.3), plus the search query helper. */

export const overviewKeys = {
  all: ['overview'] as const,
};

/**
 * GET /overview: KPIs, "Needs you", the 30 day traffic block, top links, recent
 * leads and subscriptions and the caller's inbox summary, in one call.
 */
export function getOverview(signal?: AbortSignal) {
  return api.get<Overview>('/overview', { schema: zOverview, signal });
}

export function overviewQuery() {
  return queryOptions({
    queryKey: overviewKeys.all,
    queryFn: ({ signal }) => getOverview(signal),
  });
}

/**
 * GET /search?q= for the SearchSheet (the function and keys live in
 * endpoints/session.ts). The query is trimmed so "acme" and "acme " share a
 * cache entry; an empty query never fetches. Earlier results stay on screen
 * while the next keystroke loads, and results are not persisted (they are
 * cheap, and recent searches are remembered separately).
 */
export function searchQuery(q: string) {
  const term = q.trim();
  return queryOptions({
    queryKey: sessionKeys.search(term),
    queryFn: ({ signal }) => search(term, signal),
    enabled: term.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    meta: { persist: false },
  });
}
