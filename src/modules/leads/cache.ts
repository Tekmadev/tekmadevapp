import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { leadKeys } from '@/api/endpoints/leads';
import { overviewKeys } from '@/api/endpoints/overview';
import type { Lead, LeadPage, LogTouchResult, TouchPage } from '@/api/schemas/leads';

/**
 * Cache updates after an outreach write. Every write answers the full lead, so
 * the detail and any list row showing it take that lead at once; then what the
 * web admin refreshes after the same write refetches in the background:
 * the leads lists (a status, follow-up or owner can move a lead in or out of a
 * filter) and, when the write can change Home (a new lead, a new status), the
 * overview.
 */

type ListData = InfiniteData<LeadPage> | LeadPage;

const replaceIn = (items: Lead[], lead: Lead): Lead[] => (items.some((l) => l.id === lead.id) ? items.map((l) => (l.id === lead.id ? lead : l)) : items);

/** The lead into its detail and every cached list row with its id (infinite lists and the Lead forms page). */
export function applyLead(queryClient: QueryClient, lead: Lead) {
  queryClient.setQueryData<Lead>(leadKeys.detail(lead.id), lead);
  queryClient.setQueriesData<ListData>({ queryKey: leadKeys.lists() }, (old) => {
    if (!old) return old;
    if ('pages' in old) return { ...old, pages: old.pages.map((page) => ({ ...page, items: replaceIn(page.items, lead) })) };
    return { ...old, items: replaceIn(old.items, lead) };
  });
}

/** After POST /leads/:id/touches: the lead, and the touch on top of the timeline (the refetch puts it in its exact place). */
export function applyTouchResult(queryClient: QueryClient, result: LogTouchResult) {
  applyLead(queryClient, result.lead);
  queryClient.setQueryData<InfiniteData<TouchPage>>(leadKeys.touches(result.lead.id), (old) => {
    if (!old || old.pages.length === 0) return old;
    const [first, ...rest] = old.pages;
    if (first.items.some((t) => t.id === result.touch.id)) return old;
    return { ...old, pages: [{ ...first, items: [result.touch, ...first.items] }, ...rest] };
  });
}

export type RefreshScope = {
  /** The lead's touches (after logging one). */
  touches?: string;
  /** Home: total leads, booked calls and recent leads (a new lead, a changed status). */
  overview?: boolean;
};

/** What the web admin refreshes after a lead write. The returned lead is already in the cache, so nothing jumps. */
export function refreshAfterLeadWrite(queryClient: QueryClient, scope: RefreshScope = {}) {
  void queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
  if (scope.touches) void queryClient.invalidateQueries({ queryKey: leadKeys.touches(scope.touches) });
  if (scope.overview) void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
}
