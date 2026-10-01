import { formatCents } from '@/lib/money';

import type { PlanUpdateResult, Pricing, PricingPlan, PricingProduct, ProductUpdateResult, SalesTax } from '../../schemas/pricing';
import { pricingState, productStatus, resortPlans, salesTaxSnapshot, STRIPE_FAIL_CENTS } from '../fixtures/pricing';
import { bool, fail, notFound, ok, type MockResult, type MockRoute } from '../router';

/**
 * Mock routes for the "pricing" domain (owner only). Saving a price "creates a
 * new Stripe price and archives the old one"; saving STRIPE_FAIL_CENTS ($999.99)
 * makes the fake Stripe refuse that one price, so the partial failure copy can
 * be seen. Every write returns the full updated entity.
 */

const INPUT_MESSAGE = 'Enter valid, non-negative numbers.';
const AMOUNT_FIELD = 'Enter an amount of 0 or more.';
const NOT_CONFIGURED = 'The server is missing a setting for this feature.';

const isCents = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

const snapshot = (): Pricing => {
  resortPlans();
  return {
    plans: pricingState.plans.map((p) => ({ ...p })),
    products: pricingState.products.map((p) => ({ ...p, status: productStatus(p) })),
    salesTax: salesTaxSnapshot(),
  };
};

/** One price change on its way to Stripe. */
type PriceChange<K extends string> = { key: K; label: string; before: string; after: string; value: number };

const joinLabels = (labels: string[]) =>
  labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

/** "Stripe did not accept ..., so it was not saved: ... Saved: ... Try again in a moment." */
function stripeFailureMessage<K extends string>(failed: PriceChange<K>[], saved: string[]): string {
  const plural = failed.length > 1;
  const still = failed.map((c) => `the ${c.label} is still ${c.before}`).join(' and ');
  const first = `Stripe did not accept the new ${joinLabels(failed.map((c) => c.label))}, so ${plural ? 'they were' : 'it was'} not saved: ${still}.`;
  const rest = saved.length > 0 ? ` Saved: ${joinLabels(saved)}.` : ' Nothing else changed.';
  return `${first}${rest} Try again in a moment.`;
}

const savedNote = <K extends string>(c: PriceChange<K>) => `the ${c.label} is now ${c.after}`;

/**
 * Applies price changes one by one like the server does with Stripe: each one
 * either lands (site and Stripe) or is refused and left untouched.
 */
function applyPriceChanges<K extends string>(
  changes: PriceChange<K>[],
  apply: (change: PriceChange<K>) => void,
): { failed: PriceChange<K>[]; saved: PriceChange<K>[] } {
  const failed: PriceChange<K>[] = [];
  const saved: PriceChange<K>[] = [];
  for (const change of changes) {
    if (change.value === STRIPE_FAIL_CENTS) failed.push(change);
    else {
      apply(change);
      saved.push(change);
    }
  }
  return { failed, saved };
}

function stripeFailure<K extends string>(failed: PriceChange<K>[], saved: string[]): MockResult {
  const fields: Record<string, string> = {};
  for (const c of failed) fields[c.key] = `Stripe did not accept this price. It is still ${c.before}.`;
  return fail(502, 'stripe', stripeFailureMessage(failed, saved), fields);
}

const PLAN_LABELS = { monthly: 'monthly fee', setup: 'Build & Install fee' } as const;
const PRODUCT_LABELS = { amount: 'one-time fee', monthly: 'Webline Care monthly fee' } as const;

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/pricing',
    ownerOnly: true,
    latency: 'normal',
    handler: () => ok(snapshot()),
  },
  {
    method: 'PATCH',
    path: '/pricing/plans/:id',
    ownerOnly: true,
    latency: 'slow',
    handler: ({ params, body }) => {
      const plan = pricingState.plans.find((p) => p.id === params.id);
      if (!plan) return notFound('That plan');

      const fields: Record<string, string> = {};
      const next: Partial<Record<keyof typeof PLAN_LABELS, number>> = {};
      for (const key of ['monthly', 'setup'] as const) {
        if (!(key in body)) continue;
        const value = body[key];
        if (isCents(value)) next[key] = value;
        else fields[key] = AMOUNT_FIELD;
      }
      if (Object.keys(fields).length > 0) return fail(400, 'input', INPUT_MESSAGE, fields);

      const changes: PriceChange<keyof typeof PLAN_LABELS>[] = [];
      for (const key of ['monthly', 'setup'] as const) {
        const value = next[key];
        if (value === undefined || value === plan[key]) continue;
        changes.push({
          key,
          label: PLAN_LABELS[key],
          before: formatCents(plan[key], plan.currency),
          after: formatCents(value, plan.currency),
          value,
        });
      }
      // Nothing new for Stripe: no new price, nothing archived.
      if (changes.length === 0) return ok<PlanUpdateResult>({ plan: { ...plan }, stripe: 'skipped' });

      const { failed, saved } = applyPriceChanges(changes, (c) => {
        plan[c.key] = c.value;
      });
      // A saved price means the plan now exists in Stripe.
      if (saved.length > 0 && pricingState.stripeConfigured) plan.inStripe = true;
      resortPlans();
      if (failed.length > 0) return stripeFailure(failed, saved.map(savedNote));
      const updated: PricingPlan = { ...plan };
      return ok<PlanUpdateResult>({ plan: updated, stripe: pricingState.stripeConfigured ? 'synced' : 'skipped' });
    },
  },
  {
    method: 'PATCH',
    path: '/pricing/products/:id',
    ownerOnly: true,
    latency: 'slow',
    handler: ({ params, body }) => {
      const product = pricingState.products.find((p) => p.id === params.id);
      if (!product) return notFound('That product');

      const fields: Record<string, string> = {};
      const next: { amount?: number; compareAt?: number | null; monthly?: number; trialDays?: number; active?: boolean } = {};
      for (const key of ['amount', 'monthly'] as const) {
        if (!(key in body)) continue;
        const value = body[key];
        if (isCents(value)) next[key] = value;
        else fields[key] = AMOUNT_FIELD;
      }
      if ('compareAt' in body) {
        const value = body.compareAt;
        if (value === null || isCents(value)) next.compareAt = value;
        else fields.compareAt = 'Enter an amount of 0 or more, or leave it empty.';
      }
      if ('trialDays' in body) {
        const value = body.trialDays;
        if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 365) next.trialDays = value;
        else fields.trialDays = 'Enter a number of days from 1 to 365.';
      }
      if ('active' in body) {
        const value = bool(body.active);
        if (value === undefined) fields.active = 'Turn Purchasable on or off.';
        else next.active = value;
      }
      if (Object.keys(fields).length > 0) return fail(400, 'input', INPUT_MESSAGE, fields);

      // A struck-through price must be higher than what buyers pay, or it reads as a mistake.
      const amountAfter = next.amount ?? product.amount;
      const compareAfter = next.compareAt !== undefined ? next.compareAt : product.compareAt;
      if (compareAfter !== null && compareAfter <= amountAfter) {
        const message = 'The compare-at price must be higher than the one-time fee.';
        return fail(400, 'compare_at', message, { compareAt: message });
      }

      // Display-only fields save straight away; they never touch Stripe.
      const displaySaved: string[] = [];
      if (next.compareAt !== undefined && next.compareAt !== product.compareAt) {
        product.compareAt = next.compareAt;
        displaySaved.push(
          next.compareAt === null
            ? 'the compare-at price is removed'
            : `the compare-at price is now ${formatCents(next.compareAt, product.currency)}`,
        );
      }
      if (next.trialDays !== undefined && next.trialDays !== product.trialDays) {
        product.trialDays = next.trialDays;
        displaySaved.push(`the first charge is now after ${next.trialDays} ${next.trialDays === 1 ? 'day' : 'days'}`);
      }
      if (next.active !== undefined && next.active !== product.active) {
        product.active = next.active;
        displaySaved.push(next.active ? 'Purchasable is on' : 'Purchasable is off');
      }

      const changes: PriceChange<keyof typeof PRODUCT_LABELS>[] = [];
      for (const key of ['amount', 'monthly'] as const) {
        const value = next[key];
        if (value === undefined || value === product[key]) continue;
        changes.push({
          key,
          label: PRODUCT_LABELS[key],
          before: formatCents(product[key], product.currency),
          after: formatCents(value, product.currency),
          value,
        });
      }

      const { failed, saved } = applyPriceChanges(changes, (c) => {
        product[c.key] = c.value;
      });
      if (saved.length > 0 && pricingState.stripeConfigured) product.inStripe = true;
      product.status = productStatus(product);
      if (failed.length > 0) return stripeFailure(failed, [...saved.map(savedNote), ...displaySaved]);

      const updated: PricingProduct = { ...product };
      const stripe = saved.length > 0 && pricingState.stripeConfigured ? 'synced' : 'skipped';
      return ok<ProductUpdateResult>({ product: updated, stripe });
    },
  },
  {
    method: 'PUT',
    path: '/pricing/sales-tax',
    ownerOnly: true,
    latency: 'slow',
    handler: ({ body }) => {
      const mode = body.mode;
      const on = bool(body.on);
      if ((mode !== 'live' && mode !== 'test') || on === undefined) {
        const fields: Record<string, string> = {};
        if (mode !== 'live' && mode !== 'test') fields.mode = 'Send "live" or "test".';
        if (on === undefined) fields.on = 'Send true or false.';
        return fail(400, 'tax', 'Pick live or test mode, and on or off.', fields);
      }
      if (!pricingState.stripeConfigured) return fail(503, 'not_configured', NOT_CONFIGURED);
      if (mode === 'test' && !pricingState.sandboxConfigured) return fail(503, 'not_configured', NOT_CONFIGURED);
      pricingState.taxSetting[mode] = on;
      return ok<SalesTax>(salesTaxSnapshot());
    },
  },
];
