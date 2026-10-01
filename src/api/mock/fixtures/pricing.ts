import type {
  PricingMeta,
  PricingPlan,
  PricingProduct,
  PricingProductStatus,
  SalesTax,
  TaxMode,
  TaxStatus,
} from '../../schemas/pricing';

/**
 * Fixtures for the "pricing" domain. Realistic CAD prices, same shapes as the
 * live API. This is mutable in-memory state: PATCH and PUT routes change it, and
 * the coupons routes read it (no Stripe products means no coupons).
 */

/** Saving this exact amount ($999.99) makes the fake Stripe refuse that price (code `stripe`). */
export const STRIPE_FAIL_CENTS = 99_999;

export const pricingState = {
  /** Stripe keys present on the server. Off: coupons answer `nostripe`, tax answers `not_configured`. */
  stripeConfigured: true,
  /** The Stripe sandbox is configured (shows the Test mode tax switch). */
  sandboxConfigured: true,
  /** Stripe Tax has a registration in that account (Ontario HST in live; none in the sandbox yet). */
  stripeTaxReady: { live: true, test: false } as Record<TaxMode, boolean>,
  /** The owner's switches. */
  taxSetting: { live: true, test: true } as Record<TaxMode, boolean>,
  plans: [
    { id: 'convert', name: 'Convert', monthly: 49_700, setup: 150_000, currency: 'CAD', inStripe: true, sort: 1 },
    { id: 'grow', name: 'Grow', monthly: 99_700, setup: 250_000, currency: 'CAD', inStripe: true, sort: 2 },
    // Sold on a call today, so it has never been saved to Stripe.
    { id: 'lets-talk', name: "Let's Talk", monthly: 199_700, setup: 450_000, currency: 'CAD', inStripe: false, sort: 3 },
  ] as PricingPlan[],
  products: [
    {
      id: 'webline',
      name: 'Webline',
      tagline: 'A startup website that turns visitors into booked calls, kept fast and fixed by Webline Care.',
      status: 'selling',
      amount: 99_700,
      compareAt: 149_700,
      monthly: 4_900,
      currency: 'CAD',
      trialDays: 30,
      active: true,
      inStripe: true,
    },
  ] as PricingProduct[],
};

/** What the product badge says, from Purchasable and Stripe (the server computes this). */
export function productStatus(product: Pick<PricingProduct, 'active' | 'inStripe'>): PricingProductStatus {
  if (!product.active) return 'paused';
  return product.inStripe ? 'selling' : 'not_in_stripe';
}

/** Cheapest monthly first, like the server's `sort`. */
export function resortPlans() {
  pricingState.plans.sort((a, b) => a.monthly - b.monthly || a.setup - b.setup);
  pricingState.plans.forEach((plan, index) => {
    plan.sort = index + 1;
  });
}

const READINESS: Record<TaxMode, Record<'ready' | 'notReady', string>> = {
  live: {
    ready: 'Stripe Tax is ready: registered for HST in Ontario.',
    notReady: 'Stripe Tax has no registration in the live account yet.',
  },
  test: {
    ready: 'Stripe Tax is ready in the sandbox.',
    notReady: 'Stripe Tax has no registration in the sandbox yet.',
  },
};

function taxStatus(mode: TaxMode): TaxStatus {
  const ready = pricingState.stripeTaxReady[mode];
  const readiness = READINESS[mode][ready ? 'ready' : 'notReady'];
  if (!pricingState.taxSetting[mode]) {
    return { state: 'off', explanation: 'Checkout adds no sales tax. Buyers pay the price as shown.', readiness };
  }
  if (ready) {
    return {
      state: 'charging',
      explanation: "Checkout adds HST or GST for the buyer's province on top of the price.",
      readiness,
    };
  }
  return {
    state: 'on_not_charging',
    explanation: 'Tax is switched on, but Stripe Tax has no registration, so checkout adds nothing yet. Add the registration in Stripe to start charging.',
    readiness,
  };
}

/** The `salesTax` block of GET /pricing, computed from the switches and Stripe Tax readiness. */
export function salesTaxSnapshot(): SalesTax {
  return {
    setting: { ...pricingState.taxSetting },
    live: taxStatus('live'),
    test: pricingState.sandboxConfigured ? taxStatus('test') : null,
  };
}

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture: PricingMeta = {
  salesTaxStates: [
    { value: 'charging', label: 'Charging', tone: 'ok' },
    { value: 'on_not_charging', label: 'On, not charging', tone: 'warn' },
    { value: 'off', label: 'Off', tone: 'muted' },
  ],
  pricingProductStatuses: [
    { value: 'selling', label: 'Selling', tone: 'ok' },
    { value: 'paused', label: 'Paused', tone: 'warn' },
    { value: 'not_in_stripe', label: 'Not yet in Stripe', tone: 'signal' },
  ],
};
