import type { PlanPatch, ProductPatch } from '@/api/endpoints/pricing';
import type {
  Pricing,
  PricingMeta,
  PricingPlan,
  PricingProduct,
  PricingProductStatus,
  SalesTax,
  StripeSync,
  TaxMode,
  TaxState,
} from '@/api/schemas/pricing';
import type { Tone } from '@/design/tokens';

/**
 * Pure helpers for the Pricing screen (brief 8.12): labels with the brief's
 * fallbacks, the edit overlay each card keeps on top of the server's values,
 * the PATCH bodies (only what changed), local checks, and the save copy.
 * The server stays the judge of every rule; these only give instant feedback.
 */

/* ---------- copy ---------- */

export const PRICING_NOTE =
  'Saving creates a new Stripe price and archives the old one. Existing subscribers keep their price; only new checkouts use the new amount.';
export const SAVED_SYNCED = 'Saved. The site and Stripe are updated.';
/** Nothing went to Stripe (only site settings changed, or Stripe is not set up): never claim it did. */
export const SAVED_SITE_ONLY = 'Saved. The site is updated.';
/** A 200 that still says Stripe failed: the page is refetched to show what is saved. */
export const STRIPE_NOT_CONFIRMED = 'Saved on the site, but Stripe did not confirm the new price. The page now shows what is saved.';
export const PURCHASABLE_HELP = 'Uncheck to pause sales; the page stays up with a Book a call button';
export const COMPARE_AT_HELP = 'Shown struck through';

export const AMOUNT_REQUIRED = 'Enter an amount of 0 or more.';
export const TRIAL_DAYS_ERROR = 'Enter a number of days from 1 to 365.';
export const COMPARE_AT_ERROR = 'The compare-at price must be higher than the one-time fee.';

export const TRIAL_DAYS_MIN = 1;
export const TRIAL_DAYS_MAX = 365;

export type Badge = { label: string; tone: Tone };

/* ---------- labels ---------- */

const TAX_FALLBACK: Record<TaxState, Badge> = {
  charging: { label: 'Charging', tone: 'ok' },
  on_not_charging: { label: 'On, not charging', tone: 'warn' },
  off: { label: 'Off', tone: 'muted' },
};

const PRODUCT_FALLBACK: Record<PricingProductStatus, Badge> = {
  selling: { label: 'Selling', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  not_in_stripe: { label: 'Not yet in Stripe', tone: 'signal' },
};

/** The sales tax badge, from GET /meta, with the brief's words when meta is not loaded. */
export function taxBadge(meta: PricingMeta | undefined, state: TaxState): Badge {
  const found = meta?.salesTaxStates.find((s) => s.value === state);
  return found ? { label: found.label, tone: found.tone } : TAX_FALLBACK[state];
}

export function productBadge(meta: PricingMeta | undefined, status: PricingProductStatus): Badge {
  const found = meta?.pricingProductStatuses.find((s) => s.value === status);
  return found ? { label: found.label, tone: found.tone } : PRODUCT_FALLBACK[status];
}

export function planStripeBadge(plan: Pick<PricingPlan, 'inStripe'>): Badge {
  return plan.inStripe ? { label: 'Live in Stripe', tone: 'ok' } : { label: 'Not yet in Stripe', tone: 'signal' };
}

export const TAX_MODE_LABEL: Record<TaxMode, string> = { live: 'Live', test: 'Test mode' };

/** Live first, then Test mode only when the sandbox is configured. */
export function taxModes(salesTax: SalesTax): TaxMode[] {
  return salesTax.test ? ['live', 'test'] : ['live'];
}

/** Cheapest monthly first; the server's `sort` breaks ties. */
export function sortPlans(plans: readonly PricingPlan[]): PricingPlan[] {
  return [...plans].sort((a, b) => a.monthly - b.monthly || a.sort - b.sort);
}

/* ---------- sales tax confirm ---------- */

export type TaxConfirmCopy = {
  title: string;
  message: string;
  confirmLabel: string;
  pendingLabel: string;
  done: string;
};

/** The HoldToConfirm sheet for a tax switch: it changes what buyers pay. */
export function taxConfirmCopy(mode: TaxMode, on: boolean): TaxConfirmCopy {
  const where = mode === 'live' ? 'live checkout' : 'test mode';
  const name = mode === 'live' ? 'live' : 'test mode';
  if (on) {
    return {
      title: `Turn on sales tax for ${name}?`,
      message: `Buyers in ${where} will pay sales tax on top of the price once Stripe Tax is ready. This changes what they pay.`,
      confirmLabel: 'Hold to turn on tax',
      pendingLabel: 'Turning on',
      done: `Sales tax is on for ${where}.`,
    };
  }
  return {
    title: `Turn off sales tax for ${name}?`,
    message: `Buyers in ${where} will pay the price as shown, with no sales tax added. This changes what they pay.`,
    confirmLabel: 'Hold to turn off tax',
    pendingLabel: 'Turning off',
    done: `Sales tax is off for ${where}.`,
  };
}

/* ---------- save copy ---------- */

export type SaveNotice = { tone: 'ok' | 'err'; message: string };

/** What to say after a 200: only claim Stripe when Stripe actually took the change. */
export function saveNotice(stripe: StripeSync): SaveNotice {
  switch (stripe) {
    case 'synced':
      return { tone: 'ok', message: SAVED_SYNCED };
    case 'skipped':
      return { tone: 'ok', message: SAVED_SITE_ONLY };
    case 'failed':
      return { tone: 'err', message: STRIPE_NOT_CONFIRMED };
  }
}

/* ---------- edit overlay ---------- */

type Errors<K extends string> = Partial<Record<K, string>>;

/**
 * Edits sit on top of the server's values: a field the owner has not touched
 * follows the server (a refetch never fights the form), a touched one keeps
 * what was typed until it is saved.
 */
function overlay<V extends object>(server: V, edits: Partial<V>): V {
  const out = { ...server };
  for (const key of Object.keys(edits) as (keyof V)[]) {
    const value = edits[key];
    if (value !== undefined) out[key] = value as V[keyof V];
  }
  return out;
}

/**
 * When new server values land (a save's answer, a refetch), edits that now
 * match the server are dropped, so those fields follow the server again.
 * After a partial Stripe failure this leaves exactly the prices that did not
 * save, and Save stays on to retry them. Returns the same object when nothing
 * was dropped, so a refetch with no news does not re-render the card.
 */
export function pruneEdits<V extends object>(edits: Partial<V>, server: V): Partial<V> {
  let dropped = false;
  const out: Partial<V> = {};
  for (const key of Object.keys(edits) as (keyof V)[]) {
    if (edits[key] === server[key]) {
      dropped = true;
      continue;
    }
    out[key] = edits[key];
  }
  return dropped ? out : edits;
}

/* ---------- plans ---------- */

export type PlanValues = { monthly: number | null; setup: number | null };
export type PlanEdits = Partial<PlanValues>;
export type PlanErrors = Errors<keyof PlanValues>;

export function planValues(plan: PricingPlan, edits: PlanEdits): PlanValues {
  return overlay<PlanValues>({ monthly: plan.monthly, setup: plan.setup }, edits);
}

/** True when anything differs from the server (an emptied field counts, so Save can say what is wrong). */
export function isPlanDirty(plan: PricingPlan, values: PlanValues): boolean {
  return values.monthly !== plan.monthly || values.setup !== plan.setup;
}

export function planErrors(values: PlanValues): PlanErrors {
  const errors: PlanErrors = {};
  if (values.monthly === null || values.monthly < 0) errors.monthly = AMOUNT_REQUIRED;
  if (values.setup === null || values.setup < 0) errors.setup = AMOUNT_REQUIRED;
  return errors;
}

/** PATCH /pricing/plans/:id body: only the amounts that changed, in cents. */
export function planPatch(plan: PricingPlan, values: PlanValues): PlanPatch {
  const patch: PlanPatch = {};
  if (values.monthly !== null && values.monthly !== plan.monthly) patch.monthly = values.monthly;
  if (values.setup !== null && values.setup !== plan.setup) patch.setup = values.setup;
  return patch;
}

/* ---------- products ---------- */

export type ProductValues = {
  amount: number | null;
  compareAt: number | null;
  monthly: number | null;
  trialDays: number | null;
  active: boolean;
};
export type ProductEdits = Partial<ProductValues>;
export type ProductErrors = Errors<keyof ProductValues>;

export function productValues(product: PricingProduct, edits: ProductEdits): ProductValues {
  return overlay<ProductValues>(
    {
      amount: product.amount,
      compareAt: product.compareAt,
      monthly: product.monthly,
      trialDays: product.trialDays,
      active: product.active,
    },
    edits,
  );
}

export function isProductDirty(product: PricingProduct, values: ProductValues): boolean {
  return (
    values.amount !== product.amount ||
    values.compareAt !== product.compareAt ||
    values.monthly !== product.monthly ||
    values.trialDays !== product.trialDays ||
    values.active !== product.active
  );
}

export function productErrors(values: ProductValues): ProductErrors {
  const errors: ProductErrors = {};
  if (values.amount === null || values.amount < 0) errors.amount = AMOUNT_REQUIRED;
  if (values.monthly === null || values.monthly < 0) errors.monthly = AMOUNT_REQUIRED;
  if (values.trialDays === null || values.trialDays < TRIAL_DAYS_MIN || values.trialDays > TRIAL_DAYS_MAX) {
    errors.trialDays = TRIAL_DAYS_ERROR;
  }
  // A struck-through price at or below the fee reads as a mistake (the server refuses it too).
  if (values.compareAt !== null && values.amount !== null && values.compareAt <= values.amount) {
    errors.compareAt = COMPARE_AT_ERROR;
  }
  return errors;
}

/** PATCH /pricing/products/:id body: only what changed; an emptied compare-at sends null (removes it). */
export function productPatch(product: PricingProduct, values: ProductValues): ProductPatch {
  const patch: ProductPatch = {};
  if (values.amount !== null && values.amount !== product.amount) patch.amount = values.amount;
  if (values.compareAt !== product.compareAt) patch.compareAt = values.compareAt;
  if (values.monthly !== null && values.monthly !== product.monthly) patch.monthly = values.monthly;
  if (values.trialDays !== null && values.trialDays !== product.trialDays) patch.trialDays = values.trialDays;
  if (values.active !== product.active) patch.active = values.active;
  return patch;
}

export const hasErrors = (errors: object) => Object.keys(errors).length > 0;

/* ---------- cache ---------- */

export function withPlan(pricing: Pricing, plan: PricingPlan): Pricing {
  return { ...pricing, plans: pricing.plans.map((p) => (p.id === plan.id ? plan : p)) };
}

export function withProduct(pricing: Pricing, product: PricingProduct): Pricing {
  return { ...pricing, products: pricing.products.map((p) => (p.id === product.id ? product : p)) };
}

export function withSalesTax(pricing: Pricing, salesTax: SalesTax): Pricing {
  return { ...pricing, salesTax };
}
