import { z } from 'zod';

import { zCents, zDate, zInstant, zTone } from '../types';

/**
 * Schemas for the "coupons" domain (contract section 11, Sales and settings; brief 8.13).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * Coupons live in Stripe. The server checks every rule (codes, scopes, Stripe
 * products); the app only shows its answer, so nothing here is computed locally.
 */

/** What a coupon takes money off. Labels, help text and `oneTime` come from GET /meta. */
export const zCouponScope = z.enum(['growth_monthly', 'growth_setup', 'webline', 'webline_care', 'anything']);
export type CouponScope = z.infer<typeof zCouponScope>;

/**
 * `once` is the only duration for one-time scopes ("One charge"). Monthly scopes
 * pick `first_month`, `repeating` (with `months`) or `forever`.
 */
export const zCouponDuration = z.enum(['once', 'first_month', 'repeating', 'forever']);
export type CouponDuration = z.infer<typeof zCouponDuration>;

/** There is no re-enable: a disabled coupon stays disabled. */
export const zCouponStatus = z.enum(['active', 'disabled']);
export type CouponStatus = z.infer<typeof zCouponStatus>;

export const zCouponDiscountType = z.enum(['percent', 'amount']);
export type CouponDiscountType = z.infer<typeof zCouponDiscountType>;

export const zCouponDiscount = z.discriminatedUnion('type', [
  /** "20% off". Up to two decimals (12.5% is fine). */
  z.object({ type: z.literal('percent'), percent: z.number() }),
  /** "$100.00 off". */
  z.object({ type: z.literal('amount'), amount: zCents, currency: z.string() }),
]);
export type CouponDiscount = z.infer<typeof zCouponDiscount>;

export const zCoupon = z.object({
  id: z.string(),
  /** Uppercase letters, numbers and dashes. Show it in monospace. */
  code: z.string(),
  /** Internal label, never shown to buyers. */
  label: z.string().nullable(),
  discount: zCouponDiscount,
  appliesTo: z.object({ value: zCouponScope, label: z.string() }),
  duration: zCouponDuration,
  /** Only for `repeating`. */
  months: z.number().int().optional(),
  redeemed: z.number().int(),
  /** Null means unlimited. */
  maxRedemptions: z.number().int().nullable(),
  /** Toronto calendar date, or null for no expiry. */
  expiresAt: zDate.nullable(),
  status: zCouponStatus,
  /**
   * Shareable checkout link with the coupon applied. Only sent for active
   * coupons scoped to growth plans monthly or Anything.
   */
  dealUrl: z.string().optional(),
  createdAt: zInstant,
});
export type Coupon = z.infer<typeof zCoupon>;

/** GET /coupons: every coupon, newest first (not paged). */
export const zCoupons = z.array(zCoupon);
export type Coupons = z.infer<typeof zCoupons>;

/* ---------- GET /meta fragment ---------- */

export const zCouponScopeOption = z.object({
  value: zCouponScope,
  label: z.string(),
  /** Shown under the choice. The `anything` help is a warning: show it in signal red. */
  help: z.string(),
  /** One-time fees: no duration choice, the coupon applies once. */
  oneTime: z.boolean(),
});
export type CouponScopeOption = z.infer<typeof zCouponScopeOption>;

export const zCouponDurationOption = z.object({
  value: zCouponDuration,
  /** List copy ("One charge", "First month", "Forever"). For `repeating` show "{months} months". */
  label: z.string(),
  /** New coupon sheet copy ("First month only"). Null: not a choice (set by the scope). */
  choice: z.string().nullable(),
});
export type CouponDurationOption = z.infer<typeof zCouponDurationOption>;

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  couponScopes: z.array(zCouponScopeOption),
  couponDurations: z.array(zCouponDurationOption),
  couponStatuses: z.array(z.object({ value: zCouponStatus, label: z.string(), tone: zTone })),
  couponDiscountTypes: z.array(z.object({ value: zCouponDiscountType, label: z.string() })),
});
export type CouponsMeta = z.infer<typeof metaFragment>;
