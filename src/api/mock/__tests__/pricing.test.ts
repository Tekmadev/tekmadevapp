import { api, setAuthBridge } from '@/api/client';
import { getPricing, setSalesTax, updatePlan, updateProduct } from '@/api/endpoints/pricing';
import { ApiError } from '@/api/errors';
import { pricingState, STRIPE_FAIL_CENTS } from '@/api/mock/fixtures/pricing';
import {
  metaFragment,
  zPlanUpdateResult,
  zPricing,
  zProductUpdateResult,
  zSalesTax,
  type Pricing,
} from '@/api/schemas/pricing';

/**
 * Pricing routes through the real mock transport: GET /pricing, plan and
 * product saves (Stripe sync, the partial Stripe failure), sales tax, the
 * `input` validation code and capability 403s. GET /pricing is not paged.
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

const plan = (data: Pricing, id: string) => {
  const found = data.plans.find((p) => p.id === id);
  if (!found) throw new Error(`No plan ${id}`);
  return found;
};

describe('GET /pricing', () => {
  it('returns plans, products and sales tax in the documented shape', async () => {
    const data = await getPricing();
    expect(zPricing.safeParse(data).success).toBe(true);
    expect(data.plans.map((p) => p.id)).toEqual(['convert', 'grow', 'lets-talk']);
    expect(data.plans.map((p) => p.sort)).toEqual([1, 2, 3]);
    expect(plan(data, 'convert')).toMatchObject({ monthly: 49_700, setup: 150_000, currency: 'CAD', inStripe: true });
    expect(plan(data, 'lets-talk').inStripe).toBe(false);
    expect(data.products).toEqual([
      expect.objectContaining({ id: 'webline', amount: 99_700, compareAt: 149_700, monthly: 4_900, trialDays: 30, active: true, status: 'selling' }),
    ]);
    expect(data.salesTax.setting).toEqual({ live: true, test: true });
    expect(data.salesTax.live.state).toBe('charging');
    expect(data.salesTax.test?.state).toBe('on_not_charging');
  });

  it('adds the sales tax badges and product statuses to GET /meta', async () => {
    // Raw read: only this domain's slice is checked here.
    const parsed = metaFragment.safeParse(await api.get<unknown>('/meta'));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.salesTaxStates).toEqual([
      { value: 'charging', label: 'Charging', tone: 'ok' },
      { value: 'on_not_charging', label: 'On, not charging', tone: 'warn' },
      { value: 'off', label: 'Off', tone: 'muted' },
    ]);
    expect(parsed.data?.pricingProductStatuses.map((s) => s.value)).toEqual(['selling', 'paused', 'not_in_stripe']);
  });

  it('lets staff read and refuses their saves (pricing.write)', async () => {
    asStaff();
    expect(plan(await getPricing(), 'grow').monthly).toBe(99_700);
    for (const call of [
      updatePlan('grow', { monthly: 100 }),
      updateProduct('webline', { active: false }),
      setSalesTax('live', false),
    ]) {
      const e = await apiError(call);
      expect([e.status, e.code]).toEqual([403, 'forbidden']);
    }
    asOwner();
    // Nothing changed for the refused attempts.
    const data = await getPricing();
    expect(plan(data, 'grow').monthly).toBe(99_700);
    expect(data.products[0].active).toBe(true);
    expect(data.salesTax.setting.live).toBe(true);
  });

  it('lets a manager read', async () => {
    asManager();
    expect(plan(await getPricing(), 'grow').monthly).toBe(99_700);
  });
});

describe('PATCH /pricing/plans/:id', () => {
  it('rejects negative, fractional and non-number amounts with code input', async () => {
    const e = await apiError(updatePlan('grow', { monthly: -1, setup: 12.5 }));
    expect([e.status, e.code, e.message]).toEqual([400, 'input', 'Enter valid, non-negative numbers.']);
    expect(Object.keys(e.fields ?? {}).sort()).toEqual(['monthly', 'setup']);

    const raw = await apiError(api.patch('/pricing/plans/grow', { monthly: '997' }));
    expect([raw.status, raw.code]).toEqual([400, 'input']);
    expect(plan(await getPricing(), 'grow').monthly).toBe(99_700);
  });

  it('answers 404 for an unknown plan', async () => {
    const e = await apiError(api.patch('/pricing/plans/enterprise', { monthly: 100 }));
    expect([e.status, e.code]).toEqual([404, 'not_found']);
  });

  it('skips Stripe when nothing changed', async () => {
    const result = await updatePlan('convert', { monthly: 49_700 });
    expect(zPlanUpdateResult.safeParse(result).success).toBe(true);
    expect(result.stripe).toBe('skipped');
  });

  it('saves, syncs Stripe, re-sorts by monthly price and shows up in the next read', async () => {
    const result = await updatePlan('convert', { monthly: 107_750, setup: 160_000 });
    expect(zPlanUpdateResult.safeParse(result).success).toBe(true);
    expect(result.stripe).toBe('synced');
    expect(result.plan).toMatchObject({ id: 'convert', monthly: 107_750, setup: 160_000, inStripe: true, sort: 2 });

    const data = await getPricing();
    expect(data.plans.map((p) => p.id)).toEqual(['grow', 'convert', 'lets-talk']);
    expect(plan(data, 'convert').monthly).toBe(107_750);

    // Put it back so later tests see the original order.
    await updatePlan('convert', { monthly: 49_700, setup: 150_000 });
  });

  it('puts a plan into Stripe the first time a price is saved', async () => {
    const result = await updatePlan('lets-talk', { setup: 475_000 });
    expect(result.stripe).toBe('synced');
    expect(result.plan.inStripe).toBe(true);
    expect(plan(await getPricing(), 'lets-talk')).toMatchObject({ setup: 475_000, inStripe: true });
  });

  it('reports a partial Stripe failure exactly: what was saved and what was not', async () => {
    const e = await apiError(updatePlan('grow', { monthly: STRIPE_FAIL_CENTS, setup: 260_000 }));
    expect([e.status, e.code]).toEqual([502, 'stripe']);
    expect(e.message).toBe(
      'Stripe did not accept the new monthly fee, so it was not saved: the monthly fee is still $997. Saved: the Build & Install fee is now $2,600. Try again in a moment.',
    );
    expect(e.fields).toEqual({ monthly: 'Stripe did not accept this price. It is still $997.' });

    const data = await getPricing();
    expect(plan(data, 'grow')).toMatchObject({ monthly: 99_700, setup: 260_000 });
  });

  it('says nothing else changed when the only price was refused', async () => {
    const e = await apiError(updatePlan('grow', { setup: STRIPE_FAIL_CENTS }));
    expect(e.message).toBe(
      'Stripe did not accept the new Build & Install fee, so it was not saved: the Build & Install fee is still $2,600. Nothing else changed. Try again in a moment.',
    );
  });
});

describe('PATCH /pricing/products/:id', () => {
  it('validates every field with code input', async () => {
    const e = await apiError(updateProduct('webline', { trialDays: 0, amount: -5, compareAt: 1.5 }));
    expect([e.status, e.code, e.message]).toEqual([400, 'input', 'Enter valid, non-negative numbers.']);
    expect(Object.keys(e.fields ?? {}).sort()).toEqual(['amount', 'compareAt', 'trialDays']);

    const tooLong = await apiError(updateProduct('webline', { trialDays: 366 }));
    expect(tooLong.fields).toEqual({ trialDays: 'Enter a number of days from 1 to 365.' });

    const notBool = await apiError(api.patch('/pricing/products/webline', { active: 'no' }));
    expect([notBool.code, Object.keys(notBool.fields ?? {})]).toEqual(['input', ['active']]);
  });

  it('refuses a compare-at price that is not above the fee', async () => {
    const e = await apiError(updateProduct('webline', { compareAt: 99_700 }));
    expect([e.status, e.code]).toEqual([400, 'compare_at']);
    expect(e.fields?.compareAt).toBe('The compare-at price must be higher than the one-time fee.');
  });

  it('pauses sales without touching Stripe', async () => {
    const result = await updateProduct('webline', { active: false, trialDays: 14 });
    expect(zProductUpdateResult.safeParse(result).success).toBe(true);
    expect(result.stripe).toBe('skipped');
    expect(result.product).toMatchObject({ active: false, status: 'paused', trialDays: 14 });
    expect((await getPricing()).products[0]).toMatchObject({ active: false, status: 'paused', trialDays: 14 });

    const back = await updateProduct('webline', { active: true });
    expect(back.product.status).toBe('selling');
  });

  it('clears the compare-at price with null and syncs new amounts to Stripe', async () => {
    const result = await updateProduct('webline', { compareAt: null, amount: 104_950, monthly: 7_750 });
    expect(result.stripe).toBe('synced');
    expect(result.product).toMatchObject({ compareAt: null, amount: 104_950, monthly: 7_750 });
    expect((await getPricing()).products[0]).toMatchObject({ compareAt: null, amount: 104_950, monthly: 7_750 });
  });

  it('lists the site settings that did save when Stripe refuses a price', async () => {
    const e = await apiError(updateProduct('webline', { monthly: STRIPE_FAIL_CENTS, trialDays: 45 }));
    expect([e.status, e.code]).toEqual([502, 'stripe']);
    expect(e.message).toBe(
      'Stripe did not accept the new Webline Care monthly fee, so it was not saved: the Webline Care monthly fee is still $77.50. Saved: the first charge is now after 45 days. Try again in a moment.',
    );
    expect((await getPricing()).products[0]).toMatchObject({ monthly: 7_750, trialDays: 45 });
  });

  it('answers 404 for an unknown product', async () => {
    const e = await apiError(updateProduct('webline-pro', { active: false }));
    expect([e.status, e.code]).toEqual([404, 'not_found']);
  });
});

describe('PUT /pricing/sales-tax', () => {
  it('turns tax off and on again, and the badge follows', async () => {
    const off = await setSalesTax('live', false);
    expect(zSalesTax.safeParse(off).success).toBe(true);
    expect(off.setting.live).toBe(false);
    expect(off.live.state).toBe('off');
    expect((await getPricing()).salesTax.live.state).toBe('off');

    const on = await setSalesTax('live', true);
    expect(on.live.state).toBe('charging');
  });

  it('keeps "on, not charging" apart from "off" in the sandbox', async () => {
    expect((await setSalesTax('test', false)).test?.state).toBe('off');
    expect((await setSalesTax('test', true)).test?.state).toBe('on_not_charging');
  });

  it('rejects a bad body', async () => {
    const e = await apiError(api.put('/pricing/sales-tax', { mode: 'staging', on: 'yes' }));
    expect([e.status, e.code]).toEqual([400, 'tax']);
    expect(Object.keys(e.fields ?? {}).sort()).toEqual(['mode', 'on']);
  });

  it('answers not_configured for test mode without a sandbox, and hides the test status', async () => {
    pricingState.sandboxConfigured = false;
    try {
      const e = await apiError(setSalesTax('test', false));
      expect([e.status, e.code, e.message]).toEqual([503, 'not_configured', 'The server is missing a setting for this feature.']);
      expect((await getPricing()).salesTax.test).toBeNull();
    } finally {
      pricingState.sandboxConfigured = true;
    }
  });
});
