import type {
  Billing,
  ClientBundle,
  ClientsMeta,
  ClientStatus,
  Guarantee,
  OnboardingStage,
  OrderStatus,
  SubscriptionStatus,
} from '@/api/schemas/clients';
import type { Tone } from '@/design/tokens';
import { formatCalendarDate, formatShortDate } from '@/lib/dates';
import { CLIENT_SECTIONS, type ClientSection } from '@/lib/deeplinks';
import { formatMoney } from '@/lib/money';

/**
 * Pure helpers for the Client detail shell: which sections show, the four stat
 * cards, labels with fallbacks (so nothing waits on GET /meta), and the small
 * amount of scroll math behind the sticky section tabs. The scroll helpers are
 * worklets too, because the scroll spy runs on the UI thread.
 */

/* ---------- sections ---------- */

export const SECTION_LABELS: Record<ClientSection, string> = {
  onboarding: 'Onboarding',
  intake: 'Intake',
  access: 'Access',
  files: 'Files',
  approvals: 'Approvals',
  agreements: 'Agreements',
  calls: 'Calls',
  crm: 'CRM',
  team: 'Team',
  account: 'Account',
  activity: 'Activity',
};

/** Sections in tab order. CRM needs `clients.crm`: without it the section is never rendered, not even the tab. */
export function visibleSections(canSeeCrm: boolean): ClientSection[] {
  return CLIENT_SECTIONS.filter((s) => s !== 'crm' || canSeeCrm);
}

/** Actions that belong to one section, so opening with only `action` still lands in the right place. */
const ACTION_SECTIONS: Record<string, ClientSection> = { 'log-call': 'calls' };

/**
 * Where the screen opens: the `section` route param (from /admin/clients/<id>#<section>)
 * when this person can see it, else the section an `action` belongs to, else the top.
 */
export function initialSection(section: string | undefined, action: string | undefined, visible: readonly ClientSection[]): ClientSection | null {
  const wanted = visible.find((s) => s === section);
  if (wanted) return wanted;
  const fromAction = action ? ACTION_SECTIONS[action] : undefined;
  return fromAction && visible.includes(fromAction) ? fromAction : null;
}

/** One value out of a route param that may arrive as a list. */
export function oneParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : undefined;
}

/* ---------- labels (meta first, fallback second) ---------- */

type Labelled<V extends string> = readonly { value: V; label: string }[] | undefined;
type Toned<V extends string> = readonly { value: V; label: string; tone: Tone }[] | undefined;

export function labelFor<V extends string>(options: Labelled<V>, value: V, fallback: Record<V, string>): string {
  return options?.find((o) => o.value === value)?.label ?? fallback[value] ?? value;
}

export function badgeFor<V extends string>(options: Toned<V>, value: V, fallback: Record<V, { label: string; tone: Tone }>): { label: string; tone: Tone } {
  const found = options?.find((o) => o.value === value);
  if (found) return { label: found.label, tone: found.tone };
  return fallback[value] ?? { label: value, tone: 'neutral' };
}

/** Brief 8.5: lead muted, pending neutral, onboarding gold, live ok, paused warn, churned muted. */
export const CLIENT_STATUS_FALLBACK: Record<ClientStatus, { label: string; tone: Tone }> = {
  lead: { label: 'Lead', tone: 'muted' },
  pending: { label: 'Pending', tone: 'neutral' },
  onboarding: { label: 'Onboarding', tone: 'gold' },
  live: { label: 'Live', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  churned: { label: 'Churned', tone: 'muted' },
};

export const STAGE_FALLBACK: Record<OnboardingStage, string> = {
  welcome: 'Welcome',
  intake: 'Intake',
  kickoff: 'Kickoff',
  build: 'Build',
  review: 'Review',
  go_live: 'Go live',
  optimizing: 'Optimizing',
  complete: 'Complete',
};

const SUBSCRIPTION_FALLBACK: Record<SubscriptionStatus, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past due',
  unpaid: 'Unpaid',
  incomplete: 'Incomplete',
  paused: 'Paused',
  canceled: 'Cancelled',
};

const ORDER_FALLBACK: Record<OrderStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
};

/** The slices of GET /meta the stat cards read. All optional: the cards never wait for meta. */
export type StatLabels = {
  stages?: ClientsMeta['onboardingStages'];
  subscriptionStatuses?: readonly { value: string; label: string }[];
  orderStatuses?: readonly { value: string; label: string }[];
};

export function stageLabel(stage: OnboardingStage, stages?: ClientsMeta['onboardingStages']): string {
  return labelFor(stages, stage, STAGE_FALLBACK);
}

function looseLabel(options: readonly { value: string; label: string }[] | undefined, value: string, fallback: Record<string, string>): string {
  return options?.find((o) => o.value === value)?.label ?? fallback[value] ?? value;
}

/* ---------- the four stat cards ---------- */

export type StatModel = {
  label: string;
  /** A number counts up; a string shows as is. */
  value: number | string;
  sub: string;
};

/** Stage: the derived stage (or Live), with the target go-live date under it. */
export function stageStat(bundle: ClientBundle, labels: StatLabels = {}, now: Date = new Date()): StatModel {
  const { client } = bundle;
  const run = bundle.onboarding?.run ?? null;
  const target = run?.targetLiveDate ? `target ${formatCalendarDate(run.targetLiveDate, now)}` : 'no target date';
  if (client.status === 'live') {
    return { label: 'Stage', value: 'Live', sub: client.liveDate ? `live ${formatCalendarDate(client.liveDate, now)}` : target };
  }
  if (!run) return { label: 'Stage', value: 'Not started', sub: 'no onboarding run' };
  return { label: 'Stage', value: stageLabel(run.derivedStage, labels.stages), sub: target };
}

/** Checklist: required tasks done of total, and how many wait on the client. */
export function checklistStat(bundle: ClientBundle): StatModel {
  const run = bundle.onboarding?.run ?? null;
  if (!run) return { label: 'Checklist', value: 'None', sub: 'no onboarding run' };
  return { label: 'Checklist', value: `${run.requiredDone}/${run.requiredTotal}`, sub: `${run.waitingOnClient} waiting on client` };
}

/** Booked calls: what counts right now (the server's number), against the guarantee target. */
export function callsStat(guarantee: Guarantee): StatModel {
  return { label: 'Booked calls', value: guarantee.counted, sub: guarantee.eligible ? `target ${guarantee.target}` : 'no guarantee' };
}

/**
 * Billing: the subscription ("Ending" while it cancels), else the latest
 * one-time order, else "no billing record". Only for people with
 * `clients.billing` (owners and managers); staff never get the card.
 */
export function billingStat(billing: Billing | null, labels: StatLabels = {}, now: Date = new Date()): StatModel {
  const sub = billing?.subscription ?? null;
  if (sub) {
    const amount = `${formatMoney(sub.amount)}/${sub.interval === 'year' ? 'yr' : 'mo'}`;
    const end = sub.currentPeriodEnd ? formatShortDate(sub.currentPeriodEnd, now) : null;
    const ending = sub.cancelAtPeriodEnd && sub.status !== 'canceled';
    const value = ending ? 'Ending' : looseLabel(labels.subscriptionStatuses, sub.status, SUBSCRIPTION_FALLBACK);
    let when: string | null = null;
    if (end) {
      if (ending) when = `ends ${end}`;
      else if (sub.status === 'canceled') when = `ended ${end}`;
      else if (sub.status === 'active' || sub.status === 'trialing') when = `renews ${end}`;
      else when = `period ends ${end}`;
    }
    return { label: 'Billing', value, sub: when ? `${amount} · ${when}` : amount };
  }
  const order = billing?.latestOrder ?? null;
  if (order) {
    const parts = [`${formatMoney(order.amount)} one-time`, order.paymentMethod].filter(Boolean);
    return { label: 'Billing', value: looseLabel(labels.orderStatuses, order.status, ORDER_FALLBACK), sub: parts.join(' · ') };
  }
  return { label: 'Billing', value: 'None', sub: 'no billing record' };
}

/** "Live. Guarantee clock started." The second sentence only when the clock is running for an eligible client. */
export function goLiveToast(guarantee: Pick<Guarantee, 'eligible' | 'clockStarted'>): string {
  return guarantee.eligible && guarantee.clockStarted ? 'Live. Guarantee clock started.' : 'Live.';
}

/* ---------- scroll math (section tabs) ---------- */

/** Offset for a section that has not reported its layout yet. */
export const UNMEASURED = Number.MAX_SAFE_INTEGER;

/**
 * The section being read: the last one whose top is at or above `line` (a
 * point just under the sticky tabs). Offsets are in tab order; unmeasured ones
 * never match, so the first section is the answer until layout arrives.
 */
export function activeSectionIndex(offsets: readonly number[], line: number): number {
  'worklet';
  let active = 0;
  for (let i = 0; i < offsets.length; i++) {
    const top = offsets[i] ?? UNMEASURED;
    if (top <= line) active = i;
  }
  return active;
}

/** Scroll offset that puts a section's top right under the sticky tabs. Never negative. */
export function jumpOffset(sectionTop: number, tabsHeight: number): number {
  'worklet';
  return Math.max(0, sectionTop - tabsHeight);
}

/**
 * Empty space after the last section so it, too, can scroll up under the tabs
 * (otherwise a short last section could never become the active tab).
 */
export function bottomFill(viewport: number, tabsHeight: number, lastHeight: number, bottomPadding: number): number {
  if (viewport <= 0 || lastHeight <= 0) return 0;
  return Math.max(0, Math.round(viewport - tabsHeight - lastHeight - bottomPadding));
}

/**
 * A block above the reader changed height (an async part loaded): how far to
 * scroll so what is on screen stays put. Zero when the block reaches into the
 * visible area, where the change is happening in front of the reader.
 */
export function anchorDelta(previous: { top: number; height: number }, nextHeight: number, scrollY: number, visibleTop: number): number {
  const delta = nextHeight - previous.height;
  if (delta === 0) return 0;
  return previous.top + previous.height <= scrollY + visibleTop ? delta : 0;
}
