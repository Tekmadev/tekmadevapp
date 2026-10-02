import { metaFixture } from '@/api/mock/fixtures/pricing';
import type { PricingPlan, PricingProduct, SalesTax } from '@/api/schemas/pricing';

import {
  AMOUNT_REQUIRED,
  COMPARE_AT_ERROR,
  isPlanDirty,
  isProductDirty,
  planErrors,
  planPatch,
  planStripeBadge,
  planValues,
  productBadge,
  productErrors,
  productPatch,
  productValues,
  pruneEdits,
  SAVED_SITE_ONLY,
  SAVED_SYNCED,
  saveNotice,
  sortPlans,
  taxBadge,
  taxConfirmCopy,
  taxModes,
  TRIAL_DAYS_ERROR,
} from '../logic';

const plan = (patch: Partial<PricingPlan> = {}): PricingPlan => ({
  id: 'grow',
  name: 'Grow',
  monthly: 99_700,
  setup: 250_000,
  currency: 'CAD',
  inStripe: true,
  sort: 2,
  ...patch,
});

const product = (patch: Partial<PricingProduct> = {}): PricingProduct => ({
  id: 'webline',
  name: 'Webline',
  tagline: null,
  status: 'selling',
  amount: 99_700,
  compareAt: 149_700,
  monthly: 4_900,
  currency: 'CAD',
  trialDays: 30,
  active: true,
  inStripe: true,
  ...patch,
});

describe('labels', () => {
  it('badges sales tax from meta, with the brief as the fallback', () => {
    expect(taxBadge(metaFixture, 'on_not_charging')).toEqual({ label: 'On, not charging', tone: 'warn' });
    expect(taxBadge(undefined, 'charging')).toEqual({ label: 'Charging', tone: 'ok' });
    expect(taxBadge(undefined, 'off')).toEqual({ label: 'Off', tone: 'muted' });
  });
  it('says whether Stripe can sell a plan', () => {
    expect(planStripeBadge({ inStripe: true })).toEqual({ label: 'Live in Stripe', tone: 'ok' });
    expect(planStripeBadge({ inStripe: false })).toEqual({ label: 'Not yet in Stripe', tone: 'signal' });
  });
  it('badges the product status', () => {
    expect(productBadge(metaFixture, 'paused').label).toBe('Paused');
    expect(productBadge(undefined, 'not_in_stripe')).toEqual({ label: 'Not yet in Stripe', tone: 'signal' });
  });
  it('shows Test mode only when the sandbox is configured', () => {
    const status = { state: 'off', explanation: '', readiness: '' } as const;
    const tax: SalesTax = { setting: { live: true, test: false }, live: status, test: null };
    expect(taxModes(tax)).toEqual(['live']);
    expect(taxModes({ ...tax, test: status })).toEqual(['live', 'test']);
  });
});

describe('sortPlans', () => {
  it('puts the cheapest monthly first', () => {
    const plans = [plan({ id: 'lets-talk', monthly: 199_700, sort: 3 }), plan({ id: 'convert', monthly: 49_700, sort: 1 }), plan()];
    expect(sortPlans(plans).map((p) => p.id)).toEqual(['convert', 'grow', 'lets-talk']);
  });
});

describe('plan edits', () => {
  it('follows the server until a field is edited', () => {
    expect(planValues(plan(), {})).toEqual({ monthly: 99_700, setup: 250_000 });
    expect(planValues(plan(), { monthly: 89_700 })).toEqual({ monthly: 89_700, setup: 250_000 });
  });
  it('is dirty only when something differs, and patches only that', () => {
    const p = plan();
    expect(isPlanDirty(p, planValues(p, { monthly: 99_700 }))).toBe(false);
    expect(isPlanDirty(p, planValues(p, { setup: 260_000 }))).toBe(true);
    expect(planPatch(p, planValues(p, { setup: 260_000 }))).toEqual({ setup: 260_000 });
  });
  it('asks for an amount when a field is emptied', () => {
    const p = plan();
    const values = planValues(p, { monthly: null });
    expect(isPlanDirty(p, values)).toBe(true);
    expect(planErrors(values)).toEqual({ monthly: AMOUNT_REQUIRED });
    expect(planPatch(p, values)).toEqual({});
  });
});

describe('product edits', () => {
  it('patches only what changed; an emptied compare-at sends null', () => {
    const p = product();
    const values = productValues(p, { compareAt: null, active: false });
    expect(isProductDirty(p, values)).toBe(true);
    expect(productPatch(p, values)).toEqual({ compareAt: null, active: false });
    expect(isProductDirty(p, productValues(p, { trialDays: 30 }))).toBe(false);
  });
  it('checks the first charge delay and the compare-at price', () => {
    const p = product();
    expect(productErrors(productValues(p, { trialDays: 0 })).trialDays).toBe(TRIAL_DAYS_ERROR);
    expect(productErrors(productValues(p, { trialDays: 366 })).trialDays).toBe(TRIAL_DAYS_ERROR);
    expect(productErrors(productValues(p, { compareAt: 99_700 })).compareAt).toBe(COMPARE_AT_ERROR);
    expect(productErrors(productValues(p, { amount: 150_000 })).compareAt).toBe(COMPARE_AT_ERROR);
    expect(productErrors(productValues(p, { compareAt: null, amount: 150_000 }))).toEqual({});
    expect(productErrors(productValues(p, { monthly: null })).monthly).toBe(AMOUNT_REQUIRED);
  });
});

describe('after a save', () => {
  it('drops edits that now match the server and keeps the ones that did not save', () => {
    // A partial Stripe failure: the setup fee saved, the monthly fee did not.
    const edits = { monthly: 99_999, setup: 260_000 };
    expect(pruneEdits(edits, { monthly: 99_700, setup: 260_000 })).toEqual({ monthly: 99_999 });
  });
  it('returns the same edits when nothing matches, so a refetch with no news changes nothing', () => {
    const edits = { monthly: 1 };
    expect(pruneEdits(edits, { monthly: 2, setup: 3 })).toBe(edits);
  });
  it('only claims Stripe when Stripe took the change', () => {
    expect(saveNotice('synced')).toEqual({ tone: 'ok', message: SAVED_SYNCED });
    expect(saveNotice('skipped')).toEqual({ tone: 'ok', message: SAVED_SITE_ONLY });
    expect(saveNotice('failed').tone).toBe('err');
  });
});

describe('taxConfirmCopy', () => {
  it('says what changes for buyers', () => {
    expect(taxConfirmCopy('live', true)).toMatchObject({ title: 'Turn on sales tax for live?', done: 'Sales tax is on for live checkout.' });
    expect(taxConfirmCopy('test', false)).toMatchObject({ confirmLabel: 'Hold to turn off tax', done: 'Sales tax is off for test mode.' });
  });
});
