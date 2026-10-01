import { z } from 'zod';

import { zInstant, zMoney, zTone } from '../types';

/**
 * Schemas for the "billing" domain (Subscriptions screen; contract section 11,
 * Customers; brief 8.8). Live mode only: test purchases live in Test mode.
 * Validation only: no transforms, no defaults.
 */

export const zOrderStatus = z.enum(['pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed']);
export type OrderStatus = z.infer<typeof zOrderStatus>;

/** Stripe payment method families. Klarna, Afterpay and Affirm are paid in instalments. */
export const zPaymentMethod = z.enum(['card', 'klarna', 'afterpay', 'affirm', 'link']);
export type PaymentMethod = z.infer<typeof zPaymentMethod>;

/** Stripe subscription statuses. */
export const zSubscriptionStatus = z.enum(['active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused']);
export type SubscriptionStatus = z.infer<typeof zSubscriptionStatus>;

/** plan: a Growth System plan. care: Webline Care. */
export const zSubscriptionKind = z.enum(['plan', 'care']);
export type SubscriptionKind = z.infer<typeof zSubscriptionKind>;

export const zOrder = z.object({
  id: z.string(),
  /** The client the checkout created or matched; null for abandoned or failed checkouts. */
  clientId: z.string().nullable(),
  /** Row title is the business, or the email when there is none. */
  business: z.string().nullable(),
  email: z.string(),
  /** Product name, e.g. "Webline" or "Build & Install: Grow". */
  product: z.string(),
  status: zOrderStatus,
  amount: zMoney,
  /** How much went back to the customer (refunds and partial refunds); null when nothing did. */
  amountRefunded: zMoney.nullable(),
  /** Null while pending (no payment method chosen yet). */
  paidWith: zPaymentMethod.nullable(),
  /** Paid in instalments (Klarna, Afterpay, Affirm). */
  bnpl: z.boolean(),
  /** Attribution of the checkout (UTM source and campaign); null when untagged. */
  source: z.string().nullable(),
  campaign: z.string().nullable(),
  createdAt: zInstant,
  paidAt: zInstant.nullable(),
});
export type Order = z.infer<typeof zOrder>;

/** Stripe's cancellation details, as readable text. Null when the subscription was never cancelled. */
export const zCancellation = z.object({
  /** e.g. "Cancelled by the customer", "Payment failed". */
  reason: z.string().nullable(),
  /** The option the customer picked, e.g. "Too expensive". */
  feedback: z.string().nullable(),
  /** What the customer wrote, if anything. */
  comment: z.string().nullable(),
});
export type Cancellation = z.infer<typeof zCancellation>;

export const zSubscription = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  business: z.string().nullable(),
  email: z.string(),
  kind: zSubscriptionKind,
  /** Plan id for kind "plan" ("convert", "grow", "lets-talk"); null for Webline Care. */
  planId: z.string().nullable(),
  /** Plan name, or "Webline Care". */
  productName: z.string(),
  status: zSubscriptionStatus,
  /** True while cancelling: show "Ending <currentPeriodEnd>". */
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: zInstant.nullable(),
  amount: zMoney,
  interval: z.enum(['month', 'year']),
  /** Stripe customer id (copyable in the detail). */
  customerId: z.string(),
  createdAt: zInstant,
  canceledAt: zInstant.nullable(),
  cancellation: zCancellation.nullable(),
});
export type Subscription = z.infer<typeof zSubscription>;

/**
 * Totals for the screen subtitle: "{subscriptions} subscriptions · {orders} one-time
 * orders ({bnpl} paid in instalments)". Always over every live row, whatever the filters.
 */
export const zBillingSummary = z.object({
  subscriptions: z.number().int(),
  orders: z.number().int(),
  /** Orders paid with Klarna, Afterpay or Affirm (the payment went through). */
  bnpl: z.number().int(),
});
export type BillingSummary = z.infer<typeof zBillingSummary>;

/** GET /billing/orders: newest first, plus the subtitle totals. */
export const zOrderPage = z.object({
  items: z.array(zOrder),
  nextCursor: z.string().nullable(),
  summary: zBillingSummary,
});
export type OrderPage = z.infer<typeof zOrderPage>;

/** GET /billing/subscriptions: newest first, plus the subtitle totals. */
export const zSubscriptionPage = z.object({
  items: z.array(zSubscription),
  nextCursor: z.string().nullable(),
  summary: zBillingSummary,
});
export type SubscriptionPage = z.infer<typeof zSubscriptionPage>;

/* ---------- meta ---------- */

const option = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string() });
const tonedOption = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string(), tone: zTone });

/** This domain's slice of GET /meta (composed in schemas/meta.ts). Prefixed to stay clear of Test mode's keys. */
export const metaFragment = z.object({
  billingOrderStatuses: z.array(tonedOption(zOrderStatus)),
  billingSubscriptionStatuses: z.array(tonedOption(zSubscriptionStatus)),
  billingSubscriptionKinds: z.array(option(zSubscriptionKind)),
  billingPaymentMethods: z.array(z.object({ value: zPaymentMethod, label: z.string(), bnpl: z.boolean() })),
});
export type BillingMeta = z.infer<typeof metaFragment>;
