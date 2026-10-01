import type { TestModeStatus, TestPurgeResult } from '../../schemas/testMode';
import { testModeState } from '../fixtures/testMode';
import { byNewest, fail, ok, type MockRoute } from '../router';

/**
 * Mock routes for the "testMode" domain (owner only): the Stripe sandbox status,
 * "Rebuild test catalog" (a long job) and "Delete all test data".
 */

const NOT_CONFIGURED = 'The server is missing a setting for this feature.';
const RECENT_LIMIT = 6;

function snapshot(): TestModeStatus {
  return {
    keysConfigured: testModeState.keysConfigured,
    webhookSecretConfigured: testModeState.webhookSecretConfigured,
    catalog: testModeState.catalog.map((item) => ({ ...item })),
    counts: { ...testModeState.counts },
    recentPurchases: [...testModeState.purchases].sort(byNewest((p) => p.at)).slice(0, RECENT_LIMIT),
  };
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/test-mode',
    ownerOnly: true,
    latency: 'normal',
    handler: () => ok<TestModeStatus>(snapshot()),
  },
  {
    method: 'POST',
    path: '/test-mode/catalog',
    ownerOnly: true,
    latency: 'long',
    jobMs: 6000,
    handler: () => {
      // Without sandbox keys there is nothing to build the catalog in.
      if (!testModeState.keysConfigured) return fail(503, 'not_configured', NOT_CONFIGURED);
      for (const item of testModeState.catalog) {
        item.priceReady = true;
        item.carePlanReady = true;
      }
      return ok<TestModeStatus>(snapshot());
    },
  },
  {
    method: 'POST',
    path: '/test-mode/purge',
    ownerOnly: true,
    latency: 'slow',
    handler: ({ body }) => {
      // An explicit flag, so a stray empty POST can never wipe anything.
      if (body.confirm !== true) {
        return fail(400, 'confirm', 'Confirm to delete all test data.', { confirm: 'Send confirm: true.' });
      }
      const deleted: TestPurgeResult = { ...testModeState.counts };
      testModeState.counts = { clients: 0, orders: 0, subscriptions: 0, logins: 0 };
      testModeState.purchases = [];
      return ok<TestPurgeResult>(deleted);
    },
  },
];
