import { z } from 'zod';

import { zCents, zTone } from '../types';

/**
 * Schemas for the "pricing" domain (contract section 11, Sales and settings; brief 8.12).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * Every amount is integer cents with a sibling `currency` (CAD today). Saving a
 * price creates a new Stripe price and archives the old one, so the server, not
 * the app, decides what is live; the app only shows what it reports.
 */

/* ---------- plans (The Growth System) ---------- */

export const zPricingPlanId = z.enum(['convert', 'grow', 'lets-talk']);
export type PricingPlanId = z.infer<typeof zPricingPlanId>;

export const zPricingPlan = z.object({
  id: zPricingPlanId,
  name: z.string(),
  /** Monthly fee, cents. */
  monthly: zCents,
  /** The one-time fee buyers see as "Build & Install", cents. */
  setup: zCents,
  currency: z.string(),
  /** False shows "Not yet in Stripe": checkout cannot sell it until a price is saved. */
  inStripe: z.boolean(),
  /** Display order, cheapest monthly first. Recomputed by the server after a save. */
  sort: z.number().int(),
});
export type PricingPlan = z.infer<typeof zPricingPlan>;

/* ---------- products (Webline) ---------- */

/**
 * Server-computed: `selling` (purchasable and priced in Stripe), `paused`
 * (Purchasable is off: the page shows a Book a call button), `not_in_stripe`.
 */
export const zPricingProductStatus = z.enum(['selling', 'paused', 'not_in_stripe']);
export type PricingProductStatus = z.infer<typeof zPricingProductStatus>;

export const zPricingProduct = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string().nullable(),
  status: zPricingProductStatus,
  /** One-time fee, cents. */
  amount: zCents,
  /** Shown struck through next to the fee. Null hides it. */
  compareAt: zCents.nullable(),
  /** Webline Care, billed monthly, cents. */
  monthly: zCents,
  currency: z.string(),
  /** "First charge after": days before Webline Care first bills (1 to 365). */
  trialDays: z.number().int(),
  /** "Purchasable". Off pauses sales; the page stays up with a Book a call button. */
  active: z.boolean(),
  inStripe: z.boolean(),
});
export type PricingProduct = z.infer<typeof zPricingProduct>;

/* ---------- sales tax ---------- */

export const zTaxMode = z.enum(['live', 'test']);
export type TaxMode = z.infer<typeof zTaxMode>;

/** Badge: Charging (ok), On, not charging (warn), Off (muted). Labels and tones come from GET /meta. */
export const zTaxState = z.enum(['charging', 'on_not_charging', 'off']);
export type TaxState = z.infer<typeof zTaxState>;

export const zTaxStatus = z.object({
  state: zTaxState,
  /** Plain explanation of what buyers pay, ready to show under the badge. */
  explanation: z.string(),
  /** The Stripe Tax readiness line. */
  readiness: z.string(),
});
export type TaxStatus = z.infer<typeof zTaxStatus>;

export const zSalesTax = z.object({
  /** The switches: what the owner asked for in each mode. */
  setting: z.object({ live: z.boolean(), test: z.boolean() }),
  live: zTaxStatus,
  /** Null when the Stripe sandbox is not configured (hide the "Test mode" switch). */
  test: zTaxStatus.nullable(),
});
export type SalesTax = z.infer<typeof zSalesTax>;

/* ---------- responses ---------- */

export const zPricing = z.object({
  plans: z.array(zPricingPlan),
  products: z.array(zPricingProduct),
  salesTax: zSalesTax,
});
export type Pricing = z.infer<typeof zPricing>;

/**
 * What happened in Stripe: `synced` (new prices created, old ones archived),
 * `skipped` (nothing Stripe cares about changed), `failed`. A failure also comes
 * back as a 502 with code `stripe` whose message says what was and was not saved.
 */
export const zStripeSync = z.enum(['synced', 'skipped', 'failed']);
export type StripeSync = z.infer<typeof zStripeSync>;

export const zPlanUpdateResult = z.object({ plan: zPricingPlan, stripe: zStripeSync });
export type PlanUpdateResult = z.infer<typeof zPlanUpdateResult>;

export const zProductUpdateResult = z.object({ product: zPricingProduct, stripe: zStripeSync });
export type ProductUpdateResult = z.infer<typeof zProductUpdateResult>;

/* ---------- GET /meta fragment ---------- */

const tonedOption = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string(), tone: zTone });

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  salesTaxStates: z.array(tonedOption(zTaxState)),
  pricingProductStatuses: z.array(tonedOption(zPricingProductStatus)),
});
export type PricingMeta = z.infer<typeof metaFragment>;
