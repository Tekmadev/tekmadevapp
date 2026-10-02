import { queryOptions } from '@tanstack/react-query';

import { getMeta, sessionKeys } from '@/api/endpoints/session';
import type { BlogMeta } from '@/api/schemas/blog';
import type { Meta } from '@/api/schemas/meta';

/**
 * The blog slice of GET /meta (status labels, categories as of the last meta
 * fetch). Shares the one ['meta'] cache entry with every other domain; labels
 * change only with a server deploy, so it stays fresh for an hour.
 */
export function blogMetaQuery() {
  return queryOptions({
    queryKey: sessionKeys.meta,
    queryFn: ({ signal }) => getMeta(signal),
    staleTime: 60 * 60_000,
    select: (meta: Meta): BlogMeta => meta,
  });
}
