import { metaFixture } from '@/api/mock/fixtures/billing';
import type { Order, Subscription } from '@/api/schemas/billing';

import {
  orderFilterItems,
  orderMetaLine,
  orderNet,
  orderStatusBadge,
  orderTitle,
  paymentFieldLabel,
  periodField,
  periodLine,
  pickSummary,
  subscriptionAmount,
  subscriptionBadge,
  subscriptionFilterItems,
  summaryLine,
  toBillingTab,
  uniqueRows,
} from '../logic';

const NOW = new Date('2026-10-02T16:00:00Z'); // noon in Toronto
const cad = (amount: number) => ({ amount, currency: 'CAD' });

const order = (o: Partial<Order> = {}): Order => ({
  id: 'ord_1',
  clientId: null,
  business: 'Acme Plumbing',
  email: 'dan@acmeplumbing.test',
  product: 'Webline',
  status: 'paid',
  amount: cad(99_700),
  amountRefunded: null,
  paidWith: 'card',
  bnpl: false,
  source: null,
  campaign: null,
  createdAt: '2026-10-02T13:00:00Z',
  paidAt: '2026-10-02T13:01:00Z',
  ...o,
});

const sub = (o: Partial<Subscription> = {}): Subscription => ({
  id: 'sub_1',
  clientId: null,
  business: null,
  email: 'luc@barrhavenreno.test',
  kind: 'care',
  planId: null,
  productName: 'Webline Care',
  status: 'active',
  cancelAtPeriodEnd: false,
  currentPeriodEnd: '2026-10-13T14:00:00Z',
  amount: cad(7_750),
  interval: 'month',
  customerId: 'cus_ABC',
  createdAt: '2026-08-01T14:00:00Z',
  canceledAt: null,
  cancellation: null,
  ...o,
});

describe('inner tab param', () => {
  it('opens Subscriptions unless asked for orders', () => {
    expect(toBillingTab('orders')).toBe('orders');
    expect(toBillingTab(['orders', 'x'])).toBe('orders');
    expect(toBillingTab(undefined)).toBe('subscriptions');
    expect(toBillingTab('subscriptions')).toBe('subscriptions');
    expect(toBillingTab('nonsense')).toBe('subscriptions');
  });
});

describe('subtitle', () => {
  it('says the totals, singular when 1', () => {
    expect(summaryLine({ subscriptions: 45, orders: 1_204, bnpl: 3 })).toBe('45 subscriptions · 1,204 one-time orders (3 paid in instalments)');
    expect(summaryLine({ subscriptions: 1, orders: 1, bnpl: 1 })).toBe('1 subscription · 1 one-time order (1 paid in instalments)');
    expect(summaryLine({ subscriptions: 0, orders: 0, bnpl: 0 })).toBe('0 subscriptions · 0 one-time orders (0 paid in instalments)');
  });

  it('takes the freshest of the two lists', () => {
    const a = { subscriptions: 1, orders: 1, bnpl: 0 };
    const b = { subscriptions: 2, orders: 2, bnpl: 1 };
    expect(pickSummary({ summary: a, updatedAt: 10 }, { summary: b, updatedAt: 20 })).toBe(b);
    expect(pickSummary({ summary: a, updatedAt: 30 }, { summary: b, updatedAt: 20 })).toBe(a);
    expect(pickSummary({ summary: undefined, updatedAt: 0 }, { summary: b, updatedAt: 20 })).toBe(b);
    expect(pickSummary({ summary: undefined, updatedAt: 0 }, { summary: undefined, updatedAt: 0 })).toBeUndefined();
  });
});

describe('labels', () => {
  it('reads GET /meta and falls back to the brief before it loads', () => {
    expect(orderStatusBadge(metaFixture, 'partially_refunded')).toEqual({ label: 'Partially refunded', tone: 'warn' });
    expect(orderStatusBadge(undefined, 'disputed')).toEqual({ label: 'Disputed', tone: 'signal' });
    expect(orderFilterItems(undefined).map((i) => i.value)).toEqual(['all', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed']);
    expect(subscriptionFilterItems(metaFixture)[0]).toEqual({ value: 'all', label: 'All' });
    expect(subscriptionFilterItems(metaFixture).find((i) => i.value === 'canceled')?.label).toBe('Cancelled');
  });
});

describe('rows', () => {
  it('keeps each row once across pages', () => {
    const pages = [{ items: [{ id: 'a' }, { id: 'b' }] }, { items: [{ id: 'b' }, { id: 'c' }] }];
    expect(uniqueRows(pages).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(uniqueRows(undefined)).toEqual([]);
  });

  it('titles an order by business, else email', () => {
    expect(orderTitle(order())).toBe('Acme Plumbing');
    expect(orderTitle(order({ business: '  ' }))).toBe('dan@acmeplumbing.test');
    expect(orderTitle(order({ business: null }))).toBe('dan@acmeplumbing.test');
  });

  it('says how an order was paid, refunds and when, never rounding cents', () => {
    expect(orderMetaLine(order({ paidWith: 'klarna' }), metaFixture, NOW)).toBe('Klarna · 3 h ago');
    expect(orderMetaLine(order({ status: 'pending', paidWith: null, paidAt: null, createdAt: '2026-10-02T15:08:00Z' }), undefined, NOW)).toBe('Not paid yet · 52 min ago');
    const partial = order({ status: 'partially_refunded', paidWith: 'affirm', amountRefunded: cad(84_750) });
    expect(orderMetaLine(partial, metaFixture, NOW)).toBe('Affirm · $847.50 refunded · 3 h ago');
    expect(orderNet(partial)).toBe('$149.50');
    expect(orderNet(order())).toBeNull();
    expect(paymentFieldLabel('refunded')).toBe('Paid with');
    expect(paymentFieldLabel('failed')).toBe('Payment method');
  });

  it('shows the amount with its interval', () => {
    expect(subscriptionAmount(sub())).toBe('$77.50/mo');
    expect(subscriptionAmount(sub({ amount: cad(249_700), interval: 'year' }))).toBe('$2,497/yr');
  });
});

describe('subscription status and period end', () => {
  it('says "Ending <date>" in Toronto time while it cancels at period end', () => {
    // 03:30 UTC on Oct 24 is still Oct 23 in Toronto.
    const ending = sub({ cancelAtPeriodEnd: true, currentPeriodEnd: '2026-10-24T03:30:00Z' });
    expect(subscriptionBadge(metaFixture, ending, NOW)).toEqual({ label: 'Ending Oct 23', tone: 'warn' });
    expect(periodLine(ending, NOW)).toBeNull();
    expect(periodField(ending, NOW)).toEqual({ label: 'Ends', value: 'Oct 23' });
    // A finished subscription shows its own status, not "Ending".
    expect(subscriptionBadge(metaFixture, { ...ending, status: 'canceled' }, NOW)).toEqual({ label: 'Cancelled', tone: 'muted' });
  });

  it('names the period end for the status', () => {
    expect(periodLine(sub(), NOW)).toBe('Renews Oct 13');
    expect(periodLine(sub({ status: 'trialing' }), NOW)).toBe('Trial ends Oct 13');
    expect(periodLine(sub({ status: 'past_due' }), NOW)).toBe('Period ends Oct 13');
    expect(periodLine(sub({ status: 'canceled', currentPeriodEnd: '2026-09-02T14:00:00Z' }), NOW)).toBe('Period ended Sep 2');
    expect(periodLine(sub({ currentPeriodEnd: '2027-01-05T14:00:00Z' }), NOW)).toBe('Renews Jan 5, 2027');
    expect(periodLine(sub({ currentPeriodEnd: null }), NOW)).toBeNull();
    expect(subscriptionBadge(undefined, sub({ status: 'past_due' }), NOW)).toEqual({ label: 'Past due', tone: 'warn' });
  });
});
