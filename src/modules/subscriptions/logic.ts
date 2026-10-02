import type {
  BillingMeta,
  BillingSummary,
  Order,
  OrderStatus,
  PaymentMethod,
  Subscription,
  SubscriptionStatus,
} from '@/api/schemas/billing';
import type { Tone } from '@/design/tokens';
import { formatShortDate, relativeTime, toDate } from '@/lib/dates';
import { formatCount, plural } from '@/lib/format';
import { formatCents, formatMoney } from '@/lib/money';

/** "$77.50/mo", "$4,970/yr": the same text Home's "Recent subscriptions" shows. */
export { subscriptionAmount } from '@/modules/overview/logic';

/**
 * Pure helpers for the Subscriptions segment of the Customers tab (brief 8.8):
 * the inner tab param, the subtitle, labels and tones (GET /meta first, the
 * brief's words as the fallback before meta loads), and the row and detail text.
 */

export type ToneLabel = { label: string; tone: Tone };
type BillingMetaLike = Partial<BillingMeta> | undefined;

/* ---------- inner tabs (route param `sub`) ---------- */

export const BILLING_TABS = ['orders', 'subscriptions'] as const;
export type BillingTab = (typeof BILLING_TABS)[number];

export const BILLING_TAB_LABELS: Record<BillingTab, string> = {
  orders: 'One-time orders',
  subscriptions: 'Subscriptions',
};

/** `sub=orders` opens One-time orders; anything else (or nothing) opens Subscriptions. */
export function toBillingTab(value: string | string[] | undefined): BillingTab {
  const first = Array.isArray(value) ? value[0] : value;
  return first === 'orders' ? 'orders' : 'subscriptions';
}

/* ---------- copy (brief 8.8, exact) ---------- */

export const BILLING_COPY = {
  emptyOrders: 'No one-time orders yet. Webline purchases appear here the moment Stripe confirms payment.',
  emptySubscriptions: 'No subscriptions yet. They appear here once the Stripe webhook is connected.',
  noMatchOrders: 'No one-time orders with this status.',
  noMatchSubscriptions: 'No subscriptions with this status.',
  showAll: 'Show all',
} as const;

/** "12 subscriptions · 45 one-time orders (3 paid in instalments)", singular when 1. */
export function summaryLine(summary: BillingSummary): string {
  const subs = `${formatCount(summary.subscriptions)} ${plural(summary.subscriptions, 'subscription', 'subscriptions')}`;
  const orders = `${formatCount(summary.orders)} one-time ${plural(summary.orders, 'order', 'orders')}`;
  return `${subs} · ${orders} (${formatCount(summary.bnpl)} paid in instalments)`;
}

/** The freshest summary of the two lists (both carry the same totals). */
export function pickSummary(
  a: { summary: BillingSummary | undefined; updatedAt: number },
  b: { summary: BillingSummary | undefined; updatedAt: number },
): BillingSummary | undefined {
  if (!a.summary) return b.summary;
  if (!b.summary) return a.summary;
  return b.updatedAt > a.updatedAt ? b.summary : a.summary;
}

/* ---------- labels and tones ---------- */

const ORDER_STATUS_FALLBACK: Record<OrderStatus, ToneLabel> = {
  pending: { label: 'Pending', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'ok' },
  failed: { label: 'Failed', tone: 'signal' },
  refunded: { label: 'Refunded', tone: 'muted' },
  partially_refunded: { label: 'Partially refunded', tone: 'warn' },
  disputed: { label: 'Disputed', tone: 'signal' },
};

const SUBSCRIPTION_STATUS_FALLBACK: Record<SubscriptionStatus, ToneLabel> = {
  active: { label: 'Active', tone: 'ok' },
  trialing: { label: 'Trialing', tone: 'gold' },
  past_due: { label: 'Past due', tone: 'warn' },
  unpaid: { label: 'Unpaid', tone: 'signal' },
  incomplete: { label: 'Incomplete', tone: 'warn' },
  incomplete_expired: { label: 'Expired', tone: 'muted' },
  paused: { label: 'Paused', tone: 'muted' },
  canceled: { label: 'Cancelled', tone: 'muted' },
};

const PAYMENT_METHOD_FALLBACK: Record<PaymentMethod, string> = {
  card: 'Card',
  klarna: 'Klarna',
  afterpay: 'Afterpay',
  affirm: 'Affirm',
  link: 'Link',
};

export function orderStatusBadge(meta: BillingMetaLike, status: OrderStatus): ToneLabel {
  const found = meta?.billingOrderStatuses?.find((s) => s.value === status);
  return found ? { label: found.label, tone: found.tone } : ORDER_STATUS_FALLBACK[status];
}

export function subscriptionStatusLabel(meta: BillingMetaLike, status: SubscriptionStatus): ToneLabel {
  const found = meta?.billingSubscriptionStatuses?.find((s) => s.value === status);
  return found ? { label: found.label, tone: found.tone } : SUBSCRIPTION_STATUS_FALLBACK[status];
}

export function paymentMethodLabel(meta: BillingMetaLike, method: PaymentMethod): string {
  return meta?.billingPaymentMethods?.find((m) => m.value === method)?.label ?? PAYMENT_METHOD_FALLBACK[method];
}

/** Status chips: "All", then the statuses in GET /meta order. */
export function orderFilterItems(meta: BillingMetaLike): { value: OrderStatus | 'all'; label: string }[] {
  const statuses = meta?.billingOrderStatuses ?? (Object.keys(ORDER_STATUS_FALLBACK) as OrderStatus[]).map((value) => ({ value, ...ORDER_STATUS_FALLBACK[value] }));
  return [{ value: 'all', label: 'All' }, ...statuses.map((s) => ({ value: s.value, label: s.label }))];
}

export function subscriptionFilterItems(meta: BillingMetaLike): { value: SubscriptionStatus | 'all'; label: string }[] {
  const statuses =
    meta?.billingSubscriptionStatuses ??
    (Object.keys(SUBSCRIPTION_STATUS_FALLBACK) as SubscriptionStatus[]).map((value) => ({ value, ...SUBSCRIPTION_STATUS_FALLBACK[value] }));
  return [{ value: 'all', label: 'All' }, ...statuses.map((s) => ({ value: s.value, label: s.label }))];
}

/* ---------- rows ---------- */

/** Rows of every loaded page, once each (a row that moves between page loads would show twice). */
export function uniqueRows<T extends { id: string }>(pages: readonly { items: readonly T[] }[] | undefined): T[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const row of page.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/** The business, or the email when the checkout had none. */
export function orderTitle(order: Pick<Order, 'business' | 'email'>): string {
  return order.business?.trim() || order.email;
}

/** The payment went through (it may have been refunded or disputed since). */
export function orderWentThrough(status: OrderStatus): boolean {
  return status !== 'pending' && status !== 'failed';
}

/** "Klarna · $150 refunded · 3 h ago"; a pending checkout has no method yet. */
export function orderMetaLine(order: Pick<Order, 'paidWith' | 'status' | 'amountRefunded' | 'createdAt'>, meta: BillingMetaLike, now: Date): string {
  const parts = [order.paidWith ? paymentMethodLabel(meta, order.paidWith) : 'Not paid yet'];
  if (order.status === 'partially_refunded' && order.amountRefunded) parts.push(`${formatMoney(order.amountRefunded)} refunded`);
  parts.push(relativeTime(order.createdAt, now));
  return parts.filter(Boolean).join(' · ');
}

/** "Paid with" once the payment went through, "Payment method" for a failed or unfinished checkout. */
export function paymentFieldLabel(status: OrderStatus): string {
  return orderWentThrough(status) ? 'Paid with' : 'Payment method';
}

/** What is left after a partial refund, in cents (both sides are exact integer cents). */
export function orderNet(order: Pick<Order, 'amount' | 'amountRefunded'>): string | null {
  if (!order.amountRefunded || order.amountRefunded.currency !== order.amount.currency) return null;
  return formatCents(order.amount.amount - order.amountRefunded.amount, order.amount.currency);
}

/** "$77.50 a month", for the detail and TalkBack. */
export function subscriptionAmountSpoken(sub: Pick<Subscription, 'amount' | 'interval'>): string {
  const text = formatMoney(sub.amount);
  return text ? `${text} a ${sub.interval}` : '';
}

/** Statuses that can still be "ending": a finished subscription just shows its status. */
const LIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

/** True while it is set to cancel at the end of the current period. */
export function isEnding(sub: Pick<Subscription, 'status' | 'cancelAtPeriodEnd' | 'currentPeriodEnd'>): boolean {
  return sub.cancelAtPeriodEnd && sub.currentPeriodEnd !== null && LIVE_STATUSES.has(sub.status);
}

/** The Stripe status as a badge, or "Ending Oct 23" (Toronto date) while it cancels at the period end. */
export function subscriptionBadge(meta: BillingMetaLike, sub: Pick<Subscription, 'status' | 'cancelAtPeriodEnd' | 'currentPeriodEnd'>, now: Date): ToneLabel {
  if (isEnding(sub) && sub.currentPeriodEnd) return { label: `Ending ${formatShortDate(sub.currentPeriodEnd, now)}`, tone: 'warn' };
  return subscriptionStatusLabel(meta, sub.status);
}

/** The period end (Toronto date) with the word that fits its status: "Renews", "Trial ends", "Ends", "Period ended". */
export function periodField(sub: Pick<Subscription, 'status' | 'cancelAtPeriodEnd' | 'currentPeriodEnd'>, now: Date): { label: string; value: string } | null {
  const end = toDate(sub.currentPeriodEnd);
  if (!end || !sub.currentPeriodEnd) return null;
  const value = formatShortDate(sub.currentPeriodEnd, now);
  if (end.getTime() <= now.getTime()) return { label: 'Period ended', value };
  if (isEnding(sub)) return { label: 'Ends', value };
  if (sub.status === 'active') return { label: 'Renews', value };
  if (sub.status === 'trialing') return { label: 'Trial ends', value };
  return { label: 'Period ends', value };
}

/**
 * The row's quiet line: "Renews Oct 13", "Trial ends Oct 9", "Period ended Sep 2".
 * Null while it is ending: the "Ending Oct 23" badge already says when.
 */
export function periodLine(sub: Pick<Subscription, 'status' | 'cancelAtPeriodEnd' | 'currentPeriodEnd'>, now: Date): string | null {
  if (isEnding(sub)) return null;
  const field = periodField(sub, now);
  return field ? `${field.label} ${field.value}` : null;
}

/** Plan name, or "Webline Care" (the server sends it as the product name). */
export function subscriptionPlan(sub: Pick<Subscription, 'productName' | 'kind'>): string {
  return sub.productName.trim() || (sub.kind === 'care' ? 'Webline Care' : 'Growth plan');
}

/* ---------- TalkBack ---------- */

export function orderSpokenLabel(order: Order, meta: BillingMetaLike, now: Date): string {
  const status = orderStatusBadge(meta, order.status);
  return [orderTitle(order), order.product, status.label, formatMoney(order.amount), orderMetaLine(order, meta, now)].filter(Boolean).join(', ');
}

export function subscriptionSpokenLabel(sub: Subscription, meta: BillingMetaLike, now: Date): string {
  const badge = subscriptionBadge(meta, sub, now);
  return [sub.email, subscriptionPlan(sub), badge.label, subscriptionAmountSpoken(sub), periodLine(sub, now)].filter(Boolean).join(', ');
}
