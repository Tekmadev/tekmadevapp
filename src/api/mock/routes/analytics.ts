import { DEFAULT_ANALYTICS_RANGE, zAnalyticsRange } from '../../schemas/analytics';
import { analyticsFor } from '../fixtures/analytics';
import { fail, ok, type MockRoute } from '../router';

/** Mock routes for the "analytics" domain (contract section 11, Insights). Managers may read it. */

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/analytics',
    latency: 'normal',
    handler: ({ query }) => {
      const range = zAnalyticsRange.safeParse(query.range ?? DEFAULT_ANALYTICS_RANGE);
      if (!range.success) return fail(400, 'range', 'Unknown range. Use 24h, 7d, 30d, 3m, 6m, 1y or all.');
      return ok(analyticsFor(range.data));
    },
  },
];
