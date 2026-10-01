import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import {
  zToolStats,
  zToolSubmissionDetail,
  zToolSubmissionPage,
  type ToolStats,
  type ToolSubmissionDetail,
  type ToolSubmissionPage,
} from '../schemas/tools';

/** Typed endpoints and query keys for the "tools" domain (Free tools, brief 8.7). */

export const TOOL_SUBMISSIONS_PAGE_SIZE = 30;

export const toolKeys = {
  all: ['tools'] as const,
  stats: () => ['tools', 'stats'] as const,
  submissions: (limit: number = TOOL_SUBMISSIONS_PAGE_SIZE) => ['tools', 'submissions', { limit }] as const,
  submission: (id: string) => ['tools', 'submission', id] as const,
};

/** GET /tools/stats: Submissions, Last 30 days, Newsletter opt-ins, Leak reported. */
export function getToolStats(signal?: AbortSignal) {
  return api.get<ToolStats>('/tools/stats', { schema: zToolStats, signal });
}

/** GET /tools/submissions?cursor=: newest first. */
export function getToolSubmissions(params: { cursor?: string | null; limit?: number } = {}, signal?: AbortSignal) {
  return api.get<ToolSubmissionPage>('/tools/submissions', {
    // The cursor goes back exactly as the server sent it.
    query: { cursor: params.cursor ?? undefined, limit: params.limit ?? TOOL_SUBMISSIONS_PAGE_SIZE },
    schema: zToolSubmissionPage,
    signal,
  });
}

/** GET /tools/submissions/:id: the answers and the computed breakdown. */
export function getToolSubmission(id: string, signal?: AbortSignal) {
  return api.get<ToolSubmissionDetail>(`/tools/submissions/${seg(id)}`, { schema: zToolSubmissionDetail, signal });
}

export function toolStatsQuery() {
  return queryOptions({
    queryKey: toolKeys.stats(),
    queryFn: ({ signal }) => getToolStats(signal),
  });
}

export function toolSubmissionsInfiniteQuery(limit: number = TOOL_SUBMISSIONS_PAGE_SIZE) {
  return infiniteQueryOptions({
    queryKey: toolKeys.submissions(limit),
    queryFn: ({ pageParam, signal }) => getToolSubmissions({ cursor: pageParam, limit }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function toolSubmissionQuery(id: string) {
  return queryOptions({
    queryKey: toolKeys.submission(id),
    queryFn: ({ signal }) => getToolSubmission(id, signal),
  });
}
