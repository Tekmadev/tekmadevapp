import { formatCents } from '@/lib/money';

import type {
  NotificationItem,
  NotificationCategory,
  NotificationPref,
  NotificationSeverity,
  NotificationsMeta,
  NotificationSummary,
} from '../../schemas/notifications';
import { NOTIFICATION_CATEGORIES, OWNER_ONLY_CATEGORIES } from '../../schemas/notifications';
import type { Role } from '../../types';
import { inboxCategories, isOwnerOnly, mockCan } from '../permissions';
import { daysAgo, daysFromNow, minutesAgo, mockId, nowIso, type MockStaff } from '../router';
import { SEED_CLIENTS, SEED_PEOPLE, type SeedClient } from './seed';

/**
 * Fixtures for the "notifications" domain: one shared staff inbox of real-world
 * events (brief 8.4), with the same rules as the server:
 *
 * - Read state and quiet categories are per user; "needs action" resolution is shared.
 * - A repeating problem bumps the same row: it moves to the top, `occurrences`
 *   goes up and it becomes unread again for everyone (read state is stored as
 *   "read up to this last_occurred_at", so a bump makes it unread by itself).
 * - Who reads a row follows the capability table (src/api/mock/permissions.ts,
 *   owner decision 2026-10-03): a row needs `inbox.<category>` (staff read
 *   Leads and Clients only; owners and managers read all seven), and test rows
 *   need `testdata.view` and, in lists, an explicit opt-in. `audience` is kept
 *   on the record as the server stores it; owners and managers both read
 *   owner-audience rows now, and those rows all sit in categories staff never read.
 *
 * Everything here is mutable in-memory state: the routes change it and later
 * reads see the change, like the real server.
 */

type EventDef = {
  label: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  needsAction: boolean;
  /** Owner-audience event (the server's `audience: 'owner'`). Reading it follows the category's capability. */
  ownerOnly?: boolean;
};

/** The event catalogue. Every row carries its `label`; GET /meta lists them all. */
export const NOTIFICATION_EVENTS = {
  'leads.booking': { label: 'New booking', category: 'leads', severity: 'success', needsAction: false },
  'leads.booking_cancelled': { label: 'Booking cancelled', category: 'leads', severity: 'warning', needsAction: false },
  'leads.form': { label: 'New lead form', category: 'leads', severity: 'info', needsAction: false },
  'leads.tool_submission': { label: 'Free tool submission', category: 'leads', severity: 'info', needsAction: false },
  'leads.portal_signup': { label: 'Portal sign-up', category: 'leads', severity: 'info', needsAction: false },
  'sales.order': { label: 'New order', category: 'sales', severity: 'success', needsAction: false },
  'sales.subscription': { label: 'New subscription', category: 'sales', severity: 'success', needsAction: false },
  'sales.coupon_redeemed': { label: 'Coupon redeemed', category: 'sales', severity: 'info', needsAction: false, ownerOnly: true },
  'billing.payment_failed': { label: 'Payment failed', category: 'billing', severity: 'critical', needsAction: true },
  'billing.payment_recovered': { label: 'Payment recovered', category: 'billing', severity: 'success', needsAction: false },
  'billing.subscription_cancelled': { label: 'Subscription cancelled', category: 'billing', severity: 'warning', needsAction: false },
  'billing.cancel_scheduled': { label: 'Cancellation scheduled', category: 'billing', severity: 'warning', needsAction: false },
  'billing.refund': { label: 'Refund issued', category: 'billing', severity: 'info', needsAction: false },
  'billing.dispute': { label: 'Payment disputed', category: 'billing', severity: 'critical', needsAction: true },
  'billing.care_missing': { label: 'Care plan missing', category: 'billing', severity: 'warning', needsAction: true },
  'clients.created': { label: 'New client', category: 'clients', severity: 'success', needsAction: false },
  'clients.onboarding_blocked': { label: 'Onboarding blocked', category: 'clients', severity: 'warning', needsAction: true },
  'clients.intake_submitted': { label: 'Intake submitted', category: 'clients', severity: 'info', needsAction: true },
  'clients.access_done': { label: 'Client says access is done', category: 'clients', severity: 'info', needsAction: true },
  'clients.access_granted': { label: 'Access granted', category: 'clients', severity: 'success', needsAction: false },
  'clients.approval_requested': { label: 'Approval requested', category: 'clients', severity: 'info', needsAction: false },
  'clients.approval_approved': { label: 'Approved', category: 'clients', severity: 'success', needsAction: false },
  'clients.changes_requested': { label: 'Changes requested', category: 'clients', severity: 'warning', needsAction: true },
  'clients.calls_to_review': { label: 'CRM appointments to review', category: 'clients', severity: 'warning', needsAction: true },
  'clients.behind_pace': { label: 'Behind pace', category: 'clients', severity: 'warning', needsAction: true },
  'clients.agreement_signed': { label: 'Agreement signed', category: 'clients', severity: 'success', needsAction: false },
  'clients.files_uploaded': { label: 'Files uploaded', category: 'clients', severity: 'info', needsAction: false },
  'clients.member_joined': { label: 'Portal member joined', category: 'clients', severity: 'info', needsAction: false },
  'clients.tasks_done': { label: 'Client finished tasks', category: 'clients', severity: 'info', needsAction: false },
  'clients.went_live': { label: 'Client went live', category: 'clients', severity: 'success', needsAction: false },
  'audience.subscribed': { label: 'New subscriber', category: 'audience', severity: 'success', needsAction: false },
  'audience.unsubscribed': { label: 'Unsubscribe', category: 'audience', severity: 'info', needsAction: false },
  'audience.bounced': { label: 'Email bounced', category: 'audience', severity: 'warning', needsAction: false },
  'audience.complained': { label: 'Marked as spam', category: 'audience', severity: 'warning', needsAction: false },
  'team.member_added': { label: 'Team member added', category: 'team', severity: 'info', needsAction: false },
  'team.member_removed': { label: 'Team member removed', category: 'team', severity: 'warning', needsAction: false },
  'system.stripe_webhook_failing': { label: 'Stripe webhook failing', category: 'system', severity: 'critical', needsAction: true, ownerOnly: true },
  'system.meta_pull_failed': { label: 'Meta pull failed', category: 'system', severity: 'critical', needsAction: false, ownerOnly: true },
  'system.meta_token_expiring': { label: 'Meta token expires soon', category: 'system', severity: 'warning', needsAction: false, ownerOnly: true },
  'system.crm_stuck': { label: 'CRM sync stuck', category: 'system', severity: 'warning', needsAction: true, ownerOnly: true },
  'system.crm_reconcile_halted': { label: 'Nightly reconcile stopped', category: 'system', severity: 'critical', needsAction: true, ownerOnly: true },
  'system.cal_webhook_failing': { label: 'Cal.com webhook failing', category: 'system', severity: 'critical', needsAction: true },
  'system.portal_email_failed': { label: 'Portal email failed', category: 'system', severity: 'warning', needsAction: false },
} satisfies Record<string, EventDef>;

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS;

const eventDef = (key: string): EventDef | undefined =>
  (NOTIFICATION_EVENTS as Record<string, EventDef>)[key];

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  leads: 'Leads',
  sales: 'Sales',
  billing: 'Billing',
  clients: 'Clients',
  audience: 'Audience',
  team: 'Team',
  system: 'System',
};

/** A stored row: the API item minus the per-user fields, plus who may see it. */
export type NotificationRecord = Omit<NotificationItem, 'is_read' | 'is_muted'> & {
  /** "owner": managers never see it. Never sent to the app. */
  audience: 'staff' | 'owner';
};

/* ------------------------------------------------------------------ */
/* Seed rows                                                           */
/* ------------------------------------------------------------------ */

const OWNER_NAME = 'Shajeed I.';
const MANAGER_NAME = 'Maya Chen';

type Spec = {
  /** Minutes ago of the last occurrence (distinct per row, so the sort is stable). */
  at: number;
  key: NotificationEventKey;
  title: string;
  body: string | null;
  url: string | null;
  /** Seed client id: sets client_id (and the entity, unless `entity` is given). */
  client?: string;
  entity?: readonly [type: string, id: string];
  actor?: readonly [type: string, label: string];
  occurrences?: number;
  resolved?: readonly [minutesAgo: number, who: string];
  test?: boolean;
  /** Unread at first sign-in for the owner ("o"), the manager ("m") or both. */
  unread?: 'o' | 'm' | 'om';
  data?: Record<string, unknown>;
};

function client(id: string): SeedClient {
  const found = SEED_CLIENTS.find((c) => c.id === id);
  if (!found) throw new Error(`notifications fixture: unknown seed client ${id}`);
  return found;
}
const person = (i: number) => SEED_PEOPLE[i % SEED_PEOPLE.length];
const money = (cents: number) => formatCents(cents);
const cad = (cents: number) => ({ amount: cents, currency: 'CAD' });
/** Deterministic ids, so fixtures look the same on every reload. */
const hexId = (prefix: string, n: number) => `${prefix}_${((n * 2654435761) % 4294967296).toString(16).padStart(8, '0')}`;
const clientUrl = (id: string, section?: string) => `/admin/clients/${id}${section ? `#${section}` : ''}`;

function bookingSpec(at: number, i: number, need: string, revenue: string, unread?: Spec['unread']): Spec {
  const p = person(i);
  return {
    at,
    key: 'leads.booking',
    title: `${p.name} booked a strategy call`,
    body: `Booked through Cal.com. Need: ${need} Revenue: ${revenue}.`,
    url: '/admin/leads',
    entity: ['lead', hexId('ld', 100 + i)],
    actor: ['lead', p.name],
    unread,
    data: { email: p.email, phone: p.phone, source: 'cal_booking', bookedFor: daysFromNow(1 + (i % 4)) },
  };
}

function formSpec(at: number, i: number, business: string, need: string, revenue: string, unread?: Spec['unread']): Spec {
  const p = person(i);
  return {
    at,
    key: 'leads.form',
    title: `${p.name} sent the lead form`,
    body: `${business}. Need: ${need} Revenue: ${revenue}.`,
    url: '/admin/leads',
    entity: ['lead', hexId('ld', 200 + i)],
    actor: ['lead', p.name],
    unread,
    data: { email: p.email, source: 'grow', business },
  };
}

function toolSpec(at: number, i: number, leakCents: number, optIn: boolean): Spec {
  const p = person(i);
  return {
    at,
    key: 'leads.tool_submission',
    title: `${p.name} used the missed-call calculator`,
    body: `Reported leak: ${money(leakCents)} a month. ${optIn ? 'Opted in to the newsletter.' : 'Did not opt in to the newsletter.'}`,
    url: '/admin/tools',
    entity: ['tool_submission', hexId('ts', 300 + i)],
    actor: ['lead', p.name],
    data: { email: p.email, tool: 'missed-call-leak', leak: cad(leakCents), newsletter: optIn },
  };
}

function audienceSpec(at: number, key: 'audience.subscribed' | 'audience.unsubscribed' | 'audience.bounced' | 'audience.complained', email: string, body: string, unread?: Spec['unread']): Spec {
  const titles = {
    'audience.subscribed': `${email} subscribed`,
    'audience.unsubscribed': `${email} unsubscribed`,
    'audience.bounced': `Email bounced: ${email}`,
    'audience.complained': `Marked as spam: ${email}`,
  } as const;
  return {
    at,
    key,
    title: titles[key],
    body,
    url: '/admin/email',
    entity: ['subscriber', hexId('sub', email.length * 31 + at)],
    actor: ['subscriber', email],
    unread,
    data: { email },
  };
}

const H = 60;
const D = 1440;

const SPECS: Spec[] = [
  // Today
  {
    at: 4,
    key: 'system.stripe_webhook_failing',
    title: 'Stripe webhook failing',
    body: 'Stripe got an error back from the site 14 times since yesterday: the signing secret does not match. Payments still go through, but orders and subscriptions stop updating here until it is fixed.',
    url: null,
    entity: ['webhook', 'stripe'],
    actor: ['integration', 'Stripe'],
    occurrences: 14,
    unread: 'o',
    data: { endpoint: 'https://www.tekmadev.com/api/stripe/webhook', lastStatus: 400, firstFailedAt: daysAgo(1, 2) },
  },
  bookingSpec(11, 0, 'More customers and booked jobs.', '$20K to $50K a month', 'om'),
  {
    at: 26,
    key: 'clients.calls_to_review',
    title: 'Harbour HVAC: 4 CRM appointments to review',
    body: '4 appointments from the CRM waiting for your review. Nothing counts toward the guarantee until you confirm it.',
    url: clientUrl('cl_harbourhvac', 'calls'),
    client: 'cl_harbourhvac',
    actor: ['system', 'CRM sync'],
    occurrences: 4,
    unread: 'om',
    data: { pending: 4 },
  },
  {
    at: 33,
    key: 'sales.order',
    title: 'Test purchase: Webline',
    body: `Sandbox Bakery (test) paid ${money(99700)} with the Stripe test card.`,
    url: '/admin/test-mode',
    client: 'cl_testco_0001',
    entity: ['order', hexId('ord', 9001)],
    actor: ['customer', 'Test Buyer'],
    test: true,
    unread: 'o',
    data: { amount: cad(99700), product: 'webline', paidWith: 'Card' },
  },
  {
    at: 36,
    key: 'clients.created',
    title: 'New client: Sandbox Bakery (test)',
    body: 'Created from a test checkout. Portal invite sent to buyer+sandbox@tekmadev.test.',
    url: clientUrl('cl_testco_0001'),
    client: 'cl_testco_0001',
    actor: ['system', 'Checkout'],
    test: true,
    unread: 'o',
  },
  {
    at: 48,
    key: 'sales.order',
    title: 'New order: Webline',
    body: `${person(10).name} (${person(10).email}) paid ${money(99700)} with Klarna.`,
    url: '/admin/subscriptions',
    entity: ['order', hexId('ord', 48)],
    actor: ['customer', person(10).name],
    unread: 'om',
    data: { amount: cad(99700), product: 'webline', paidWith: 'Klarna', email: person(10).email },
  },
  {
    at: 95,
    key: 'billing.payment_failed',
    title: 'Payment failed: Kanata Pest Control',
    body: `The ${money(149050)} monthly charge was declined (insufficient funds). Stripe tries again in 3 days.`,
    url: clientUrl('cl_kanatapest', 'account'),
    client: 'cl_kanatapest',
    entity: ['subscription', hexId('sub', 95)],
    actor: ['integration', 'Stripe'],
    occurrences: 2,
    unread: 'om',
    data: { amount: cad(149050), attempt: 2, declineCode: 'insufficient_funds', nextRetryAt: daysFromNow(3) },
  },
  {
    at: 140,
    key: 'clients.intake_submitted',
    title: 'Steeltown Physio submitted the intake',
    body: 'Version 1, all 5 sections answered. Review it to move them to kickoff.',
    url: clientUrl('cl_steeltownph', 'intake'),
    client: 'cl_steeltownph',
    entity: ['intake', hexId('in', 140)],
    actor: ['client', 'Aisha Khan'],
    unread: 'om',
    data: { version: 1 },
  },
  audienceSpec(190, 'audience.unsubscribed', person(3).email, 'Reason: Too many emails. Via the unsubscribe page.', 'o'),
  formSpec(236, 1, 'Capital Window Cleaning', 'A new or better website.', 'Under $10K a month', 'm'),
  {
    at: 302,
    key: 'clients.approval_approved',
    title: 'Bytown Roofing Co. approved the homepage design',
    body: 'Marc Lalonde approved Homepage design, v2.',
    url: clientUrl('cl_bytownroof', 'approvals'),
    client: 'cl_bytownroof',
    entity: ['approval', hexId('ap', 302)],
    actor: ['client', 'Marc Lalonde'],
    data: { version: 2 },
  },
  {
    at: 361,
    key: 'system.meta_pull_failed',
    title: 'Meta pull failed',
    body: 'Meta refused the pull: the access token expired. Generate a new token, update it on the server, then refresh Ads.',
    url: '/admin/ads',
    entity: ['ads_account', 'act_1048893'],
    actor: ['system', 'Ads sync'],
    occurrences: 3,
    unread: 'o',
    data: { metaCode: 190, metaSubcode: 463 },
  },
  {
    at: 418,
    key: 'clients.onboarding_blocked',
    title: 'Acme Plumbing onboarding is blocked',
    body: 'Waiting on Google Business Profile access. The client has not answered the last two requests.',
    url: clientUrl('cl_acmeplumb01', 'onboarding'),
    client: 'cl_acmeplumb01',
    entity: ['onboarding_run', hexId('run', 418)],
    actor: ['staff', MANAGER_NAME],
    occurrences: 2,
    unread: 'om',
    data: { stage: 'intake' },
  },
  toolSpec(487, 2, 437500, true),
  audienceSpec(540, 'audience.subscribed', person(6).email, 'Via the free tool. Country: Canada.'),
  {
    at: 605,
    key: 'clients.access_granted',
    title: 'Rideau Lawn & Garden granted Meta Business access',
    body: 'Granted by Tom Becker. Verify it once you have checked the account.',
    url: clientUrl('cl_rideaulawn', 'access'),
    client: 'cl_rideaulawn',
    entity: ['access_grant', hexId('ag', 605)],
    actor: ['client', 'Tom Becker'],
    data: { provider: 'meta_business' },
  },

  // Yesterday and the day before
  {
    at: 15 * H + 10,
    key: 'billing.subscription_cancelled',
    title: 'Westdale Vet Clinic subscription ended',
    body: `Convert plan, ${money(129000)} a month. Cancelled at period end. Feedback: "Switching to an in-house marketer."`,
    url: '/admin/subscriptions',
    client: 'cl_westdalevet',
    entity: ['subscription', hexId('sub', 910)],
    actor: ['customer', 'Dr. Emma Clarke'],
    data: { amount: cad(129000), plan: 'convert', reason: 'switched_service' },
  },
  bookingSpec(1000, 4, 'A custom build: AI, app or software.', '$50K to $100K a month'),
  {
    at: 1090,
    key: 'clients.changes_requested',
    title: 'Nepean Orthodontics requested changes',
    body: 'Homepage design, v1: "Can the hero photo show the new clinic, not the old one? Everything else looks great."',
    url: clientUrl('cl_nepeanortho', 'approvals'),
    client: 'cl_nepeanortho',
    entity: ['approval', hexId('ap', 1090)],
    actor: ['client', 'Dr. Raj Mehta'],
    unread: 'om',
    data: { version: 1 },
  },
  {
    at: 1210,
    key: 'sales.subscription',
    title: 'New subscription: Grow',
    body: `Dundas Electric started the Grow plan: ${money(249000)} a month plus a ${money(450000)} Build & Install fee.`,
    url: '/admin/subscriptions',
    client: 'cl_dundaselec',
    entity: ['subscription', hexId('sub', 1210)],
    actor: ['customer', 'Kevin Walsh'],
    data: { amount: cad(249000), setup: cad(450000), plan: 'grow' },
  },
  {
    at: 1275,
    key: 'clients.created',
    title: 'New client: Dundas Electric',
    body: 'Created from a paid checkout. Portal invite sent to kevin@dundaselectric.test.',
    url: clientUrl('cl_dundaselec'),
    client: 'cl_dundaselec',
    actor: ['system', 'Checkout'],
  },
  audienceSpec(1340, 'audience.unsubscribed', person(9).email, 'Reason: Not relevant to me. Via the CRM.'),
  {
    at: 1420,
    key: 'clients.files_uploaded',
    title: 'Escarpment Family Dental uploaded 6 files',
    body: 'Team photos (4) and logo files (2).',
    url: clientUrl('cl_escarpdent', 'files'),
    client: 'cl_escarpdent',
    actor: ['client', 'Dr. Leah Morrison'],
    data: { count: 6 },
  },
  {
    at: 1500,
    key: 'system.cal_webhook_failing',
    title: 'Cal.com webhook failing',
    body: 'Cal.com could not reach the booking webhook 3 times. New bookings may be missing from Leads until it is fixed.',
    url: '/admin/leads',
    entity: ['webhook', 'cal'],
    actor: ['integration', 'Cal.com'],
    occurrences: 3,
    resolved: [1380, OWNER_NAME],
    data: { lastStatus: 502 },
  },
  {
    at: 1590,
    key: 'leads.portal_signup',
    title: 'Samir Patel signed up in the portal',
    body: 'Orleans Auto Detailing. Signed up, not paid yet.',
    url: clientUrl('cl_orleansauto'),
    client: 'cl_orleansauto',
    actor: ['lead', 'Samir Patel'],
    unread: 'm',
    data: { email: 'samir@orleansauto.test', source: 'portal_signup' },
  },
  {
    at: 1660,
    key: 'clients.approval_requested',
    title: 'Approval requested from Bytown Roofing Co.',
    body: `${MANAGER_NAME} sent Homepage design, v2 for approval.`,
    url: clientUrl('cl_bytownroof', 'approvals'),
    client: 'cl_bytownroof',
    entity: ['approval', hexId('ap', 302)],
    actor: ['staff', MANAGER_NAME],
    data: { version: 2 },
  },
  {
    at: 1780,
    key: 'sales.coupon_redeemed',
    title: 'Coupon FALL25 redeemed',
    body: `Barrhaven Home Renovations saved ${money(62250)} on the Build & Install fee. 4 of 10 redemptions used.`,
    url: '/admin/coupons',
    client: 'cl_barrhavenhm',
    entity: ['coupon', 'FALL25'],
    actor: ['customer', 'Luc Gagnon'],
    data: { code: 'FALL25', discount: cad(62250), redeemed: 4, max: 10 },
  },
  {
    at: 1850,
    key: 'billing.payment_recovered',
    title: 'Payment recovered: Lakeshore Cleaning',
    body: `The retry for ${money(249000)} went through. Nothing to do.`,
    url: clientUrl('cl_lakeshorecl', 'account'),
    client: 'cl_lakeshorecl',
    entity: ['subscription', hexId('sub', 1850)],
    actor: ['integration', 'Stripe'],
    data: { amount: cad(249000) },
  },
  {
    at: 1935,
    key: 'clients.behind_pace',
    title: 'Bytown Roofing Co. is behind pace',
    body: '9 of 30 qualified appointments, day 41 of 60. 20 expected by now.',
    url: clientUrl('cl_bytownroof', 'calls'),
    client: 'cl_bytownroof',
    actor: ['system', 'Guarantee check'],
    unread: 'o',
    data: { counted: 9, target: 30, day: 41, windowDays: 60, expected: 20 },
  },
  bookingSpec(2010, 5, 'More customers and booked jobs.', '$10K to $20K a month'),
  {
    at: 2100,
    key: 'clients.agreement_signed',
    title: 'Nepean Orthodontics signed the service agreement',
    body: 'Accepted by Dr. Raj Mehta (raj@nepeanortho.test), v3.',
    url: clientUrl('cl_nepeanortho', 'agreements'),
    client: 'cl_nepeanortho',
    entity: ['agreement', hexId('agr', 2100)],
    actor: ['client', 'Dr. Raj Mehta'],
  },
  {
    at: 2400,
    key: 'billing.payment_failed',
    title: 'Payment failed: Sandbox Bakery (test)',
    body: 'The test card was declined on purpose. Nothing real was charged.',
    url: '/admin/test-mode',
    client: 'cl_testco_0001',
    entity: ['subscription', hexId('sub', 9002)],
    actor: ['integration', 'Stripe (test)'],
    test: true,
    data: { amount: cad(7750), attempt: 1, declineCode: 'card_declined' },
  },
  {
    at: 2410,
    key: 'sales.subscription',
    title: 'Test subscription: Webline Care',
    body: `Sandbox Bakery (test) started Webline Care: ${money(7750)} a month.`,
    url: '/admin/test-mode',
    client: 'cl_testco_0001',
    entity: ['subscription', hexId('sub', 9002)],
    actor: ['customer', 'Test Buyer'],
    test: true,
    data: { amount: cad(7750), plan: 'webline-care' },
  },
  {
    at: 2930,
    key: 'clients.calls_to_review',
    title: 'Bytown Roofing Co.: 2 CRM appointments to review',
    body: '2 appointments from the CRM waiting for your review. Nothing counts toward the guarantee until you confirm it.',
    url: clientUrl('cl_bytownroof', 'calls'),
    client: 'cl_bytownroof',
    actor: ['system', 'CRM sync'],
    occurrences: 2,
    resolved: [2800, MANAGER_NAME],
    data: { pending: 2 },
  },
  audienceSpec(3010, 'audience.bounced', 'info@capitalwindows.test', 'Hard bounce on the Welcome email. The address is suppressed.'),
  formSpec(3100, 12, 'Hamilton Mobile Dog Grooming', 'More customers and booked jobs.', 'Just starting, no revenue yet'),
  {
    at: 3240,
    key: 'clients.member_joined',
    title: 'New portal member at Glebe Legal LLP',
    body: 'Martin Roy (martin@glebelegal.test) accepted the invite as admin.',
    url: clientUrl('cl_glebelaw', 'team'),
    client: 'cl_glebelaw',
    entity: ['member', hexId('mem', 3240)],
    actor: ['client', 'Martin Roy'],
  },
  {
    at: 3390,
    key: 'sales.order',
    title: 'New order: Webline',
    body: `${person(16).name} (${person(16).email}) paid ${money(99700)} with Afterpay, in 4 instalments.`,
    url: '/admin/subscriptions',
    entity: ['order', hexId('ord', 3390)],
    actor: ['customer', person(16).name],
    data: { amount: cad(99700), product: 'webline', paidWith: 'Afterpay', email: person(16).email },
  },
  {
    at: 3500,
    key: 'billing.care_missing',
    title: 'Steeltown Physio has no care plan',
    body: 'Webline needs an active Webline Care plan before go-live. The first care charge did not start.',
    url: clientUrl('cl_steeltownph', 'account'),
    client: 'cl_steeltownph',
    actor: ['system', 'Billing check'],
    unread: 'om',
  },
  {
    at: 3620,
    key: 'system.portal_email_failed',
    title: 'Portal invite failed: Glebe Legal LLP',
    body: 'The invite to paralegal@glebelegal.test bounced. Check the address, then resend it under Team.',
    url: clientUrl('cl_glebelaw', 'team'),
    client: 'cl_glebelaw',
    actor: ['system', 'Email'],
    data: { email: 'paralegal@glebelegal.test' },
  },
  {
    at: 3800,
    key: 'clients.tasks_done',
    title: 'Acme Plumbing finished 3 tasks',
    body: 'Brand colours, service list and service area.',
    url: clientUrl('cl_acmeplumb01', 'onboarding'),
    client: 'cl_acmeplumb01',
    actor: ['client', 'Daniel Okafor'],
    data: { count: 3 },
  },
  {
    at: 3950,
    key: 'leads.booking_cancelled',
    title: `${person(3).name} cancelled a booking`,
    body: 'The strategy call was cancelled from the Cal.com email.',
    url: '/admin/leads',
    entity: ['lead', hexId('ld', 103)],
    actor: ['lead', person(3).name],
  },
  {
    at: 4100,
    key: 'clients.approval_approved',
    title: 'Escarpment Family Dental approved the Google Ads copy',
    body: null,
    url: clientUrl('cl_escarpdent', 'approvals'),
    client: 'cl_escarpdent',
    entity: ['approval', hexId('ap', 4100)],
    actor: ['client', 'Dr. Leah Morrison'],
  },

  // Earlier this week and last week
  {
    at: 3 * D + 80,
    key: 'team.member_removed',
    title: 'Team member removed: sam.ortiz@tekmadev.test',
    body: `Removed by ${OWNER_NAME}. Their client portal access was removed too.`,
    url: '/admin/team',
    entity: ['staff', 'sam.ortiz@tekmadev.test'],
    actor: ['staff', OWNER_NAME],
  },
  {
    at: 4550,
    key: 'billing.payment_failed',
    title: 'Payment failed: Ancaster Movers',
    body: `The ${money(249000)} monthly charge was declined (card expired).`,
    url: clientUrl('cl_ancastermov', 'account'),
    client: 'cl_ancastermov',
    entity: ['subscription', hexId('sub', 4550)],
    actor: ['integration', 'Stripe'],
    resolved: [4300, OWNER_NAME],
    data: { amount: cad(249000), attempt: 1, declineCode: 'expired_card' },
  },
  toolSpec(4700, 8, 281250, false),
  audienceSpec(4850, 'audience.complained', person(15).email, 'From the September newsletter. The address is suppressed everywhere.'),
  {
    at: 5000,
    key: 'clients.intake_submitted',
    title: 'Nepean Orthodontics submitted the intake',
    body: 'Version 2, all 5 sections answered.',
    url: clientUrl('cl_nepeanortho', 'intake'),
    client: 'cl_nepeanortho',
    entity: ['intake', hexId('in', 5000)],
    actor: ['client', 'Dr. Raj Mehta'],
    resolved: [4600, MANAGER_NAME],
    data: { version: 2 },
  },
  {
    at: 5200,
    key: 'system.crm_stuck',
    title: 'CRM sync stuck: 6 items',
    body: '6 contacts failed to push after 5 tries. Most common reason: the CRM rate limited us.',
    url: '/admin/crm',
    entity: ['crm_queue', 'outbox'],
    actor: ['system', 'CRM sync'],
    occurrences: 6,
    data: { stuck: 6, direction: 'outbound' },
  },
  formSpec(5420, 17, 'Glanbrook Septic Services', 'Not sure yet, I want to talk it through.', '$100K+ a month'),
  {
    at: 5600,
    key: 'sales.subscription',
    title: 'New subscription: Webline Care',
    body: `ByWard Catering started Webline Care: ${money(7750)} a month.`,
    url: '/admin/subscriptions',
    client: 'cl_byward_cafe',
    entity: ['subscription', hexId('sub', 5600)],
    actor: ['customer', 'Nadia Haddad'],
    data: { amount: cad(7750), plan: 'webline-care' },
  },
  {
    at: 5850,
    key: 'clients.went_live',
    title: 'Barrhaven Home Renovations is live',
    body: 'Guarantee clock started: 30 qualified appointments in 60 days.',
    url: clientUrl('cl_barrhavenhm', 'onboarding'),
    client: 'cl_barrhavenhm',
    actor: ['staff', OWNER_NAME],
  },
  bookingSpec(6000, 14, 'Content and motion graphics.', '$20K to $50K a month'),
  {
    at: 6150,
    key: 'clients.access_done',
    title: 'Lakeshore Cleaning says access is done',
    body: 'Google Business Profile: the client marked it done. Check it, then mark it verified.',
    url: clientUrl('cl_lakeshorecl', 'access'),
    client: 'cl_lakeshorecl',
    entity: ['access_grant', hexId('ag', 6150)],
    actor: ['client', 'Sofia Alvarez'],
    data: { provider: 'google_business_profile' },
  },
  audienceSpec(6400, 'audience.unsubscribed', person(19).email, 'Reason: I never signed up. Via the unsubscribe page.'),
  {
    at: 6600,
    key: 'billing.refund',
    title: `Refund issued: ${money(24850)}`,
    body: `Partial refund to ${person(16).name} on the Webline order. Reason: duplicate add-on.`,
    url: '/admin/subscriptions',
    entity: ['order', hexId('ord', 3390)],
    actor: ['staff', OWNER_NAME],
    data: { amount: cad(24850) },
  },
  formSpec(6900, 13, 'Stoney Creek Tutoring Centre', 'More customers and booked jobs.', '$10K to $20K a month'),
  {
    at: 7300,
    key: 'system.meta_token_expiring',
    title: 'Meta token expires soon',
    body: 'The Ads access token expires in 7 days. Replace it on the server to keep Ads syncing.',
    url: '/admin/ads',
    entity: ['ads_account', 'act_1048893'],
    actor: ['system', 'Ads sync'],
  },
  {
    at: 7500,
    key: 'clients.changes_requested',
    title: 'Rideau Lawn & Garden requested changes',
    body: 'Service area page, v1: "Please add Manotick and Greely to the list."',
    url: clientUrl('cl_rideaulawn', 'approvals'),
    client: 'cl_rideaulawn',
    entity: ['approval', hexId('ap', 7500)],
    actor: ['client', 'Tom Becker'],
    resolved: [7000, MANAGER_NAME],
  },
  bookingSpec(7700, 11, 'A new or better website.', 'Under $10K a month'),
  {
    at: 7950,
    key: 'team.member_added',
    title: 'Team member added: sam.ortiz@tekmadev.test',
    body: `Added as a manager by ${OWNER_NAME}.`,
    url: '/admin/team',
    entity: ['staff', 'sam.ortiz@tekmadev.test'],
    actor: ['staff', OWNER_NAME],
    data: { role: 'manager' },
  },
  {
    at: 8200,
    key: 'clients.files_uploaded',
    title: 'Harbour HVAC uploaded a file',
    body: 'Price list 2026.pdf',
    url: clientUrl('cl_harbourhvac', 'files'),
    client: 'cl_harbourhvac',
    actor: ['client', 'Priya Raman'],
    data: { count: 1 },
  },
  {
    at: 8400,
    key: 'sales.order',
    title: 'New order: Webline',
    body: `${person(18).name} (${person(18).email}) paid ${money(99700)} by card.`,
    url: '/admin/subscriptions',
    entity: ['order', hexId('ord', 8400)],
    actor: ['customer', person(18).name],
    data: { amount: cad(99700), product: 'webline', paidWith: 'Card', email: person(18).email },
  },
  {
    at: 8700,
    key: 'billing.dispute',
    title: 'Payment disputed: Kanata Pest Control',
    body: `The bank opened a dispute for ${money(129000)}. Respond in Stripe before the deadline.`,
    url: clientUrl('cl_kanatapest', 'account'),
    client: 'cl_kanatapest',
    entity: ['order', hexId('ord', 8700)],
    actor: ['integration', 'Stripe'],
    resolved: [8000, OWNER_NAME],
    data: { amount: cad(129000), reason: 'product_not_received' },
  },
  toolSpec(8900, 9, 195000, true),
  {
    at: 9100,
    key: 'clients.approval_requested',
    title: 'Approval requested from Escarpment Family Dental',
    body: `${MANAGER_NAME} sent Google Ads copy, v1 for approval.`,
    url: clientUrl('cl_escarpdent', 'approvals'),
    client: 'cl_escarpdent',
    entity: ['approval', hexId('ap', 4100)],
    actor: ['staff', MANAGER_NAME],
  },
  audienceSpec(9400, 'audience.subscribed', person(12).email, 'Via the blog footer form. Country: Canada.'),
  {
    at: 9700,
    key: 'clients.onboarding_blocked',
    title: 'Nepean Orthodontics onboarding is blocked',
    body: 'Waiting on the domain registrar login.',
    url: clientUrl('cl_nepeanortho', 'onboarding'),
    client: 'cl_nepeanortho',
    entity: ['onboarding_run', hexId('run', 9700)],
    actor: ['staff', MANAGER_NAME],
    resolved: [9000, MANAGER_NAME],
  },
  bookingSpec(10200, 15, 'More customers and booked jobs.', '$50K to $100K a month'),
  {
    at: 10450,
    key: 'clients.agreement_signed',
    title: 'Rideau Lawn & Garden signed the service agreement',
    body: 'Accepted by Tom Becker (tom@rideaulawn.test), v3.',
    url: clientUrl('cl_rideaulawn', 'agreements'),
    client: 'cl_rideaulawn',
    entity: ['agreement', hexId('agr', 10450)],
    actor: ['client', 'Tom Becker'],
  },
  {
    at: 10800,
    key: 'billing.cancel_scheduled',
    title: 'Kanata Pest Control will cancel at period end',
    body: `Convert plan, ${money(129000)} a month. Reason: "Pausing for the winter."`,
    url: '/admin/subscriptions',
    client: 'cl_kanatapest',
    entity: ['subscription', hexId('sub', 95)],
    actor: ['customer', 'Hugo Tremblay'],
    data: { amount: cad(129000), plan: 'convert' },
  },
  formSpec(11200, 7, 'Ottawa Valley Snow & Ice Removal Professionals Incorporated', 'More customers and booked jobs.', '$20K to $50K a month'),
  {
    at: 11700,
    key: 'system.crm_reconcile_halted',
    title: 'Nightly reconcile stopped',
    body: 'One night would have unsubscribed 23% of the list, more than the one fifth safety limit. Nothing was changed.',
    url: '/admin/crm',
    entity: ['crm_run', hexId('run', 11700)],
    actor: ['system', 'CRM reconcile'],
    resolved: [11000, OWNER_NAME],
    data: { wouldUnsubscribe: 412, listSize: 1791 },
  },
  bookingSpec(12100, 6, 'More customers and booked jobs.', '$100K+ a month'),
  {
    at: 12500,
    key: 'clients.member_joined',
    title: 'New portal member at Harbour HVAC',
    body: 'Dev Raman (dev@harbourhvac.test) accepted the invite as member.',
    url: clientUrl('cl_harbourhvac', 'team'),
    client: 'cl_harbourhvac',
    entity: ['member', hexId('mem', 12500)],
    actor: ['client', 'Dev Raman'],
  },
  {
    at: 12950,
    key: 'clients.created',
    title: 'New client: Steeltown Physio',
    body: 'Created from a paid Webline checkout. Portal invite sent to aisha@steeltownphysio.test.',
    url: clientUrl('cl_steeltownph'),
    client: 'cl_steeltownph',
    actor: ['system', 'Checkout'],
  },
  {
    at: 12955,
    key: 'sales.order',
    title: 'New order: Webline',
    body: `Steeltown Physio paid ${money(99700)} by card.`,
    url: '/admin/subscriptions',
    client: 'cl_steeltownph',
    entity: ['order', hexId('ord', 12955)],
    actor: ['customer', 'Aisha Khan'],
    data: { amount: cad(99700), product: 'webline', paidWith: 'Card' },
  },
  toolSpec(13300, 1, 87525, false),
  audienceSpec(13800, 'audience.unsubscribed', person(13).email, 'Reason: Something else. "Wrong business, sorry." Via the unsubscribe page.'),
  {
    at: 14200,
    key: 'clients.access_granted',
    title: 'Acme Plumbing granted website hosting access',
    body: null,
    url: clientUrl('cl_acmeplumb01', 'access'),
    client: 'cl_acmeplumb01',
    entity: ['access_grant', hexId('ag', 14200)],
    actor: ['client', 'Daniel Okafor'],
  },
];

function recordFromSpec(spec: Spec, index: number): NotificationRecord {
  const def = NOTIFICATION_EVENTS[spec.key] as EventDef;
  const c = spec.client ? client(spec.client) : undefined;
  const [entityType, entityId] = spec.entity ?? (c ? ['client', c.id] : [null, null]);
  return {
    id: hexId('ntf', index + 1),
    last_occurred_at: minutesAgo(spec.at),
    occurrences: spec.occurrences ?? 1,
    event_key: spec.key,
    category: def.category,
    severity: def.severity,
    title: spec.title,
    body: spec.body,
    action_url: spec.url,
    entity_type: entityType,
    entity_id: entityId,
    client_id: c?.id ?? null,
    actor_type: spec.actor?.[0] ?? null,
    actor_label: spec.actor?.[1] ?? null,
    needs_action: def.needsAction,
    resolved_at: spec.resolved ? minutesAgo(spec.resolved[0]) : null,
    resolved_by: spec.resolved ? spec.resolved[1] : null,
    is_test: spec.test ?? false,
    data: spec.data ?? {},
    label: def.label,
    audience: def.ownerOnly || OWNER_ONLY_CATEGORIES.includes(def.category) ? 'owner' : 'staff',
  };
}

/** The shared inbox (mutable). Order does not matter: reads sort by last_occurred_at. */
export const notificationRows: NotificationRecord[] = SPECS.map(recordFromSpec);

/** Rows unread at first sign-in, per persona (everything else starts read). */
const seedUnread = new Map<string, Spec['unread']>(
  SPECS.map((spec, i) => [notificationRows[i].id, spec.unread] as const).filter(([, u]) => !!u),
);

/* ------------------------------------------------------------------ */
/* Per-user state: read marks and preferences                          */
/* ------------------------------------------------------------------ */

type CategoryPref = { muted: boolean; push: boolean };

type UserInbox = {
  /** Row id -> the last_occurred_at it was read at. A bump moves past it: unread again. */
  reads: Map<string, string>;
  prefs: Map<NotificationCategory, CategoryPref>;
};

const inboxes = new Map<string, UserInbox>();

function seedPrefs(role: Role): Map<NotificationCategory, CategoryPref> {
  const prefs = new Map<NotificationCategory, CategoryPref>();
  for (const category of NOTIFICATION_CATEGORIES) prefs.set(category, { muted: false, push: true });
  if (role === 'owner') {
    // The owner keeps the newsletter churn quiet and gets team changes in the inbox only.
    prefs.set('audience', { muted: true, push: false });
    prefs.set('team', { muted: false, push: false });
  } else {
    prefs.set('sales', { muted: true, push: false });
  }
  return prefs;
}

/**
 * The caller's inbox state, created on first use (GET /me does this first, like
 * the server). Owners other than the fixture owner start like the owner.
 */
export function inboxStateFor(userId: string, role: Role): UserInbox {
  let state = inboxes.get(userId);
  if (!state) {
    const persona = role === 'owner' ? 'o' : 'm';
    const reads = new Map<string, string>();
    for (const row of notificationRows) {
      const unread = seedUnread.get(row.id);
      if (!unread || !unread.includes(persona)) reads.set(row.id, row.last_occurred_at);
    }
    state = { reads, prefs: seedPrefs(role) };
    inboxes.set(userId, state);
  }
  return state;
}

/** Forget every user's read marks and prefs (tests and the Kit's mock reset). */
export function resetInboxStates() {
  inboxes.clear();
}

export function isRead(row: NotificationRecord, state: UserInbox): boolean {
  const readAt = state.reads.get(row.id);
  return readAt !== undefined && readAt >= row.last_occurred_at;
}

export function isMuted(row: Pick<NotificationRecord, 'category'>, state: UserInbox): boolean {
  return state.prefs.get(row.category)?.muted ?? false;
}

/** Who reads the inbox: the caller's id (read marks, prefs) and role (their capabilities). */
export type InboxCaller = Pick<MockStaff, 'id' | 'role'>;

/**
 * May this caller see the row? It must be in one of their categories
 * (`inbox.<category>`, see inboxCategories), and a test row needs
 * `testdata.view` plus `includeTest` (lists ask with `test=1`; by id it is always asked).
 */
export function callerSees(who: Pick<MockStaff, 'role'>, row: NotificationRecord, includeTest: boolean): boolean {
  if (row.is_test && (!includeTest || !mockCan(who, 'testdata.view'))) return false;
  return inboxCategories(who).includes(row.category);
}

/** Newest first; ties (same microsecond) broken by id so paging stays stable. */
export function compareRows(a: NotificationRecord, b: NotificationRecord): number {
  if (a.last_occurred_at !== b.last_occurred_at) return a.last_occurred_at < b.last_occurred_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** The caller's rows, newest first. */
export function visibleRows(who: Pick<MockStaff, 'role'>, includeTest: boolean): NotificationRecord[] {
  return notificationRows.filter((row) => callerSees(who, row, includeTest)).sort(compareRows);
}

export function findRow(id: string): NotificationRecord | undefined {
  return notificationRows.find((row) => row.id === id);
}

/** The API item for this user: the stored row plus their read and quiet flags. */
export function serializeNotification(row: NotificationRecord, state: UserInbox): NotificationItem {
  const { audience: _audience, ...item } = row;
  return { ...item, is_read: isRead(row, state), is_muted: isMuted(row, state) };
}

/**
 * The caller's badge: unread and critical unread leave out quiet categories,
 * needs action counts open rows whether quiet or not. Only rows the caller sees.
 */
export function summarize(who: InboxCaller, includeTest = false): NotificationSummary {
  const state = inboxStateFor(who.id, who.role);
  let unread = 0;
  let needsAction = 0;
  let criticalUnread = 0;
  for (const row of notificationRows) {
    if (!callerSees(who, row, includeTest)) continue;
    if (row.needs_action && !row.resolved_at) needsAction += 1;
    if (isRead(row, state) || isMuted(row, state)) continue;
    unread += 1;
    if (row.severity === 'critical') criticalUnread += 1;
  }
  return { unread, needsAction, criticalUnread };
}

/**
 * The inbox summary GET /overview and GET /notifications/summary report for a
 * user (test rows excluded, quiet categories not counted as unread).
 */
export function notificationSummaryFor(userId: string, role: Role): NotificationSummary {
  return summarize({ id: userId, role }, false);
}

/** One pref row per category the caller reads (inboxCategories), in catalogue order. */
export function prefsFor(who: InboxCaller): NotificationPref[] {
  const state = inboxStateFor(who.id, who.role);
  return inboxCategories(who).map((category) => {
    const pref = state.prefs.get(category) ?? { muted: false, push: true };
    return { category, label: CATEGORY_LABELS[category], muted: pref.muted, push: pref.push };
  });
}

/* ------------------------------------------------------------------ */
/* New events and bumps (other mock domains and the Kit can call this) */
/* ------------------------------------------------------------------ */

export type NotificationEventInput = {
  event_key: NotificationEventKey;
  title: string;
  body?: string | null;
  action_url?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  client_id?: string | null;
  actor_type?: string | null;
  actor_label?: string | null;
  data?: Record<string, unknown>;
  is_test?: boolean;
};

/**
 * Record an event like the server does. A repeat of an event already in the
 * inbox (same event key, entity and test flag) bumps that row: it moves to the
 * top, counts one more occurrence, reopens if it needs action, and is unread
 * again for everyone. Anything else becomes a new row.
 */
export function recordNotificationEvent(input: NotificationEventInput): NotificationRecord {
  const def = eventDef(input.event_key);
  if (!def) throw new Error(`Unknown notification event ${input.event_key}`);
  const now = nowIso();
  const isTest = input.is_test ?? false;
  const entityId = input.entity_id ?? null;

  const existing = entityId
    ? notificationRows.find((row) => row.event_key === input.event_key && row.entity_id === entityId && row.is_test === isTest)
    : undefined;
  if (existing) {
    existing.last_occurred_at = now;
    existing.occurrences += 1;
    existing.title = input.title;
    if (input.body !== undefined) existing.body = input.body;
    if (input.data) existing.data = { ...existing.data, ...input.data };
    if (existing.needs_action) {
      existing.resolved_at = null;
      existing.resolved_by = null;
    }
    return existing;
  }

  const row: NotificationRecord = {
    id: mockId('ntf'),
    last_occurred_at: now,
    occurrences: 1,
    event_key: input.event_key,
    category: def.category,
    severity: def.severity,
    title: input.title,
    body: input.body ?? null,
    action_url: input.action_url ?? null,
    entity_type: input.entity_type ?? null,
    entity_id: entityId,
    client_id: input.client_id ?? null,
    actor_type: input.actor_type ?? null,
    actor_label: input.actor_label ?? null,
    needs_action: def.needsAction,
    resolved_at: null,
    resolved_by: null,
    is_test: isTest,
    data: input.data ?? {},
    label: def.label,
    audience: def.ownerOnly || OWNER_ONLY_CATEGORIES.includes(def.category) ? 'owner' : 'staff',
  };
  notificationRows.push(row);
  return row;
}

let simulatedBookings = 0;

/** Ready-made events for the Kit's mock controls (watch the badge and the bump behaviour). */
export const mockNotificationEvents = {
  /** A brand new row: someone booked a call. */
  newBooking(): NotificationRecord {
    simulatedBookings += 1;
    const p = person(simulatedBookings + 6);
    return recordNotificationEvent({
      event_key: 'leads.booking',
      title: `${p.name} booked a strategy call`,
      body: 'Booked through Cal.com. Need: More customers and booked jobs. Revenue: $10K to $20K a month.',
      action_url: '/admin/leads',
      entity_type: 'lead',
      entity_id: mockId('ld'),
      actor_type: 'lead',
      actor_label: p.name,
      data: { email: p.email, source: 'cal_booking' },
    });
  },
  /** The same Stripe problem again: bumps the existing row (owner only). */
  repeatStripeFailure(): NotificationRecord {
    const row = notificationRows.find((r) => r.event_key === 'system.stripe_webhook_failing' && r.entity_id === 'stripe');
    const n = (row?.occurrences ?? 0) + 1;
    return recordNotificationEvent({
      event_key: 'system.stripe_webhook_failing',
      title: 'Stripe webhook failing',
      body: `Stripe got an error back from the site ${n} times since yesterday: the signing secret does not match. Payments still go through, but orders and subscriptions stop updating here until it is fixed.`,
      entity_type: 'webhook',
      entity_id: 'stripe',
      actor_type: 'integration',
      actor_label: 'Stripe',
    });
  },
  /** A payment fails again: bumps and reopens the Kanata Pest Control row (everyone). */
  repeatPaymentFailure(): NotificationRecord {
    const row = notificationRows.find((r) => r.event_key === 'billing.payment_failed' && r.client_id === 'cl_kanatapest');
    return recordNotificationEvent({
      event_key: 'billing.payment_failed',
      title: 'Payment failed: Kanata Pest Control',
      body: `The ${money(149050)} monthly charge was declined again (insufficient funds).`,
      action_url: clientUrl('cl_kanatapest', 'account'),
      entity_type: row?.entity_type ?? 'subscription',
      entity_id: row?.entity_id ?? hexId('sub', 95),
      client_id: 'cl_kanatapest',
      actor_type: 'integration',
      actor_label: 'Stripe',
      data: { attempt: (row?.occurrences ?? 0) + 1 },
    });
  },
};

/* ------------------------------------------------------------------ */
/* Push devices (POST /devices, DELETE /devices/:id, test pushes)      */
/* ------------------------------------------------------------------ */

export type MockDevice = {
  id: string;
  userId: string;
  token: string;
  platform: 'android' | 'ios';
  appVersion: string;
  deviceName: string;
  createdAt: string;
  lastSeenAt: string;
};

/** Registered phones (mutable). The owner's old phone is already there. */
export const mockDevices: MockDevice[] = [
  {
    id: 'dev_4be1c09a',
    userId: 'usr_owner01',
    token: 'ExponentPushToken[mOcKoWnErPiXeL7aB3dE9]',
    platform: 'android',
    appVersion: '0.1.0',
    deviceName: 'Pixel 7',
    createdAt: daysAgo(21, 3),
    lastSeenAt: daysAgo(2, 5),
  },
];

/* ------------------------------------------------------------------ */
/* GET /meta fragment                                                  */
/* ------------------------------------------------------------------ */

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture: NotificationsMeta = {
  notificationCategories: NOTIFICATION_CATEGORIES.map((value) => ({
    value,
    label: CATEGORY_LABELS[value],
    // Like the server: true only when owners alone hold the category's capability (none today).
    ownerOnly: isOwnerOnly(`inbox.${value}`),
  })),
  notificationSeverities: [
    { value: 'info', label: 'Info', tone: 'neutral' },
    { value: 'success', label: 'Success', tone: 'ok' },
    { value: 'warning', label: 'Warning', tone: 'warn' },
    { value: 'critical', label: 'Critical', tone: 'signal' },
  ],
  notificationEvents: (Object.keys(NOTIFICATION_EVENTS) as NotificationEventKey[]).map((key) => {
    const def: EventDef = NOTIFICATION_EVENTS[key];
    return { key, label: def.label, category: def.category, severity: def.severity, needsAction: def.needsAction };
  }),
};
