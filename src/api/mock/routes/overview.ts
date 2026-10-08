import type { Overview } from '../../schemas/overview';
import { summarize } from '../fixtures/notifications';
import { overviewFor, topLinksNow } from '../fixtures/overview';
import { mockCan, requireCap } from '../permissions';
import { ok, type MockRoute, type MockStaff } from '../router';
import { leadForCaller } from './leads';

/**
 * Mock routes for the "overview" domain: GET /overview, the Home screen in one
 * call (`overview.view`). Everything is computed live from the other domains'
 * fixtures (fixtures/overview.ts); what depends on who asks is decided here,
 * the way docs/api-requests/overview.md section 4 asks the server to:
 *
 * - Without `overview.revenue` (staff): `kpis.activeSubs` and
 *   `recentSubscriptions` are null. The keys stay, so the shape never changes,
 *   and a hidden number is never sent as 0.
 * - Without `links.view`: `topLinks` is null.
 * - `inbox` and `attention.needsAction` are the caller's own inbox (their
 *   categories, test rows excluded).
 * - `recentLeads` are GET /leads rows, with `canEdit` for the caller.
 */
export function overviewForCaller(user: MockStaff): Overview {
  const base = overviewFor(user);
  const revenue = mockCan(user, 'overview.revenue');
  const inbox = summarize(user);
  return {
    ...base,
    kpis: { ...base.kpis, activeSubs: revenue ? base.kpis.activeSubs : null },
    attention: { ...base.attention, needsAction: inbox.needsAction },
    topLinks: mockCan(user, 'links.view') ? topLinksNow() : null,
    recentSubscriptions: revenue ? base.recentSubscriptions : null,
    recentLeads: base.recentLeads.map((lead) => leadForCaller(lead, user)),
    inbox,
  };
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/overview',
    latency: 'normal',
    handler: ({ user }) => requireCap(user, 'overview.view') ?? ok(overviewForCaller(user)),
  },
];
