import { queryOptions, useQuery } from '@tanstack/react-query';

import { getMeta, sessionKeys } from '@/api/endpoints/session';

/**
 * GET /meta (every enum label, the intake schema, stage day ranges). It barely
 * changes, so it stays fresh for an hour and is shared under the session's
 * `['meta']` key with every other screen that reads it.
 */

const HOUR = 60 * 60 * 1000;

export function metaQuery() {
  return queryOptions({
    queryKey: sessionKeys.meta,
    queryFn: ({ signal }) => getMeta(signal),
    staleTime: HOUR,
  });
}

export function useMeta() {
  return useQuery(metaQuery());
}
