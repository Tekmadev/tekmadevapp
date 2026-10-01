import type { TestCatalogItem, TestCounts, TestModeMeta, TestPurchase } from '../../schemas/testMode';
import { daysAgo, hoursAgo, minutesAgo } from '../router';

/**
 * Fixtures for the "testMode" domain: the Stripe sandbox status, its catalog,
 * test rows on record and the latest test purchases. Mutable in-memory state:
 * rebuilding the catalog makes every price ready, purging zeroes the counts.
 *
 * Amounts include 13% Ontario HST where the sandbox charged it
 * ($997 + $129.61 = $1,126.61), so most of them carry cents.
 */

const purchases: TestPurchase[] = [
  {
    id: 'tpu_9f3a0001',
    at: minutesAgo(38),
    email: 'buyer+sandbox@tekmadev.test',
    product: 'Webline',
    amount: { amount: 112_661, currency: 'CAD' },
    status: 'paid',
  },
  {
    id: 'tpu_9f3a0002',
    at: minutesAgo(37),
    email: 'buyer+sandbox@tekmadev.test',
    product: 'Webline Care',
    amount: { amount: 5_537, currency: 'CAD' },
    status: 'pending',
  },
  {
    id: 'tpu_9f3a0003',
    at: hoursAgo(3),
    email: 'buyer+declined@tekmadev.test',
    product: 'Webline',
    amount: { amount: 112_661, currency: 'CAD' },
    status: 'failed',
  },
  {
    id: 'tpu_9f3a0004',
    at: daysAgo(1, -2),
    email: 'owner+coupon-check-with-a-very-long-address@tekmadev.test',
    product: 'Webline',
    // WEBLINE-LAUNCH applied: ($997 - $77.50) + HST.
    amount: { amount: 103_904, currency: 'CAD' },
    status: 'paid',
  },
  {
    id: 'tpu_9f3a0005',
    at: daysAgo(2, -5),
    email: 'buyer+refund@tekmadev.test',
    product: 'Webline',
    amount: { amount: 112_661, currency: 'CAD' },
    status: 'refunded',
  },
  {
    id: 'tpu_9f3a0006',
    at: daysAgo(6, -1),
    email: 'buyer+care@tekmadev.test',
    product: 'Webline Care',
    amount: { amount: 5_537, currency: 'CAD' },
    status: 'paid',
  },
];

export const testModeState: {
  keysConfigured: boolean;
  webhookSecretConfigured: boolean;
  catalog: TestCatalogItem[];
  counts: TestCounts;
  purchases: TestPurchase[];
} = {
  keysConfigured: true,
  // Missing on purpose: the screen has to show a setup gap somewhere.
  webhookSecretConfigured: false,
  catalog: [{ productId: 'webline', name: 'Webline', priceReady: true, carePlanReady: false }],
  counts: { clients: 3, orders: 5, subscriptions: 2, logins: 3 },
  purchases,
};

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture: TestModeMeta = {
  testPurchaseStatuses: [
    { value: 'paid', label: 'Paid', tone: 'ok' },
    { value: 'pending', label: 'Pending', tone: 'warn' },
    { value: 'failed', label: 'Failed', tone: 'signal' },
    { value: 'refunded', label: 'Refunded', tone: 'muted' },
  ],
};
