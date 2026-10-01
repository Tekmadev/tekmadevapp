import { queryOptions } from '@tanstack/react-query';

import { api } from '../client';
import { DEFAULT_ANALYTICS_RANGE, zAnalytics, type Analytics, type AnalyticsRange } from '../schemas/analytics';

/** Typed endpoints and query keys for the "analytics" domain (brief 8.9; Home reads 30d too). */

export const analyticsKeys = {
  all: ['analytics'] as const,
  range: (range: AnalyticsRange) => ['analytics', range] as const,
};

/** GET /analytics?range=: totals, the chart series and the top lists for one range. */
export function getAnalytics(range: AnalyticsRange = DEFAULT_ANALYTICS_RANGE, signal?: AbortSignal) {
  return api.get<Analytics>('/analytics', { query: { range }, schema: zAnalytics, signal });
}

export function analyticsQuery(range: AnalyticsRange = DEFAULT_ANALYTICS_RANGE) {
  return queryOptions({
    queryKey: analyticsKeys.range(range),
    queryFn: ({ signal }) => getAnalytics(range, signal),
  });
}
