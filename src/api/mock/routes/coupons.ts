import { addDays, parseCalendarDate } from '@/lib/dates';

import type { Coupon, CouponDiscount, CouponDuration, CouponScope } from '../../schemas/coupons';
import { couponsState, DEAL_BASE_URL, DEAL_SCOPES, scopeOption, type StoredCoupon } from '../fixtures/coupons';
import { pricingState } from '../fixtures/pricing';
import { byNewest, fail, mockId, notFound, nowIso, ok, torontoDate, type MockRoute } from '../router';

/**
 * Mock routes for the "coupons" domain (owner only). Every rule from the
 * contract's error table is here with its exact code and message. Coupons live
 * in Stripe, so creating one needs Stripe keys (`nostripe`) and a Stripe price
 * for what it applies to (`noproducts`, read from the Pricing fixture).
 */

const MESSAGES = {
  percent: 'Percent off must be between 1 and 100.',
  amount: 'Enter a fixed amount greater than zero.',
  months: 'Enter a valid number of months (1 or more).',
  max: 'Max redemptions must be 1 or more.',
  expires: 'Enter a valid expiry date.',
  expirespast: 'The expiry date must be in the future.',
  code: "That code isn't valid. Use letters, numbers and dashes.",
  dupe: 'A coupon with that code already exists. Pick a different code.',
  noproducts: 'No matching Stripe products yet. Save a price on the Pricing page first.',
  nostripe: "Stripe is not configured, so coupons can't be created.",
  // Not in the contract table: requested in docs/api-requests/coupons.md.
  type: 'Pick Percent off or Fixed amount off.',
  scope: 'Pick what the coupon applies to.',
  duration: 'Pick how long the discount lasts.',
  label: 'Keep the label to 80 characters or fewer.',
} as const;
type ErrorCode = keyof typeof MESSAGES;

const CODE_PATTERN = /^[A-Z0-9-]{3,40}$/;
const LABEL_MAX = 80;
const MONTHLY_DURATIONS: readonly CouponDuration[] = ['first_month', 'repeating', 'forever'];

/** The API shape: `dealUrl` only for active coupons scoped to growth plans monthly or Anything. */
export function presentCoupon(coupon: StoredCoupon): Coupon {
  const shareable = coupon.status === 'active' && DEAL_SCOPES.includes(coupon.appliesTo.value);
  return shareable ? { ...coupon, dealUrl: `${DEAL_BASE_URL}${encodeURIComponent(coupon.code)}` } : { ...coupon };
}

/** Does Stripe have a price for anything this scope applies to? */
function scopeHasStripeProducts(scope: CouponScope): boolean {
  const anyPlan = pricingState.plans.some((p) => p.inStripe);
  const webline = pricingState.products.some((p) => p.id === 'webline' && p.inStripe);
  switch (scope) {
    case 'growth_monthly':
    case 'growth_setup':
      return anyPlan;
    case 'webline':
    case 'webline_care':
      return webline;
    case 'anything':
      return anyPlan || webline;
  }
}

/** "TKM-7Q4X": no 0/O or 1/I, so it reads cleanly over the phone. */
function autoCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    const code = `TKM-${suffix}`;
    if (!couponsState.coupons.some((c) => c.code === code)) return code;
  }
}

const isWholeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

/** A real calendar day: "2026-02-31" has the right shape but rolls over, so it is refused. */
const isRealDate = (value: string) => parseCalendarDate(value) !== null && addDays(value, 0) === value;

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/coupons',
    ownerOnly: true,
    latency: 'normal',
    handler: () => ok<Coupon[]>([...couponsState.coupons].sort(byNewest((c) => c.createdAt)).map(presentCoupon)),
  },
  {
    method: 'POST',
    path: '/coupons',
    ownerOnly: true,
    latency: 'slow',
    handler: ({ body }) => {
      if (!pricingState.stripeConfigured) return fail(503, 'nostripe', MESSAGES.nostripe);

      // Collect every inline error; the first one (in form order) is the toast.
      const errors: { code: ErrorCode; field: string }[] = [];
      const error = (code: ErrorCode, field: string) => errors.push({ code, field });

      // Code: optional, uppercased, letters, numbers and dashes.
      let code: string | null = null;
      if (body.code !== undefined && body.code !== null) {
        const raw = typeof body.code === 'string' ? body.code.trim().toUpperCase() : null;
        if (raw === null || (raw !== '' && !CODE_PATTERN.test(raw))) error('code', 'code');
        else if (raw !== '') code = raw;
      }

      // Internal label: optional.
      let label: string | null = null;
      if (body.label !== undefined && body.label !== null) {
        const raw = typeof body.label === 'string' ? body.label.trim() : null;
        if (raw === null || raw.length > LABEL_MAX) error('label', 'label');
        else label = raw || null;
      }

      // Discount.
      let discount: CouponDiscount | null = null;
      if (body.type === 'percent') {
        const p = body.percent;
        // Up to two decimals (12.5% is fine), like Stripe.
        if (typeof p !== 'number' || !Number.isFinite(p) || p < 1 || p > 100 || Math.round(p * 100) !== p * 100) {
          error('percent', 'percent');
        } else discount = { type: 'percent', percent: p };
      } else if (body.type === 'amount') {
        const a = body.amount;
        if (!isWholeNumber(a) || a <= 0) error('amount', 'amount');
        else discount = { type: 'amount', amount: a, currency: 'CAD' };
      } else error('type', 'type');

      // Applies to.
      const scope = typeof body.appliesTo === 'string' ? scopeOption(body.appliesTo as CouponScope) : undefined;
      if (!scope) error('scope', 'appliesTo');

      // Duration: one-time scopes always apply once; monthly scopes must pick.
      let duration: CouponDuration = 'once';
      let months: number | undefined;
      if (scope && !scope.oneTime) {
        const d = body.duration;
        if (typeof d !== 'string' || !MONTHLY_DURATIONS.includes(d as CouponDuration)) error('duration', 'duration');
        else {
          duration = d as CouponDuration;
          if (duration === 'repeating') {
            if (!isWholeNumber(body.months) || body.months < 1) error('months', 'months');
            else months = body.months;
          }
        }
      }

      // Max redemptions: optional (unlimited).
      let maxRedemptions: number | null = null;
      if (body.maxRedemptions !== undefined && body.maxRedemptions !== null) {
        if (!isWholeNumber(body.maxRedemptions) || body.maxRedemptions < 1) error('max', 'maxRedemptions');
        else maxRedemptions = body.maxRedemptions;
      }

      // Expiry: optional Toronto calendar date, after today.
      let expiresAt: string | null = null;
      if (body.expiresAt !== undefined && body.expiresAt !== null) {
        const raw = body.expiresAt;
        if (typeof raw !== 'string' || !isRealDate(raw)) error('expires', 'expiresAt');
        else if (raw <= torontoDate(0)) error('expirespast', 'expiresAt');
        else expiresAt = raw;
      }

      if (errors.length > 0 || !discount || !scope) {
        const first = errors[0] ?? { code: 'type' as const, field: 'type' };
        const fields: Record<string, string> = {};
        for (const e of errors) fields[e.field] ??= MESSAGES[e.code];
        return fail(400, first.code, MESSAGES[first.code], fields);
      }

      if (code && couponsState.coupons.some((c) => c.code.toUpperCase() === code)) {
        return fail(409, 'dupe', MESSAGES.dupe, { code: MESSAGES.dupe });
      }
      if (!scopeHasStripeProducts(scope.value)) {
        return fail(422, 'noproducts', MESSAGES.noproducts, { appliesTo: MESSAGES.noproducts });
      }

      const coupon: StoredCoupon = {
        id: mockId('cpn'),
        code: code ?? autoCode(),
        label,
        discount,
        appliesTo: { value: scope.value, label: scope.label },
        duration,
        ...(months !== undefined ? { months } : {}),
        redeemed: 0,
        maxRedemptions,
        expiresAt,
        status: 'active',
        createdAt: nowIso(),
      };
      couponsState.coupons.unshift(coupon);
      return ok<Coupon>(presentCoupon(coupon), 201);
    },
  },
  {
    method: 'POST',
    path: '/coupons/:id/disable',
    ownerOnly: true,
    latency: 'slow',
    handler: ({ params }) => {
      const coupon = couponsState.coupons.find((c) => c.id === params.id);
      if (!coupon) return notFound('That coupon');
      // Already disabled: same answer, so a retry after a dropped connection is harmless.
      coupon.status = 'disabled';
      return ok<Coupon>(presentCoupon(coupon));
    },
  },
];
