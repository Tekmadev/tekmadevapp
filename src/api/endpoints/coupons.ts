import { queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import {
  zCoupon,
  zCoupons,
  type Coupon,
  type CouponDiscountType,
  type CouponDuration,
  type CouponScope,
  type Coupons,
} from '../schemas/coupons';

/**
 * Typed endpoints and query keys for the "coupons" domain (owner only).
 * Coupons are created in Stripe: wait for the server, never insert one
 * optimistically. After a create or disable, put the returned coupon in the
 * list cache (or invalidate `couponKeys.all`).
 */

export const couponKeys = {
  all: ['coupons'] as const,
  list: () => ['coupons', 'list'] as const,
};

/**
 * POST /coupons body, flat like the New coupon sheet. `fields` in a 400 use
 * these same keys. Leave `code` empty for an auto code (e.g. TKM-7Q4X); the
 * server uppercases it either way.
 */
export type NewCouponInput = {
  code?: string | null;
  label?: string | null;
  type: CouponDiscountType;
  /** For `percent`: 1 to 100. */
  percent?: number;
  /** For `amount`: cents, more than 0. */
  amount?: number;
  appliesTo: CouponScope;
  /** Monthly scopes only (one-time scopes always apply once). */
  duration?: CouponDuration;
  /** For `repeating`: 1 or more. */
  months?: number | null;
  /** Null or omitted: unlimited. */
  maxRedemptions?: number | null;
  /** Toronto calendar date `YYYY-MM-DD`, after today. Null or omitted: never expires. */
  expiresAt?: string | null;
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** GET /coupons: every coupon, newest first, with `dealUrl` when shareable. */
export function getCoupons(signal?: AbortSignal) {
  return api.get<Coupons>('/coupons', { schema: zCoupons, signal });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Create once per intent: reuse the same idempotency key when retrying. */
export function createCoupon(input: NewCouponInput, idempotencyKey: string) {
  return api.post<Coupon>('/coupons', input, { schema: zCoupon, idempotencyKey });
}

/** Permanent: there is no re-enable. Disabling twice is harmless and returns the same coupon. */
export function disableCoupon(id: string) {
  return api.post<Coupon>(`/coupons/${seg(id)}/disable`, {}, { schema: zCoupon });
}

/* ------------------------------------------------------------------ */
/* Query options                                                       */
/* ------------------------------------------------------------------ */

export function couponsQuery() {
  return queryOptions({
    queryKey: couponKeys.list(),
    queryFn: ({ signal }) => getCoupons(signal),
  });
}
