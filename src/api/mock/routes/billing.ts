import { zOrderStatus, zSubscriptionKind, zSubscriptionStatus } from '../../schemas/billing';
import { billingSummary, ordersDb, subscriptionsDb } from '../fixtures/billing';
import { fail, ok, paginate, type MockRoute } from '../router';

/**
 * Mock routes for the "billing" domain (contract section 11, Customers). Live mode
 * only: the fixtures hold no test rows. Both lists carry `summary` for the screen
 * subtitle (requested in docs/api-requests/billing.md).
 */

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/billing/orders',
    latency: 'normal',
    handler: ({ query }) => {
      const status = query.status ? zOrderStatus.safeParse(query.status) : undefined;
      if (status && !status.success) return fail(400, 'status', 'Unknown order status.');
      const rows = status?.success ? ordersDb.filter((o) => o.status === status.data) : ordersDb;
      return ok({ ...paginate(rows, query), summary: billingSummary() });
    },
  },
  {
    method: 'GET',
    path: '/billing/subscriptions',
    latency: 'normal',
    handler: ({ query }) => {
      const status = query.status ? zSubscriptionStatus.safeParse(query.status) : undefined;
      if (status && !status.success) return fail(400, 'status', 'Unknown subscription status.');
      const kind = query.kind ? zSubscriptionKind.safeParse(query.kind) : undefined;
      if (kind && !kind.success) return fail(400, 'kind', 'Unknown subscription kind. Use plan or care.');
      const rows = subscriptionsDb.filter((s) => (!status?.success || s.status === status.data) && (!kind?.success || s.kind === kind.data));
      return ok({ ...paginate(rows, query), summary: billingSummary() });
    },
  },
];
