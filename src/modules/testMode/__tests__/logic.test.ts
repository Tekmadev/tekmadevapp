import { ApiError } from '@/api/errors';
import type { TestModeStatus } from '@/api/schemas/testMode';

import {
  afterPurge,
  catalogReady,
  hasTestData,
  purgeConfirmMessage,
  purgeMessage,
  REBUILD_TIMEOUT,
  rebuildFailureMessage,
  TEST_CARD_DIGITS,
  TEST_CARD_DISPLAY,
} from '../logic';

const status = (over: Partial<TestModeStatus> = {}): TestModeStatus => ({
  keysConfigured: true,
  webhookSecretConfigured: true,
  catalog: [{ productId: 'webline', name: 'Webline', priceReady: true, carePlanReady: true }],
  counts: { clients: 3, orders: 5, subscriptions: 2, logins: 3 },
  recentPurchases: [],
  ...over,
});

describe('test mode logic', () => {
  it('words the purge toast exactly like the brief', () => {
    expect(purgeMessage({ clients: 3, orders: 5, subscriptions: 2, logins: 1 })).toBe(
      'Deleted 3 test account(s), 5 order(s), 2 subscription(s) and 1 login(s).',
    );
    expect(purgeMessage({ clients: 0, orders: 0, subscriptions: 0, logins: 0 })).toBe(
      'Deleted 0 test account(s), 0 order(s), 0 subscription(s) and 0 login(s).',
    );
  });

  it('says what the hold will delete', () => {
    expect(purgeConfirmMessage({ clients: 1, orders: 5, subscriptions: 2, logins: 1 })).toBe(
      'Delete 1 test account, 5 orders, 2 subscriptions and 1 login made in test mode. Real clients and orders are not touched.',
    );
  });

  it('judges the catalog per product', () => {
    expect(catalogReady(status())).toBe(true);
    expect(catalogReady(status({ catalog: [] }))).toBe(false);
    expect(
      catalogReady(status({ catalog: [{ productId: 'webline', name: 'Webline', priceReady: true, carePlanReady: false }] })),
    ).toBe(false);
  });

  it('knows when there is test data to delete', () => {
    expect(hasTestData(status())).toBe(true);
    const empty = afterPurge(status());
    expect(empty.counts).toEqual({ clients: 0, orders: 0, subscriptions: 0, logins: 0 });
    expect(empty.recentPurchases).toEqual([]);
    expect(hasTestData(empty)).toBe(false);
  });

  it('maps rebuild failures to a toast', () => {
    expect(rebuildFailureMessage(new Error('x'), true)).toBe(REBUILD_TIMEOUT);
    expect(rebuildFailureMessage(new ApiError({ status: 0, code: 'aborted', message: 'x', kind: 'aborted' }), false)).toBeNull();
    expect(rebuildFailureMessage(new ApiError({ status: 403, code: 'owner_only', message: 'x' }), false)).toBeNull();
    expect(
      rebuildFailureMessage(new ApiError({ status: 503, code: 'not_configured', message: 'The server is missing a setting for this feature.' }), false),
    ).toBe('The server is missing a setting for this feature.');
  });

  it('shows the test card spaced and copies digits', () => {
    expect(TEST_CARD_DISPLAY).toBe('4242 4242 4242 4242');
    expect(TEST_CARD_DIGITS).toBe(TEST_CARD_DISPLAY.replace(/ /g, ''));
  });
});
