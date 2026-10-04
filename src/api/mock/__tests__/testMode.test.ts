import { api, setAuthBridge } from '@/api/client';
import { getTestMode, purgeTestData, rebuildTestCatalog } from '@/api/endpoints/testMode';
import { ApiError } from '@/api/errors';
import { testModeState } from '@/api/mock/fixtures/testMode';
import { metaFragment, zTestModeStatus, zTestPurgeResult } from '@/api/schemas/testMode';

/**
 * Test mode routes through the real mock transport: the sandbox status, the
 * catalog rebuild (a long job; instant here because jest sets latency to 0),
 * deleting all test data, and who may (owners and managers; staff get 403). Nothing here is paged.
 */

let token: string | null = null;
const tokenFor = (userId: string) => `mock.${userId}.${Date.now() + 3_600_000}`;
const asOwner = () => {
  token = tokenFor('usr_owner01');
};
const asManager = () => {
  token = tokenFor('usr_mgr01');
};
const asStaff = () => {
  token = tokenFor('usr_staff01');
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token, refresh: async () => null });
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

describe('GET /test-mode', () => {
  it('shows keys, catalog, counts and the latest test purchases', async () => {
    const status = await getTestMode();
    expect(zTestModeStatus.safeParse(status).success).toBe(true);
    expect(status.keysConfigured).toBe(true);
    expect(status.webhookSecretConfigured).toBe(false);
    expect(status.catalog).toEqual([{ productId: 'webline', name: 'Webline', priceReady: true, carePlanReady: false }]);
    expect(status.counts).toEqual({ clients: 3, orders: 5, subscriptions: 2, logins: 3 });

    expect(status.recentPurchases.length).toBeLessThanOrEqual(6);
    const times = status.recentPurchases.map((p) => p.at);
    expect([...times].sort().reverse()).toEqual(times);
    // Money in cents, with cents kept: $997 + 13% HST.
    expect(status.recentPurchases.find((p) => p.product === 'Webline')?.amount).toEqual({ amount: 112_661, currency: 'CAD' });
    expect(new Set(status.recentPurchases.map((p) => p.status))).toEqual(new Set(['paid', 'pending', 'failed', 'refunded']));
  });

  it('adds purchase status badges to GET /meta', async () => {
    // Raw read: only this domain's slice is checked here.
    const parsed = metaFragment.safeParse(await api.get<unknown>('/meta'));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.testPurchaseStatuses.map((s) => [s.value, s.tone])).toEqual([
      ['paid', 'ok'],
      ['pending', 'warn'],
      ['failed', 'signal'],
      ['refunded', 'muted'],
    ]);
  });

  it('is open to managers and closed to staff', async () => {
    asManager();
    expect((await getTestMode()).counts.orders).toBe(5);
    asStaff();
    for (const call of [getTestMode(), rebuildTestCatalog(), purgeTestData()]) {
      const e = await apiError(call);
      // A role limit, not an owner-only section: the client keeps the server's copy and stays on the screen.
      expect([e.status, e.code, e.message]).toEqual([403, 'forbidden', 'Your role cannot do that.']);
    }
    asOwner();
    const status = await getTestMode();
    expect(status.counts.orders).toBe(5);
    expect(status.catalog[0].carePlanReady).toBe(false);
  });
});

describe('POST /test-mode/catalog', () => {
  it('needs sandbox keys', async () => {
    testModeState.keysConfigured = false;
    try {
      const e = await apiError(rebuildTestCatalog());
      expect([e.status, e.code, e.message]).toEqual([503, 'not_configured', 'The server is missing a setting for this feature.']);
    } finally {
      testModeState.keysConfigured = true;
    }
  });

  it('rebuilds every price and returns the whole status', async () => {
    const status = await rebuildTestCatalog();
    expect(zTestModeStatus.safeParse(status).success).toBe(true);
    expect(status.catalog.every((c) => c.priceReady && c.carePlanReady)).toBe(true);
    expect((await getTestMode()).catalog[0]).toMatchObject({ priceReady: true, carePlanReady: true });
  });
});

describe('POST /test-mode/purge', () => {
  it('refuses without confirm: true', async () => {
    const e = await apiError(api.post('/test-mode/purge', {}));
    expect([e.status, e.code]).toEqual([400, 'confirm']);
    expect((await getTestMode()).counts.clients).toBe(3);
  });

  it('deletes all test data and reports the four counts for the toast', async () => {
    const deleted = await purgeTestData();
    expect(zTestPurgeResult.safeParse(deleted).success).toBe(true);
    expect(deleted).toEqual({ clients: 3, orders: 5, subscriptions: 2, logins: 3 });

    const after = await getTestMode();
    expect(after.counts).toEqual({ clients: 0, orders: 0, subscriptions: 0, logins: 0 });
    expect(after.recentPurchases).toEqual([]);

    // Nothing left: a second run deletes nothing.
    expect(await purgeTestData()).toEqual({ clients: 0, orders: 0, subscriptions: 0, logins: 0 });
  });
});
