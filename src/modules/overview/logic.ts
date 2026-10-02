import type { Href } from 'expo-router';

import type { BillingMeta, Subscription, SubscriptionStatus } from '@/api/schemas/billing';
import type { Lead, LeadSource, LeadStatus, LeadsMeta } from '@/api/schemas/leads';
import type { OverviewAttention } from '@/api/schemas/overview';
import type { Tone } from '@/design/tokens';
import { MAX_FONT_SCALE } from '@/design/typography';
import { formatShortDate } from '@/lib/dates';
import { formatCompact, formatCount, plural } from '@/lib/format';
import { formatMoney } from '@/lib/money';

/**
 * Pure helpers for the Home screen (brief 8.3), kept out of the components so
 * they can be unit tested: the "Needs you" cards, KPI formatting and the grid
 * columns, and the row text for recent leads and subscriptions.
 */

/* ---------- Needs you ---------- */

export type AttentionKey = keyof OverviewAttention;

/** The `view` param the Clients list reads to show the clients behind a card. */
export type ClientsView = 'blocked' | 'review' | 'intake' | 'behind';

export type AttentionCard = {
  key: AttentionKey;
  count: number;
  /** "3 intakes to review" reads as count + label. */
  label: string;
  href: Href;
  /** TalkBack hint: where the card goes. */
  hint: string;
};

/** Card order: the caller's own inbox first, then client work by how blocking it is. */
export const ATTENTION_ORDER: readonly AttentionKey[] = [
  'needsAction',
  'blockedOnboardings',
  'callsToReview',
  'intakesToReview',
  'behindPace',
];

const ATTENTION_LABELS: Record<AttentionKey, readonly [one: string, many: string]> = {
  needsAction: ['Notification needs action', 'Notifications need action'],
  blockedOnboardings: ['Onboarding blocked', 'Onboardings blocked'],
  callsToReview: ['CRM appointment to review', 'CRM appointments to review'],
  intakesToReview: ['Intake to review', 'Intakes to review'],
  behindPace: ['Client behind pace', 'Clients behind pace'],
};

const CLIENT_VIEWS: Record<Exclude<AttentionKey, 'needsAction'>, ClientsView> = {
  blockedOnboardings: 'blocked',
  callsToReview: 'review',
  intakesToReview: 'intake',
  behindPace: 'behind',
};

export function attentionHref(key: AttentionKey): Href {
  if (key === 'needsAction') return { pathname: '/inbox', params: { filter: 'action' } };
  return { pathname: '/customers', params: { segment: 'clients', view: CLIENT_VIEWS[key] } };
}

export function attentionLabel(key: AttentionKey, count: number): string {
  const [one, many] = ATTENTION_LABELS[key];
  return plural(count, one, many);
}

/** The cards to show: zero (or missing) counts are hidden. An empty list means "Nothing is waiting on you." */
export function attentionCards(attention: OverviewAttention): AttentionCard[] {
  return ATTENTION_ORDER.flatMap((key) => {
    const count = attention[key];
    if (!Number.isFinite(count) || count <= 0) return [];
    return [
      {
        key,
        count,
        label: attentionLabel(key, count),
        href: attentionHref(key),
        hint: key === 'needsAction' ? 'Opens the Inbox' : 'Opens the clients list',
      },
    ];
  });
}

/** Text never grows past 1.3x (Text caps it), and layouts never shrink below 1x. */
export function clampScale(fontScale: number): number {
  return Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE);
}

/** Card width at font scale 1: "CRM appointments" fits on the label's first line. */
const ATTENTION_CARD_BASE_WIDTH = 152;
/** Fixed parts of a card's height: padding (2 x 16), border (2 x 1), icon row (28) and the gaps (12 + 4). */
const ATTENTION_CARD_FIXED = 16 * 2 + 2 + 28 + 12 + 4;
/** Parts that grow with font scale: the count's 32dp line plus two 18dp label lines. */
const ATTENTION_CARD_TEXT = 32 + 18 * 2;

/**
 * The "Needs you" card size at this font scale, shared with the skeleton so
 * nothing moves when the counts land. The width grows with the text so every
 * label fits in two lines, and the height always holds two label lines, so
 * cards with one-line and two-line labels match.
 */
export function attentionCardSize(fontScale: number): { width: number; minHeight: number } {
  const scale = clampScale(fontScale);
  return {
    width: Math.round(ATTENTION_CARD_BASE_WIDTH * scale),
    minHeight: Math.ceil(ATTENTION_CARD_FIXED + ATTENTION_CARD_TEXT * scale),
  };
}

/* ---------- KPI grid ---------- */

/**
 * KPI numbers are exact up to 99,999. Above that the half-width card has no
 * room for every digit at large font sizes, so they read "124.8K".
 */
export function formatKpi(value: number): string {
  return Math.abs(value) >= 100_000 ? formatCompact(value) : formatCount(value);
}

/** Geist Mono 500 at 11sp with 18% tracking: about 8.6dp per character. */
const EYEBROW_CHAR_DP = 8.6;
/** The longest KPI label, "PAGEVIEWS 30D". */
const LONGEST_KPI_LABEL = 13;
/** Screen gutters (2 x 16), the gap between cards (12), card padding (2 x 16) and borders (2 x 1). */
const KPI_CHROME = 16 * 2 + 12;
const CARD_CHROME = 16 * 2 + 2;

/**
 * 2 x 2 by default. When the longest label would not fit a half-width card at
 * the current font scale (narrow phone at 1.3x), the cards stack in one column
 * instead of cutting the label off.
 */
export function kpiColumns(windowWidth: number, fontScale: number): 1 | 2 {
  const scale = clampScale(fontScale);
  const inner = (windowWidth - KPI_CHROME) / 2 - CARD_CHROME;
  return inner >= LONGEST_KPI_LABEL * EYEBROW_CHAR_DP * scale ? 2 : 1;
}

/* ---------- labels from GET /meta ---------- */

export type ToneLabel = { label: string; tone: Tone };

/** "past_due" to "Past due": the fallback while GET /meta has not loaded. */
export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

export function leadStatusBadge(meta: Pick<LeadsMeta, 'leadStatuses'> | undefined, status: LeadStatus): ToneLabel {
  const found = meta?.leadStatuses.find((s) => s.value === status);
  return found ? { label: found.label, tone: found.tone } : { label: humanize(status), tone: 'neutral' };
}

export function leadSourceLabel(meta: Pick<LeadsMeta, 'leadSources'> | undefined, source: LeadSource): string {
  return meta?.leadSources.find((s) => s.value === source)?.label ?? humanize(source);
}

export function subscriptionStatusBadge(
  meta: Pick<BillingMeta, 'billingSubscriptionStatuses'> | undefined,
  status: SubscriptionStatus,
): ToneLabel {
  const found = meta?.billingSubscriptionStatuses.find((s) => s.value === status);
  return found ? { label: found.label, tone: found.tone } : { label: humanize(status), tone: 'neutral' };
}

/* ---------- recent rows ---------- */

/** A lead's row title: the name, or the email when the form did not ask for one. */
export function leadTitle(lead: Pick<Lead, 'name' | 'email'>): string {
  return lead.name?.trim() || lead.email;
}

/** "Booked call · fall-promo": the source, then the UTM campaign when there is one. */
export function leadSourceLine(lead: Pick<Lead, 'source' | 'utm'>, meta: Pick<LeadsMeta, 'leadSources'> | undefined): string {
  const campaign = lead.utm.campaign?.trim();
  return [leadSourceLabel(meta, lead.source), campaign || null].filter(Boolean).join(' · ');
}

/** "$497/mo", "$4,970/yr". Integer cents from the server, never rounded. */
export function subscriptionAmount(sub: Pick<Subscription, 'amount' | 'interval'>): string {
  const text = formatMoney(sub.amount);
  return text ? `${text}${sub.interval === 'year' ? '/yr' : '/mo'}` : '';
}

/** "Grow", or "Grow · Ending Oct 30" while it is cancelling at the period end. */
export function subscriptionTierLine(
  sub: Pick<Subscription, 'productName' | 'cancelAtPeriodEnd' | 'currentPeriodEnd'>,
  now: Date,
): string {
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) return `${sub.productName} · Ending ${formatShortDate(sub.currentPeriodEnd, now)}`;
  return sub.productName;
}
