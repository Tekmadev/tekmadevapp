import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { toolKeys } from '@/api/endpoints/tools';
import type { ToolSubmission, ToolSubmissionPage } from '@/api/schemas/tools';

/**
 * The submission's row from a Free tools list already in the cache, so the
 * title, contact line and headline numbers show before the detail loads
 * (and offline, when only the list was loaded earlier).
 */
export function cachedSubmissionRow(queryClient: QueryClient, id: string): ToolSubmission | undefined {
  if (!id) return undefined;
  const lists = queryClient.getQueriesData<InfiniteData<ToolSubmissionPage>>({ queryKey: toolKeys.lists() });
  for (const [, data] of lists) {
    for (const page of data?.pages ?? []) {
      const row = page.items.find((r) => r.id === id);
      if (row) return row;
    }
  }
  return undefined;
}
