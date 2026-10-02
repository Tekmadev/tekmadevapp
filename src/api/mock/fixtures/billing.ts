import type {
  BillingMeta,
  BillingSummary,
  Cancellation,
  Order,
  OrderStatus,
  PaymentMethod,
  Subscription,
  SubscriptionStatus,
} from '../../schemas/billing';
import { byNewest, daysAgo, daysFromNow, hoursAgo, minutesAgo } from '../router';
import { SEED_CLIENTS, type SeedClient } from './seed';

/**
 * Fixtures for the "billing" domain (Subscriptions screen). Live mode only: the
 * test client (cl_testco_0001) and every test purchase stay out of these lists.
 *
 * Rows line up with the clients fixture's billing block (GET /clients/:id):
 * same client ids, emails and prices, the same id scheme (`sub_<x>`,
 * `sub_care_<x>`, `ord_<x>` where cl_<x> is the client id), the same plan
 * statuses (Kanata paused, Westdale cancelled, Barrhaven ending, Waterdown's
 * checkout pending) and the same "lighter accounts" list the clients fixture
 * pages with. Every client's order is the one its bundle shows as the latest
 * order: paid by card (the bundle shows the card brand), or pending for Waterdown.
 *
 * The rest of Stripe's variety (instalments, Link, refunds, a dispute) sits on
 * checkouts with no client in the list: ones that never became a client
 * (failed, abandoned, a 3D Secure step) and ones whose client was since moved
 * to the trash.
 */

/* ---------- prices (cents), as the clients fixture and the pricing page have them ---------- */

type PlanId = 'convert' | 'grow' | 'lets-talk';
const MONTHLY: Record<PlanId, number> = { convert: 149_700, grow: 249_700, 'lets-talk': 395_000 };
const SETUP: Record<PlanId, number> = { convert: 149_700, grow: 249_700, 'lets-talk': 450_000 };
const WEBLINE = 99_700;
/** Webline Care: $77.50 a month (cents matter). */
const CARE = 7_750;
const PLAN_NAMES: Record<PlanId, string> = { convert: 'Convert', grow: 'Grow', 'lets-talk': "Let's Talk" };

const cad = (amount: number) => ({ amount, currency: 'CAD' });
const suffix = (clientId: string) => clientId.slice(3);
const isPlan = (planId: string | null): planId is PlanId => planId === 'convert' || planId === 'grow' || planId === 'lets-talk';

/** Stripe-looking customer id, stable per client or email. */
function customerId(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 14; i++) {
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    out += alphabet[h % alphabet.length];
  }
  return `cus_${out}`;
}

const CANCELLATION = {
  soldPractice: { reason: 'Cancelled by the customer', feedback: 'Switched to another service', comment: 'We sold the practice. The new owners have their own marketing.' },
  cashFlow: { reason: 'Cancelled by the customer', feedback: 'Too expensive', comment: 'Cash flow is tight until spring. We might come back after the busy season.' },
  unused: { reason: 'Cancelled by the customer', feedback: 'Not using it enough', comment: null },
  localAgency: { reason: 'Cancelled by the customer', feedback: 'Switched to another service', comment: 'Going with a local agency in Orleans.' },
  paymentFailed: { reason: 'Payment failed', feedback: null, comment: null },
} as const satisfies Record<string, Cancellation>;

/* ---------- builders ---------- */

type Party = { clientId: string | null; business: string | null; email: string };
const party = (c: { id: string; businessName: string; email: string }): Party => ({ clientId: c.id, business: c.businessName, email: c.email });

type SubOptions = {
  status?: SubscriptionStatus;
  /** Days from now to the end of the current period (negative: already over). */
  periodEndsInDays: number;
  cancelAtPeriodEnd?: boolean;
  cancellation?: Cancellation;
  canceledDaysAgo?: number;
};

function planSubscription(p: Party, planId: PlanId, ageDays: number, o: SubOptions): Subscription {
  const key = p.clientId ? suffix(p.clientId) : p.email;
  return {
    id: `sub_${key}`,
    ...p,
    kind: 'plan',
    planId,
    productName: PLAN_NAMES[planId],
    status: o.status ?? 'active',
    cancelAtPeriodEnd: o.cancelAtPeriodEnd ?? false,
    currentPeriodEnd: daysFromNow(o.periodEndsInDays),
    amount: cad(MONTHLY[planId]),
    interval: 'month',
    customerId: customerId(p.clientId ?? p.email),
    createdAt: daysAgo(ageDays, 4.1),
    canceledAt: o.canceledDaysAgo === undefined ? null : daysAgo(o.canceledDaysAgo, 3),
    cancellation: o.cancellation ? { ...o.cancellation } : null,
  };
}

function careSubscription(p: Party, ageDays: number, o: SubOptions): Subscription {
  const key = p.clientId ? suffix(p.clientId) : p.email;
  return {
    id: `sub_care_${key}`,
    ...p,
    kind: 'care',
    planId: null,
    productName: 'Webline Care',
    status: o.status ?? 'active',
    cancelAtPeriodEnd: o.cancelAtPeriodEnd ?? false,
    currentPeriodEnd: daysFromNow(o.periodEndsInDays),
    amount: cad(CARE),
    interval: 'month',
    customerId: customerId(p.clientId ?? p.email),
    createdAt: daysAgo(Math.max(ageDays - 1, 0), 2),
    canceledAt: o.canceledDaysAgo === undefined ? null : daysAgo(o.canceledDaysAgo, 3),
    cancellation: o.cancellation ? { ...o.cancellation } : null,
  };
}

const BNPL: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>(['klarna', 'afterpay', 'affirm']);

type OrderOptions = {
  id?: string;
  status?: OrderStatus;
  paidWith?: PaymentMethod | null;
  refundedCents?: number;
  source?: string | null;
  campaign?: string | null;
  /** Override the creation time (an instant). */
  at?: string;
};

function order(p: Party, product: string, amountCents: number, ageDays: number, o: OrderOptions = {}): Order {
  const status = o.status ?? 'paid';
  const paidWith = o.paidWith === undefined ? 'card' : o.paidWith;
  const createdAt = o.at ?? daysAgo(ageDays, 4.2);
  const wentThrough = status === 'paid' || status === 'refunded' || status === 'partially_refunded' || status === 'disputed';
  return {
    id: o.id ?? `ord_${p.clientId ? suffix(p.clientId) : p.email.replace(/[^a-z0-9]/gi, '').slice(0, 14)}`,
    ...p,
    product,
    status,
    amount: cad(amountCents),
    amountRefunded: status === 'refunded' ? cad(amountCents) : status === 'partially_refunded' ? cad(o.refundedCents ?? 0) : null,
    paidWith: status === 'pending' ? null : paidWith,
    bnpl: paidWith !== null && BNPL.has(paidWith),
    source: o.source ?? null,
    campaign: o.campaign ?? null,
    createdAt,
    paidAt: wentThrough ? (o.at ?? daysAgo(ageDays, 4)) : null,
  };
}

const setupProduct = (planId: PlanId) => `Build & Install: ${PLAN_NAMES[planId]}`;

/* ---------- the seeded clients (seed.ts), as the clients fixture bills them ---------- */

const SEED_BILLING: Record<string, { periodEndsInDays: number; status?: SubscriptionStatus; cancelAtPeriodEnd?: boolean; cancellation?: Cancellation; canceledDaysAgo?: number; source?: string; campaign?: string }> = {
  cl_acmeplumb01: { periodEndsInDays: 11, source: 'facebook', campaign: 'growth-ottawa-home-services' },
  cl_harbourhvac: { periodEndsInDays: 4, source: 'google' },
  cl_bytownroof: { periodEndsInDays: 21, source: 'facebook', campaign: 'growth-ottawa-home-services' },
  cl_escarpdent: { periodEndsInDays: 9 },
  cl_rideaulawn: { periodEndsInDays: 27 },
  cl_steeltownph: { periodEndsInDays: 0, source: 'facebook', campaign: 'webline-hamilton-trades' },
  cl_glebelaw: { periodEndsInDays: 6, source: 'linkedin' },
  cl_dundaselec: { periodEndsInDays: 28, source: 'flyer', campaign: 'home-show-2026' },
  cl_kanatapest: { periodEndsInDays: 150, status: 'paused' },
  cl_lakeshorecl: { periodEndsInDays: 19, source: 'instagram', campaign: 'retargeting-30d' },
  cl_byward_cafe: { periodEndsInDays: 17, source: 'facebook', campaign: 'tool-missed-call' },
  cl_ancastermov: { periodEndsInDays: 14 },
  cl_westdalevet: { periodEndsInDays: -30, status: 'canceled', cancellation: CANCELLATION.soldPractice, canceledDaysAgo: 31 },
  cl_barrhavenhm: { periodEndsInDays: 21, cancelAtPeriodEnd: true, cancellation: CANCELLATION.cashFlow, source: 'google' },
  cl_nepeanortho: { periodEndsInDays: 16, source: 'linkedin', campaign: 'founder-posts' },
};

function seedRows(): { subscriptions: Subscription[]; orders: Order[] } {
  const subscriptions: Subscription[] = [];
  const orders: Order[] = [];
  for (const c of SEED_CLIENTS) {
    if (c.isTest) continue;
    const p = party(c);
    if (c.id === 'cl_waterdown_d') {
      // A lead (no plan yet) whose Grow checkout was started and never paid.
      orders.push(order(p, setupProduct('grow'), SETUP.grow, 4, { id: 'ord_waterdown_d', status: 'pending', at: daysAgo(4, 1) }));
      continue;
    }
    if (!c.planId) continue;
    const b = SEED_BILLING[c.id];
    if (!b) continue;
    const o = { source: b.source ?? null, campaign: b.campaign ?? null };
    if (c.planId === 'webline') {
      orders.push(order(p, 'Webline', WEBLINE, c.ageDays, o));
      // Steeltown is still onboarding: its care plan starts at go-live.
      if (c.status !== 'onboarding') subscriptions.push(careSubscription(p, c.ageDays, b));
    } else if (isPlan(c.planId)) {
      orders.push(order(p, setupProduct(c.planId), SETUP[c.planId], c.ageDays, o));
      subscriptions.push(planSubscription(p, c.planId, c.ageDays, b));
    }
  }
  return { subscriptions, orders };
}

/* ---------- the lighter accounts the clients fixture pages with (same ids and emails) ---------- */

type Extra = [id: string, name: string, contact: string, planId: PlanId | 'webline', status: SeedClient['status'], ageDays: number];

const EXTRAS: Extra[] = [
  ['cl_grimsbydoor', 'Grimsby Garage Doors', 'Alan Petrie', 'convert', 'live', 140],
  ['cl_kingstonwin', 'Kingston Window Cleaning', 'Meera Shah', 'webline', 'live', 120],
  ['cl_stoneychiro', 'Stoney Creek Chiropractic', 'Dr. Paul Novak', 'convert', 'live', 200],
  ['cl_burlbooks', 'Burlington Bookkeeping Co.', 'Linda Chau', 'webline', 'live', 90],
  ['cl_carpseptic', 'Carp Valley Septic', 'Rob McIntyre', 'convert', 'live', 160],
  ['cl_orilliainsp', 'Orillia Home Inspections', 'Dana Whitfield', 'webline', 'live', 75],
  ['cl_guelphtree', 'Guelph Tree Care', 'Ian Forsyth', 'grow', 'live', 150],
  ['cl_brantappl', 'Brantford Appliance Repair', 'Victor Silva', 'convert', 'live', 110],
  ['cl_miltonmass', 'Milton Massage Therapy', 'Rachel Kim', 'webline', 'live', 66],
  ['cl_oakvillepool', 'Oakville Pool & Spa', 'Greg Sutherland', 'lets-talk', 'live', 230],
  ['cl_kemptfence', 'Kemptville Fencing', 'Shane Doyle', 'convert', 'live', 100],
  ['cl_peterlock', 'Peterborough Locksmiths', 'Ana Costa', 'webline', 'live', 58],
  ['cl_arnpriorsno', 'Arnprior Snow & Lawn', 'Kurt Hoffman', 'convert', 'paused', 180],
  ['cl_mountdent', 'Hamilton Mountain Dentistry', 'Dr. Sana Ali', 'convert', 'live', 260],
  ['cl_manotickpav', 'Manotick Paving', 'Frank Russo', 'convert', 'live', 130],
  ['cl_cambfloor', 'Cambridge Flooring Studio', 'Joanne Burke', 'webline', 'onboarding', 12],
  ['cl_smithsplumb', 'Smiths Falls Plumbing & Heating', 'Wayne Gallant', 'grow', 'live', 170],
  ['cl_niagarawash', 'St. Catharines & Niagara Region Commercial Window Cleaning and Pressure Washing Ltd.', 'Marco DiNardo', 'convert', 'live', 95],
  ['cl_stittsfoam', 'Stittsville Spray Foam', 'Becky Laurin', 'convert', 'onboarding', 20],
  ['cl_bellbasement', 'Belleville Basement Waterproofing', 'Doug Tate', 'convert', 'churned', 300],
  ['cl_waterlootut', 'Waterloo Tutoring Centre', 'Priyanka Bose', 'webline', 'churned', 240],
  ['cl_barriejunk', 'Barrie Junk Removal', 'Tyler Grant', 'convert', 'live', 80],
  ['cl_perthcab', 'Perth Custom Cabinets', 'Helen Wright', 'webline', 'live', 45],
  ['cl_gloucgarage', 'Gloucester Garage Builders', 'Mike Bergeron', 'convert', 'churned', 330],
];

/**
 * Attribution and how some of them ended. Their orders stay paid by card, as the
 * clients fixture's billing block has them (it bills every client by card).
 */
const EXTRA_DETAILS: Record<string, { cancellation?: Cancellation; source?: string; campaign?: string }> = {
  cl_kingstonwin: { source: 'facebook', campaign: 'webline-fall-bnpl' },
  cl_orilliainsp: { source: 'facebook', campaign: 'webline-hamilton-trades' },
  cl_miltonmass: { source: 'instagram', campaign: 'retargeting-30d' },
  cl_peterlock: { source: 'google' },
  cl_perthcab: { source: 'facebook', campaign: 'webline-hamilton-trades' },
  cl_cambfloor: { source: 'newsletter', campaign: 'sept-roundup' },
  cl_burlbooks: { source: 'google' },
  cl_waterlootut: { cancellation: CANCELLATION.paymentFailed },
  cl_bellbasement: { cancellation: CANCELLATION.unused },
  cl_gloucgarage: { cancellation: CANCELLATION.localAgency },
  cl_arnpriorsno: { source: 'google' },
};

function extraRows(): { subscriptions: Subscription[]; orders: Order[] } {
  const subscriptions: Subscription[] = [];
  const orders: Order[] = [];
  EXTRAS.forEach(([id, businessName, contact, planId, status, ageDays], i) => {
    // Same email rule as the clients fixture: first name at the id's domain.
    const domain = id.slice(3).replace(/_/g, '');
    const first = contact.replace(/^Dr\. /, '').split(' ')[0].toLowerCase();
    const p = party({ id, businessName, email: `${first}@${domain}.test` });
    const d = EXTRA_DETAILS[id] ?? {};
    const o = { source: d.source ?? null, campaign: d.campaign ?? null };
    const churned = status === 'churned';
    if (planId === 'webline') {
      orders.push(order(p, 'Webline', WEBLINE, ageDays, o));
      if (status === 'onboarding') return;
      subscriptions.push(
        careSubscription(p, ageDays, churned ? { status: 'canceled', periodEndsInDays: -40, cancellation: d.cancellation, canceledDaysAgo: 41 } : { periodEndsInDays: 3 + (i % 25) }),
      );
    } else {
      orders.push(order(p, setupProduct(planId), SETUP[planId], ageDays, o));
      const subStatus: SubscriptionStatus = churned ? 'canceled' : status === 'paused' ? 'paused' : id === 'cl_barriejunk' ? 'past_due' : 'active';
      subscriptions.push(
        planSubscription(p, planId, ageDays, {
          status: subStatus,
          periodEndsInDays: churned ? -20 : 2 + (i % 27),
          cancellation: churned ? d.cancellation : undefined,
          canceledDaysAgo: churned ? 21 : undefined,
        }),
      );
    }
  });
  return { subscriptions, orders };
}

/* ---------- checkouts that never became a client ---------- */

function strayRows(): { subscriptions: Subscription[]; orders: Order[] } {
  const orders: Order[] = [
    // Klarna declined the instalment plan; nobody tried again yet.
    order({ clientId: null, business: null, email: 'jen.morrow@mailbox.test' }, 'Webline', WEBLINE, 0, { id: 'ord_f3k9q2', status: 'failed', paidWith: 'klarna', at: hoursAgo(3), source: 'facebook', campaign: 'webline-hamilton-trades' }),
    // Checkout opened from a deal link and abandoned.
    order({ clientId: null, business: 'Hess Village Barbers', email: 'tony@hessbarbers.test' }, 'Webline', WEBLINE, 0, { id: 'ord_p7m2x8', status: 'pending', at: minutesAgo(52), source: 'deal-link', campaign: 'barber-week' }),
    // Link declined the saved card (expired); they never came back.
    order({ clientId: null, business: 'Vanier Vacuum Repair', email: 'paul@vaniervac.test' }, 'Webline', WEBLINE, 6, { id: 'ord_l5v2c7', status: 'failed', paidWith: 'link', source: 'google' }),
    order({ clientId: null, business: null, email: 'owner@kanatakidsdental.test' }, setupProduct('convert'), SETUP.convert, 12, { id: 'ord_c4t1r6', status: 'failed', paidWith: 'card' }),
    order({ clientId: null, business: 'Glebe Bike Repair', email: 'sam@glebebikes.test' }, 'Webline', WEBLINE, 27, { id: 'ord_a9b3v5', status: 'failed', paidWith: 'afterpay', source: 'google' }),
    // Cancelled before the build started: everything but the $150 discovery work went back. The client record went to the trash.
    order({ clientId: null, business: 'Westboro Yoga Studio', email: 'maya@westboroyoga.test' }, 'Webline', WEBLINE, 38, { id: 'ord_y8q4w3', status: 'partially_refunded', paidWith: 'affirm', refundedCents: WEBLINE - 15_000, source: 'instagram', campaign: 'retargeting-30d' }),
    // Refunded inside the first two weeks; the client record went to the trash.
    order({ clientId: null, business: 'Hamel Handyman', email: 'rick.hamel@mailbox.test' }, 'Webline', WEBLINE, 61, { id: 'ord_z2w8n1', status: 'refunded', paidWith: 'klarna', source: 'google' }),
    // The bank opened a dispute after the kickoff call went unanswered; the client record went to the trash.
    order({ clientId: null, business: 'Dunrobin Decks', email: 'chris@dunrobindecks.test' }, setupProduct('convert'), SETUP.convert, 47, { id: 'ord_d3k7r2', status: 'disputed', source: 'facebook', campaign: 'growth-ottawa-home-services' }),
  ];
  const subscriptions: Subscription[] = [
    // First Grow invoice waiting on a 3D Secure step: the client appears once it is paid.
    planSubscription({ clientId: null, business: 'Fenwick Fruit Farm', email: 'anna@fenwickfruit.test' }, 'grow', 0, { status: 'incomplete', periodEndsInDays: 30 }),
  ];
  // A Webline Care trial that a past buyer restarted after moving their site back.
  subscriptions.push(careSubscription({ clientId: null, business: 'Riverside Books', email: 'jen@riversidebooks.test' }, 6, { status: 'trialing', periodEndsInDays: 8 }));
  return { subscriptions, orders };
}

/* ---------- the tables ---------- */

const seeded = seedRows();
const extras = extraRows();
const strays = strayRows();

/** Subscriptions (mutable in-memory state), newest first. */
export const subscriptionsDb: Subscription[] = [...seeded.subscriptions, ...extras.subscriptions, ...strays.subscriptions].sort(byNewest((s) => s.createdAt));

/** One-time orders (mutable in-memory state), newest first. */
export const ordersDb: Order[] = [...seeded.orders, ...extras.orders, ...strays.orders].sort(byNewest((o) => o.createdAt));

/** Totals for the subtitle, over every live row (filters never change them). */
export function billingSummary(): BillingSummary {
  const wentThrough = (o: Order) => o.status !== 'pending' && o.status !== 'failed';
  return {
    subscriptions: subscriptionsDb.length,
    orders: ordersDb.length,
    bnpl: ordersDb.filter((o) => o.bnpl && wentThrough(o)).length,
  };
}

/** Home "Active subs" (live mode, care plans included). */
export const activeSubscriptionCount = () => subscriptionsDb.filter((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due').length;

/** Home "Recent subscriptions" reads 8. */
export const recentSubscriptions = (count: number) => subscriptionsDb.slice(0, count);

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture: BillingMeta = {
  billingOrderStatuses: [
    { value: 'pending', label: 'Pending', tone: 'neutral' },
    { value: 'paid', label: 'Paid', tone: 'ok' },
    { value: 'failed', label: 'Failed', tone: 'signal' },
    { value: 'refunded', label: 'Refunded', tone: 'muted' },
    { value: 'partially_refunded', label: 'Partially refunded', tone: 'warn' },
    { value: 'disputed', label: 'Disputed', tone: 'signal' },
  ],
  billingSubscriptionStatuses: [
    { value: 'active', label: 'Active', tone: 'ok' },
    { value: 'trialing', label: 'Trialing', tone: 'gold' },
    { value: 'past_due', label: 'Past due', tone: 'warn' },
    { value: 'unpaid', label: 'Unpaid', tone: 'signal' },
    { value: 'incomplete', label: 'Incomplete', tone: 'warn' },
    { value: 'incomplete_expired', label: 'Expired', tone: 'muted' },
    { value: 'paused', label: 'Paused', tone: 'muted' },
    { value: 'canceled', label: 'Cancelled', tone: 'muted' },
  ],
  billingSubscriptionKinds: [
    { value: 'plan', label: 'Growth plans' },
    { value: 'care', label: 'Webline Care' },
  ],
  billingPaymentMethods: [
    { value: 'card', label: 'Card', bnpl: false },
    { value: 'klarna', label: 'Klarna', bnpl: true },
    { value: 'afterpay', label: 'Afterpay', bnpl: true },
    { value: 'affirm', label: 'Affirm', bnpl: true },
    { value: 'link', label: 'Link', bnpl: false },
  ],
};
