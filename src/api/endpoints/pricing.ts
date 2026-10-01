import { queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import {
  zPlanUpdateResult,
  zPricing,
  zProductUpdateResult,
  zSalesTax,
  type PlanUpdateResult,
  type Pricing,
  type PricingPlanId,
  type ProductUpdateResult,
  type SalesTax,
  type TaxMode,
} from '../schemas/pricing';

/**
 * Typed endpoints and query keys for the "pricing" domain (owner only):
 * growth plans, Webline, and sales tax.
 *
 * Everything here touches Stripe, so nothing is optimistic: show the pending
 * button, then apply what the server returns. A `stripe` error (502) means part
 * of the save may have landed; its message says exactly what, and the screen
 * should refetch GET /pricing afterwards.
 */

export const pricingKeys = {
  all: ['pricing'] as const,
  overview: () => ['pricing', 'overview'] as const,
};

/** PATCH /pricing/plans/:id: send only what changed, in cents. */
export type PlanPatch = Partial<{ monthly: number; setup: number }>;

/** PATCH /pricing/products/:id: send only what changed; `compareAt: null` removes the struck-through price. */
export type ProductPatch = Partial<{
  amount: number;
  compareAt: number | null;
  monthly: number;
  trialDays: number;
  active: boolean;
}>;

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** GET /pricing: plans (sorted by `sort`), products, and the sales tax card. */
export function getPricing(signal?: AbortSignal) {
  return api.get<Pricing>('/pricing', { schema: zPricing, signal });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Creates new Stripe prices for changed amounts and archives the old ones. */
export function updatePlan(id: PricingPlanId, patch: PlanPatch) {
  return api.patch<PlanUpdateResult>(`/pricing/plans/${seg(id)}`, patch, { schema: zPlanUpdateResult });
}

/** Amounts go to Stripe; compare-at, first charge delay and Purchasable are site settings. */
export function updateProduct(id: string, patch: ProductPatch) {
  return api.patch<ProductUpdateResult>(`/pricing/products/${seg(id)}`, patch, { schema: zProductUpdateResult });
}

/** PUT /pricing/sales-tax: turn tax on or off for live or test mode. Returns the whole tax card. */
export function setSalesTax(mode: TaxMode, on: boolean) {
  return api.put<SalesTax>('/pricing/sales-tax', { mode, on }, { schema: zSalesTax });
}

/* ------------------------------------------------------------------ */
/* Query options                                                       */
/* ------------------------------------------------------------------ */

export function pricingQuery() {
  return queryOptions({
    queryKey: pricingKeys.overview(),
    queryFn: ({ signal }) => getPricing(signal),
  });
}
