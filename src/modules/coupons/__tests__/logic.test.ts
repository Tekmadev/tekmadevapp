import { metaFixture } from '@/api/mock/fixtures/coupons';
import type { Coupon } from '@/api/schemas/coupons';

import {
  COUPON_MESSAGES,
  couponErrors,
  couponFace,
  couponInput,
  createdToast,
  dealUrlOf,
  durationOptions,
  durationText,
  emptyCouponForm,
  expiresText,
  formatDiscount,
  isMonthlyScope,
  minExpiry,
  previewFace,
  redeemedText,
  scopeOptions,
  statusBadge,
  upsertCoupon,
  type CouponForm,
} from '../logic';

// Noon in Toronto on Oct 2, 2026.
const NOW = new Date('2026-10-02T16:00:00Z');
const SCOPES = metaFixture.couponScopes;

const form = (patch: Partial<CouponForm> = {}): CouponForm => ({ ...emptyCouponForm('growth_monthly'), ...patch });

const coupon = (patch: Partial<Coupon> = {}): Coupon => ({
  id: 'cpn_1',
  code: 'FALLGROW',
  label: 'Fall push',
  discount: { type: 'percent', percent: 20 },
  appliesTo: { value: 'growth_monthly', label: 'Growth plans, monthly' },
  duration: 'repeating',
  months: 3,
  redeemed: 4,
  maxRedemptions: 10,
  expiresAt: '2026-11-16',
  status: 'active',
  dealUrl: 'https://www.tekmadev.com/deal/FALLGROW',
  createdAt: '2026-09-20T15:00:00.000000Z',
  ...patch,
});

describe('formatDiscount', () => {
  it('reads percent and fixed amounts like the brief', () => {
    expect(formatDiscount({ type: 'percent', percent: 20 })).toBe('20% off');
    expect(formatDiscount({ type: 'percent', percent: 12.5 })).toBe('12.5% off');
    expect(formatDiscount({ type: 'amount', amount: 10_000, currency: 'CAD' })).toBe('$100.00 off');
    expect(formatDiscount({ type: 'amount', amount: 7_750, currency: 'CAD' })).toBe('$77.50 off');
  });
});

describe('durationText', () => {
  it('uses the meta labels and counts months', () => {
    expect(durationText(metaFixture, 'once')).toBe('One charge');
    expect(durationText(metaFixture, 'first_month')).toBe('First month');
    expect(durationText(metaFixture, 'forever')).toBe('Forever');
    expect(durationText(metaFixture, 'repeating', 3)).toBe('3 months');
    expect(durationText(metaFixture, 'repeating', 1)).toBe('1 month');
  });
  it('falls back to the brief words without meta', () => {
    expect(durationText(undefined, 'once')).toBe('One charge');
    expect(durationText(undefined, 'repeating', 12)).toBe('12 months');
  });
});

describe('list facts', () => {
  it('shows redeemed against the cap, or unlimited', () => {
    expect(redeemedText(4, 10)).toBe('4 / 10');
    expect(redeemedText(2, null)).toBe('2 / Unlimited');
  });
  it('shows the expiry as a Toronto calendar date, or Never', () => {
    expect(expiresText('2026-11-16', NOW)).toBe('Nov 16');
    expect(expiresText('2027-01-04', NOW)).toBe('Jan 4, 2027');
    expect(expiresText(null, NOW)).toBe('Never');
  });
  it('badges active gold and disabled muted', () => {
    expect(statusBadge(undefined, 'active')).toEqual({ label: 'Active', tone: 'gold' });
    expect(statusBadge(metaFixture, 'disabled')).toEqual({ label: 'Disabled', tone: 'muted' });
  });
  it('builds a row from a coupon', () => {
    expect(couponFace(coupon(), metaFixture, NOW)).toMatchObject({
      code: 'FALLGROW',
      discount: '20% off',
      appliesTo: 'Growth plans, monthly',
      duration: '3 months',
      redeemed: '4 / 10',
      expires: 'Nov 16',
    });
  });
});

describe('dealUrlOf', () => {
  it('offers the deal link only for active coupons the API gave one', () => {
    expect(dealUrlOf(coupon())).toBe('https://www.tekmadev.com/deal/FALLGROW');
    expect(dealUrlOf(coupon({ status: 'disabled' }))).toBeNull();
    expect(dealUrlOf(coupon({ dealUrl: undefined }))).toBeNull();
  });
});

describe('upsertCoupon', () => {
  it('replaces by id or puts a new coupon first', () => {
    const a = coupon({ id: 'a' });
    const b = coupon({ id: 'b' });
    expect(upsertCoupon([a, b], { ...b, status: 'disabled' }).map((c) => [c.id, c.status])).toEqual([
      ['a', 'active'],
      ['b', 'disabled'],
    ]);
    expect(upsertCoupon([a], b).map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('options', () => {
  it('shows the Anything help in signal red', () => {
    const options = scopeOptions(SCOPES);
    expect(options.find((o) => o.value === 'anything')?.hintTone).toBe('signal');
    expect(options.find((o) => o.value === 'webline')?.hintTone).toBeUndefined();
  });
  it('lists the monthly duration choices in order', () => {
    expect(durationOptions(metaFixture).map((o) => o.label)).toEqual(['First month only', 'A set number of months', 'Forever']);
  });
  it('knows which scopes bill monthly', () => {
    expect(isMonthlyScope(SCOPES, 'growth_monthly')).toBe(true);
    expect(isMonthlyScope(SCOPES, 'webline')).toBe(false);
    expect(isMonthlyScope(SCOPES, null)).toBe(false);
  });
});

describe('couponErrors', () => {
  it('passes the defaults (20% off, auto code)', () => {
    expect(couponErrors(form(), SCOPES, NOW)).toEqual({});
  });
  it('checks the code shape', () => {
    expect(couponErrors(form({ code: 'AB' }), SCOPES, NOW).code).toBe(COUPON_MESSAGES.code);
    expect(couponErrors(form({ code: 'NEW_YEAR' }), SCOPES, NOW).code).toBe(COUPON_MESSAGES.code);
    expect(couponErrors(form({ code: 'STARTUP-50' }), SCOPES, NOW).code).toBeUndefined();
  });
  it('checks the percent or the amount, whichever is used', () => {
    expect(couponErrors(form({ percent: 0 }), SCOPES, NOW).percent).toBe(COUPON_MESSAGES.percent);
    expect(couponErrors(form({ percent: 101 }), SCOPES, NOW).percent).toBe(COUPON_MESSAGES.percent);
    expect(couponErrors(form({ percent: null }), SCOPES, NOW).percent).toBe(COUPON_MESSAGES.percent);
    expect(couponErrors(form({ type: 'amount', amount: 0, percent: null }), SCOPES, NOW)).toEqual({ amount: COUPON_MESSAGES.amount });
  });
  it('asks for months only on a monthly scope set to a number of months', () => {
    expect(couponErrors(form({ duration: 'repeating', months: 0 }), SCOPES, NOW).months).toBe(COUPON_MESSAGES.months);
    expect(couponErrors(form({ duration: 'forever', months: null }), SCOPES, NOW).months).toBeUndefined();
    expect(couponErrors(form({ appliesTo: 'webline', duration: 'repeating', months: null }), SCOPES, NOW).months).toBeUndefined();
  });
  it('needs a scope', () => {
    expect(couponErrors(form({ appliesTo: null }), SCOPES, NOW).appliesTo).toBe(COUPON_MESSAGES.scope);
  });
  it('checks max redemptions and a future expiry', () => {
    expect(couponErrors(form({ maxRedemptions: 0 }), SCOPES, NOW).maxRedemptions).toBe(COUPON_MESSAGES.max);
    expect(couponErrors(form({ expiresAt: '2026-10-02' }), SCOPES, NOW).expiresAt).toBe(COUPON_MESSAGES.expirespast);
    expect(couponErrors(form({ expiresAt: '2026-10-03' }), SCOPES, NOW).expiresAt).toBeUndefined();
    expect(minExpiry(NOW)).toBe('2026-10-03');
  });
});

describe('couponInput', () => {
  it('sends blanks as null and the duration for monthly scopes', () => {
    expect(couponInput(form({ duration: 'repeating', months: 3 }), 'growth_monthly', SCOPES)).toEqual({
      code: null,
      label: null,
      type: 'percent',
      percent: 20,
      appliesTo: 'growth_monthly',
      duration: 'repeating',
      months: 3,
      maxRedemptions: null,
      expiresAt: null,
    });
  });
  it('leaves the duration out for one-time scopes and sends the amount in cents', () => {
    const input = couponInput(
      form({ code: 'LAUNCH', label: ' Launch ', type: 'amount', amount: 10_000, maxRedemptions: 5, expiresAt: '2026-12-31' }),
      'webline',
      SCOPES,
    );
    expect(input).toEqual({
      code: 'LAUNCH',
      label: 'Launch',
      type: 'amount',
      amount: 10_000,
      appliesTo: 'webline',
      maxRedemptions: 5,
      expiresAt: '2026-12-31',
    });
  });
});

describe('previewFace', () => {
  it('reads like the list will, with an auto code placeholder', () => {
    expect(previewFace(form({ duration: 'repeating', months: 3, maxRedemptions: 10 }), SCOPES, metaFixture, NOW)).toMatchObject({
      code: null,
      discount: '20% off',
      appliesTo: 'Growth plans, monthly',
      duration: '3 months',
      redeemed: '0 / 10',
      expires: 'Never',
    });
  });
  it('shows One charge for one-time scopes', () => {
    expect(previewFace(form({ appliesTo: 'growth_setup', code: 'SETUP' }), SCOPES, metaFixture, NOW)).toMatchObject({
      code: 'SETUP',
      duration: 'One charge',
    });
  });
});

describe('copy', () => {
  it('matches the brief', () => {
    expect(createdToast('TKM-7Q4X')).toBe('Coupon "TKM-7Q4X" created and live at checkout.');
  });
});
