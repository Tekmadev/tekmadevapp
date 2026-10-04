import { api, setAuthBridge } from '@/api/client';
import { createCoupon, disableCoupon, getCoupons, type NewCouponInput } from '@/api/endpoints/coupons';
import { ApiError } from '@/api/errors';
import { pricingState } from '@/api/mock/fixtures/pricing';
import { torontoDate } from '@/api/mock/router';
import { metaFragment, zCoupon, zCoupons, type Coupon } from '@/api/schemas/coupons';

/**
 * Coupon routes through the real mock transport: the list and its deal links,
 * every documented validation code (percent, amount, months, max, expires,
 * expirespast, code, dupe, noproducts, nostripe), auto codes, idempotent
 * creates, disabling, and capability 403s. GET /coupons is not paged.
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

/**
 * Our own keys: under jest the native UUID (expo-crypto) is mocked and returns
 * undefined, so newIdempotencyKey() would send no header at all.
 */
let keyCount = 0;
const testKey = () => `coupons-test-${++keyCount}`;

const create = (input: NewCouponInput) => createCoupon(input, testKey());
const base: NewCouponInput = { type: 'percent', percent: 20, appliesTo: 'growth_monthly', duration: 'first_month' };
const byCode = (list: Coupon[], code: string) => list.find((c) => c.code === code);

describe('GET /coupons', () => {
  it('lists every coupon newest first, in the documented shape', async () => {
    const list = await getCoupons();
    expect(zCoupons.safeParse(list).success).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(10);
    const created = list.map((c) => c.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
    // Cents survive ($77.50 off), percents can carry decimals (12.5%).
    expect(byCode(list, 'WEBLINE-LAUNCH')?.discount).toEqual({ type: 'amount', amount: 7_750, currency: 'CAD' });
    expect(byCode(list, 'PARTNER-OTTAWA-BYWARD-MARKET-BIA-2026')?.discount).toEqual({ type: 'percent', percent: 12.5 });
    expect(byCode(list, 'FALLGROW')).toMatchObject({ duration: 'repeating', months: 3, redeemed: 4, maxRedemptions: 10 });
    expect(byCode(list, 'WEBLINE-LAUNCH')?.label).toBeNull();
  });

  it('sends a deal link only for active coupons on growth plans monthly or Anything', async () => {
    for (const coupon of await getCoupons()) {
      const shareable = coupon.status === 'active' && ['growth_monthly', 'anything'].includes(coupon.appliesTo.value);
      expect(coupon.dealUrl !== undefined).toBe(shareable);
      if (shareable) expect(coupon.dealUrl).toBe(`https://www.tekmadev.com/deal/${coupon.code}`);
    }
  });

  it('adds scopes, durations, statuses and discount types to GET /meta', async () => {
    // Raw read: only this domain's slice is checked here.
    const parsed = metaFragment.safeParse(await api.get<unknown>('/meta'));
    expect(parsed.success).toBe(true);
    const scopes = parsed.data?.couponScopes ?? [];
    expect(scopes.map((s) => [s.value, s.oneTime])).toEqual([
      ['growth_monthly', false],
      ['growth_setup', true],
      ['webline', true],
      ['webline_care', false],
      ['anything', false],
    ]);
    expect(scopes.find((s) => s.value === 'growth_setup')?.label).toBe('Build & Install fee');
    expect(scopes.find((s) => s.value === 'anything')?.help).toMatch(/every product/);
    expect(parsed.data?.couponStatuses).toEqual([
      { value: 'active', label: 'Active', tone: 'gold' },
      { value: 'disabled', label: 'Disabled', tone: 'muted' },
    ]);
  });

  it('lets staff read and share, and refuses their creates and disables (coupons.write)', async () => {
    asStaff();
    const listed = byCode(await getCoupons(), 'FALLGROW');
    expect(listed?.status).toBe('active');
    for (const call of [create(base), disableCoupon('cpn_fallgrow26')]) {
      const e = await apiError(call);
      expect([e.status, e.code]).toEqual([403, 'forbidden']);
    }
    asOwner();
    expect(byCode(await getCoupons(), 'FALLGROW')?.status).toBe('active');
  });

  it('lets a manager read, with the deal links', async () => {
    asManager();
    const list = await getCoupons();
    expect(list.some((c) => c.dealUrl !== undefined)).toBe(true);
  });
});

describe('POST /coupons', () => {
  it('auto-generates a code when none is given, and the new coupon leads the list', async () => {
    const coupon = await create({ ...base, code: '  ', duration: 'repeating', months: 3, maxRedemptions: 10, expiresAt: torontoDate(30) });
    expect(zCoupon.safeParse(coupon).success).toBe(true);
    expect(coupon.code).toMatch(/^TKM-[2-9A-HJ-NP-Z]{4}$/);
    expect(coupon).toMatchObject({
      label: null,
      discount: { type: 'percent', percent: 20 },
      appliesTo: { value: 'growth_monthly', label: 'Growth plans, monthly' },
      duration: 'repeating',
      months: 3,
      redeemed: 0,
      maxRedemptions: 10,
      expiresAt: torontoDate(30),
      status: 'active',
      dealUrl: `https://www.tekmadev.com/deal/${coupon.code}`,
    });
    expect((await getCoupons())[0].id).toBe(coupon.id);
  });

  it('uppercases the code and keeps an internal label', async () => {
    const coupon = await create({ ...base, code: 'spring-26', label: '  Spring promo  ', type: 'amount', amount: 7_750, percent: undefined });
    expect(coupon.code).toBe('SPRING-26');
    expect(coupon.label).toBe('Spring promo');
    expect(coupon.discount).toEqual({ type: 'amount', amount: 7_750, currency: 'CAD' });
  });

  it('applies one-time scopes once, whatever duration was sent, with no deal link', async () => {
    const coupon = await create({ ...base, appliesTo: 'webline', duration: 'forever', months: 6 });
    expect(coupon.duration).toBe('once');
    expect(coupon.months).toBeUndefined();
    expect(coupon.dealUrl).toBeUndefined();
  });

  it('creates once per idempotency key', async () => {
    const before = (await getCoupons()).length;
    const key = testKey();
    const first = await createCoupon({ ...base, code: 'ONCE-ONLY' }, key);
    const retry = await createCoupon({ ...base, code: 'ONCE-ONLY' }, key);
    expect(retry.id).toBe(first.id);
    expect((await getCoupons()).length).toBe(before + 1);
  });

  it.each<[string, Partial<NewCouponInput>, number, string, string, string]>([
    ['percent 0', { percent: 0 }, 400, 'percent', 'Percent off must be between 1 and 100.', 'percent'],
    ['percent 101', { percent: 101 }, 400, 'percent', 'Percent off must be between 1 and 100.', 'percent'],
    ['percent with 3 decimals', { percent: 12.345 }, 400, 'percent', 'Percent off must be between 1 and 100.', 'percent'],
    ['amount 0', { type: 'amount', amount: 0 }, 400, 'amount', 'Enter a fixed amount greater than zero.', 'amount'],
    ['amount in fractional cents', { type: 'amount', amount: 10.5 }, 400, 'amount', 'Enter a fixed amount greater than zero.', 'amount'],
    ['months 0', { duration: 'repeating', months: 0 }, 400, 'months', 'Enter a valid number of months (1 or more).', 'months'],
    ['repeating without months', { duration: 'repeating' }, 400, 'months', 'Enter a valid number of months (1 or more).', 'months'],
    ['max 0', { maxRedemptions: 0 }, 400, 'max', 'Max redemptions must be 1 or more.', 'maxRedemptions'],
    ['expires not a date', { expiresAt: 'next friday' }, 400, 'expires', 'Enter a valid expiry date.', 'expiresAt'],
    ['expires on a day that does not exist', { expiresAt: '2027-02-31' }, 400, 'expires', 'Enter a valid expiry date.', 'expiresAt'],
    ['expires today', { expiresAt: torontoDate(0) }, 400, 'expirespast', 'The expiry date must be in the future.', 'expiresAt'],
    ['expires yesterday', { expiresAt: torontoDate(-1) }, 400, 'expirespast', 'The expiry date must be in the future.', 'expiresAt'],
    ['code with spaces and symbols', { code: 'HALF OFF!' }, 400, 'code', "That code isn't valid. Use letters, numbers and dashes.", 'code'],
    ['code too short', { code: 'AB' }, 400, 'code', "That code isn't valid. Use letters, numbers and dashes.", 'code'],
    ['code already used', { code: 'fallgrow' }, 409, 'dupe', 'A coupon with that code already exists. Pick a different code.', 'code'],
    ['code of a disabled coupon', { code: 'BLACKFRIDAY25' }, 409, 'dupe', 'A coupon with that code already exists. Pick a different code.', 'code'],
  ])('refuses %s', async (_name, patch, status, code, message, field) => {
    const before = (await getCoupons()).length;
    const e = await apiError(create({ ...base, ...patch }));
    expect([e.status, e.code, e.message]).toEqual([status, code, message]);
    expect(e.fields?.[field]).toBe(message);
    expect((await getCoupons()).length).toBe(before);
  });

  it('reports every bad field at once, the first one as the message', async () => {
    const e = await apiError(create({ ...base, code: 'NO SPACES', percent: 0, maxRedemptions: -2, expiresAt: torontoDate(-5) }));
    expect([e.status, e.code]).toEqual([400, 'code']);
    expect(Object.keys(e.fields ?? {}).sort()).toEqual(['code', 'expiresAt', 'maxRedemptions', 'percent']);
  });

  it('needs a discount type, a scope and a duration for monthly scopes', async () => {
    const raw = await apiError(api.post('/coupons', { percent: 20, appliesTo: 'everything' }, { idempotencyKey: testKey() }));
    expect([raw.status, raw.code]).toEqual([400, 'type']);
    expect(Object.keys(raw.fields ?? {}).sort()).toEqual(['appliesTo', 'type']);

    const noDuration = await apiError(create({ ...base, duration: undefined }));
    expect([noDuration.code, noDuration.fields?.duration]).toEqual(['duration', 'Pick how long the discount lasts.']);
  });

  it('answers noproducts when Stripe has no price for the scope', async () => {
    const webline = pricingState.products[0];
    webline.inStripe = false;
    try {
      const e = await apiError(create({ ...base, appliesTo: 'webline_care' }));
      expect([e.status, e.code, e.message]).toEqual([
        422,
        'noproducts',
        'No matching Stripe products yet. Save a price on the Pricing page first.',
      ]);
      // Growth plans are still in Stripe, so those coupons still work.
      expect((await create(base)).status).toBe('active');
    } finally {
      webline.inStripe = true;
    }
  });

  it('answers nostripe when Stripe is not configured', async () => {
    pricingState.stripeConfigured = false;
    try {
      const e = await apiError(create(base));
      expect([e.status, e.code, e.message]).toEqual([503, 'nostripe', "Stripe is not configured, so coupons can't be created."]);
    } finally {
      pricingState.stripeConfigured = true;
    }
  });
});

describe('POST /coupons/:id/disable', () => {
  it('disables for good, drops the deal link, and the list shows it', async () => {
    const coupon = await disableCoupon('cpn_tkm7q4x001');
    expect(zCoupon.safeParse(coupon).success).toBe(true);
    expect(coupon).toMatchObject({ id: 'cpn_tkm7q4x001', code: 'TKM-7Q4X', status: 'disabled' });
    expect(coupon.dealUrl).toBeUndefined();

    const listed = byCode(await getCoupons(), 'TKM-7Q4X');
    expect(listed?.status).toBe('disabled');
    expect(listed?.dealUrl).toBeUndefined();

    // A retry after a dropped connection gets the same answer.
    expect((await disableCoupon('cpn_tkm7q4x001')).status).toBe('disabled');
  });

  it('answers 404 for an unknown coupon', async () => {
    const e = await apiError(disableCoupon('cpn_nope'));
    expect([e.status, e.code]).toEqual([404, 'not_found']);
  });
});
