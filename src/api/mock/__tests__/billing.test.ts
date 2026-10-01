import { api, setAuthBridge } from '@/api/client';
import { getOrders, getSubscriptions, ordersInfiniteQuery, subscriptionsInfiniteQuery, type OrderListParams, type SubscriptionListParams } from '@/api/endpoints/billing';
import { ApiError } from '@/api/errors';
import { metaFixture } from '@/api/mock/fixtures/billing';
import { SEED_CLIENTS } from '@/api/mock/fixtures/seed';
import { metaFragment, zOrderPage, zSubscriptionPage, type Order, type Subscription } from '@/api/schemas/billing';

/**
 * The billing domain (Subscriptions screen) through the real mock transport:
 * schemas, cursor paging, filters, the subtitle summary, live mode only, and the
 * rows that must line up with the clients fixture.
 */

let token = '';
const asOwner = () => {
  token = `mock.usr_owner01.${Date.now() + 3_600_000}`;
};
const asManager = () => {
  token = `mock.usr_mgr01.${Date.now() + 3_600_000}`;
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
});
beforeEach(asOwner);

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

async function allOrders(params: OrderListParams = {}) {
  const options = ordersInfiniteQuery(params);
  const pages: Awaited<ReturnType<typeof getOrders>>[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page = await getOrders({ ...params, cursor });
    expect(zOrderPage.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return { pages, items: pages.flatMap((p): Order[] => p.items) };
}

async function allSubscriptions(params: SubscriptionListParams = {}) {
  const options = subscriptionsInfiniteQuery(params);
  const pages: Awaited<ReturnType<typeof getSubscriptions>>[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page = await getSubscriptions({ ...params, cursor });
    expect(zSubscriptionPage.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return { pages, items: pages.flatMap((p): Subscription[] => p.items) };
}

const TEST_EMAILS = SEED_CLIENTS.filter((c) => c.isTest).map((c) => c.email);

describe('meta fragment', () => {
  it('matches its schema', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
    expect(metaFixture.billingPaymentMethods.map((m) => m.label)).toEqual(['Card', 'Klarna', 'Afterpay', 'Affirm', 'Link']);
    expect(metaFixture.billingPaymentMethods.filter((m) => m.bnpl).map((m) => m.value)).toEqual(['klarna', 'afterpay', 'affirm']);
  });
});

describe('GET /billing/orders', () => {
  it('pages every one-time order newest first and ends on a short page', async () => {
    const { pages, items } = await allOrders();
    expect(pages.length).toBe(2);
    expect(pages[0].items).toHaveLength(30);
    expect(pages[1].items.length).toBeGreaterThan(0);
    expect(pages[1].items.length).toBeLessThan(30);
    expect(pages[1].nextCursor).toBeNull();
    expect(new Set(items.map((o) => o.id)).size).toBe(items.length);
    expect(items.every((o, i) => i === 0 || items[i - 1].createdAt >= o.createdAt)).toBe(true);
    // Every status and payment method shows up, and rows without a business fall back to the email.
    expect(new Set(items.map((o) => o.status))).toEqual(new Set(['pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed']));
    expect(new Set(items.map((o) => o.paidWith).filter(Boolean))).toEqual(new Set(['card', 'klarna', 'afterpay', 'affirm', 'link']));
    expect(items.some((o) => o.business === null)).toBe(true);
    expect(items.filter((o) => o.status === 'pending').every((o) => o.paidWith === null && o.paidAt === null)).toBe(true);
    expect(items.filter((o) => o.status === 'refunded').every((o) => o.amountRefunded?.amount === o.amount.amount)).toBe(true);
    const partial = items.find((o) => o.status === 'partially_refunded');
    expect(partial?.amountRefunded?.amount).toBeLessThan(partial?.amount.amount ?? 0);
    // Live mode only.
    expect(items.some((o) => TEST_EMAILS.includes(o.email))).toBe(false);
  });

  it('carries the subtitle summary on every page, whatever the filter', async () => {
    const { pages, items } = await allOrders();
    const subs = await allSubscriptions();
    const summary = pages[0].summary;
    expect(summary).toEqual({
      subscriptions: subs.items.length,
      orders: items.length,
      bnpl: items.filter((o) => o.bnpl && o.status !== 'pending' && o.status !== 'failed').length,
    });
    expect(summary.bnpl).toBeGreaterThan(0);
    expect(pages[1].summary).toEqual(summary);
    expect((await getOrders({ status: 'failed' })).summary).toEqual(summary);
    expect(subs.pages[0].summary).toEqual(summary);
  });

  it('filters by status', async () => {
    const failed = (await allOrders({ status: 'failed' })).items;
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((o) => o.status === 'failed' && o.paidAt === null)).toBe(true);
    const small = await getOrders({ limit: 5 });
    expect(small.items).toHaveLength(5);
    const next = await getOrders({ limit: 5, cursor: small.nextCursor });
    expect(next.items.some((o) => small.items.some((s) => s.id === o.id))).toBe(false);
  });

  it('lines up with the clients fixture', async () => {
    const { items } = await allOrders();
    const acme = items.find((o) => o.id === 'ord_acmeplumb01');
    expect(acme).toMatchObject({ clientId: 'cl_acmeplumb01', email: 'dan@acmeplumbing.test', product: 'Build & Install: Grow', status: 'paid', amount: { amount: 249_700, currency: 'CAD' } });
    expect(items.find((o) => o.id === 'ord_waterdown_d')).toMatchObject({ status: 'pending', paidWith: null });
  });

  it('is open to managers and rejects unknown statuses', async () => {
    asManager();
    expect(zOrderPage.safeParse(await getOrders()).success).toBe(true);
    const e = await apiError(api.get('/billing/orders', { query: { status: 'shipped' } }));
    expect([e.status, e.code, e.message]).toEqual([400, 'status', 'Unknown order status.']);
  });
});

describe('GET /billing/subscriptions', () => {
  it('pages every subscription newest first and ends on a short page', async () => {
    const { pages, items } = await allSubscriptions();
    expect(pages.length).toBe(2);
    expect(pages[1].items.length).toBeLessThan(30);
    expect(new Set(items.map((s) => s.id)).size).toBe(items.length);
    expect(items.every((s, i) => i === 0 || items[i - 1].createdAt >= s.createdAt)).toBe(true);
    expect(items.some((s) => TEST_EMAILS.includes(s.email))).toBe(false);
    // Webline Care at $77.50 a month: cents survive.
    const care = items.filter((s) => s.kind === 'care');
    expect(care.length).toBeGreaterThan(0);
    expect(care.every((s) => s.productName === 'Webline Care' && s.planId === null && s.amount.amount === 7_750)).toBe(true);
    expect(items.every((s) => s.customerId.startsWith('cus_'))).toBe(true);
  });

  it('shows ending and cancelled subscriptions with their reasons', async () => {
    const { items } = await allSubscriptions();
    const ending = items.find((s) => s.id === 'sub_barrhavenhm');
    expect(ending).toMatchObject({ status: 'active', cancelAtPeriodEnd: true, cancellation: { feedback: 'Too expensive' } });
    expect(Date.parse(ending?.currentPeriodEnd ?? '')).toBeGreaterThan(Date.now());
    const cancelled = items.find((s) => s.id === 'sub_westdalevet');
    expect(cancelled?.status).toBe('canceled');
    expect(cancelled?.canceledAt).not.toBeNull();
    expect(cancelled?.cancellation?.comment).toMatch(/sold the practice/);
    // Active rows never carry cancellation details.
    expect(items.filter((s) => s.status === 'active' && !s.cancelAtPeriodEnd).every((s) => s.cancellation === null)).toBe(true);
  });

  it('filters by status and kind', async () => {
    const care = (await allSubscriptions({ kind: 'care' })).items;
    expect(care.length).toBeGreaterThan(3);
    expect(care.every((s) => s.kind === 'care')).toBe(true);
    const plans = (await allSubscriptions({ kind: 'plan', status: 'active' })).items;
    expect(plans.length).toBeGreaterThan(10);
    expect(plans.every((s) => s.kind === 'plan' && s.status === 'active')).toBe(true);
    const pastDue = (await allSubscriptions({ status: 'past_due' })).items;
    expect(pastDue.map((s) => s.clientId)).toEqual(['cl_barriejunk']);
  });

  it('rejects unknown filters', async () => {
    const status = await apiError(api.get('/billing/subscriptions', { query: { status: 'expired' } }));
    expect([status.status, status.code]).toEqual([400, 'status']);
    const kind = await apiError(api.get('/billing/subscriptions', { query: { kind: 'addon' } }));
    expect([kind.status, kind.code, kind.message]).toEqual([400, 'kind', 'Unknown subscription kind. Use plan or care.']);
  });
});
