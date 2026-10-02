import type { Call, Guarantee } from '@/api/schemas/clients';
import type { Tone } from '@/design/tokens';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';
import { formatPhone, plural, truncate } from '@/lib/format';

import { labelOf, toneOf, type ClientLabels } from '../labels';

/**
 * Copy for the Calls section (brief 8.5, section 7). Pure functions, so the
 * exact strings are unit tested.
 */

export const REVIEW_COUNT = 'Real prospect, count it';
export const REVIEW_AGREE = 'Agree, it does not count';
const SEP = ' · ';

/** Who the call is with: the contact name, else the phone or email. */
export function callTitle(call: Pick<Call, 'contactName' | 'phone' | 'email'>): string {
  return call.contactName?.trim() || (call.phone ? formatPhone(call.phone) : '') || call.email?.trim() || 'Unknown caller';
}

/**
 * The one action an unreviewed call offers. When the CRM sync preset a
 * disqualify reason, the question is whether you agree it does not count;
 * otherwise whether it is a real prospect.
 */
export function reviewAction(call: Pick<Call, 'disqualifiedReason'>): { counts: boolean; label: string } {
  return call.disqualifiedReason ? { counts: false, label: REVIEW_AGREE } : { counts: true, label: REVIEW_COUNT };
}

/** The review badge: "Needs review", "DQ: <reason>", "Counts", "Outside window". */
export function reviewBadge(call: Pick<Call, 'review' | 'counts' | 'disqualifiedReason'>, labels: ClientLabels): { label: string; tone: Tone } {
  switch (call.review) {
    case 'needs_review':
      return { label: labelOf(labels.callReviewStates, 'needs_review'), tone: toneOf(labels.callReviewStates, 'needs_review', 'gold') };
    case 'disqualified': {
      const reason = call.disqualifiedReason ? labelOf(labels.disqualifyReasons, call.disqualifiedReason) : null;
      return { label: reason ? `DQ: ${reason}` : 'DQ', tone: toneOf(labels.callReviewStates, 'disqualified', 'muted') };
    }
    case 'outside_window':
      return { label: labelOf(labels.callReviewStates, 'outside_window'), tone: toneOf(labels.callReviewStates, 'outside_window', 'muted') };
    case 'qualified':
      // A real prospect whose status keeps it from counting (cancelled, or not showed under the "showed" rule).
      return call.counts
        ? { label: labelOf(labels.callReviewStates, 'qualified'), tone: toneOf(labels.callReviewStates, 'qualified', 'ok') }
        : { label: 'Qualified', tone: 'neutral' };
  }
}

/** "CRM · booked Sep 28, 9:05 AM · for Oct 2, 10:00 AM · Roof repair" */
export function callDetailsLine(call: Pick<Call, 'source' | 'bookedAt' | 'bookedFor' | 'serviceRequested'>, labels: ClientLabels, now: Date = new Date()): string {
  return [
    labelOf(labels.callSources, call.source),
    `booked ${formatDateTime(call.bookedAt, now)}`,
    call.bookedFor ? `for ${formatDateTime(call.bookedFor, now)}` : null,
    call.serviceRequested?.trim() || null,
  ]
    .filter(Boolean)
    .join(SEP);
}

/** "(905) 555-0142 · maya@acme.ca · Wants a quote for the back deck" (empty when there is nothing). */
export function callContactLine(call: Pick<Call, 'phone' | 'email' | 'notes'>, notesMax = 90): string {
  return [call.phone ? formatPhone(call.phone) : null, call.email?.trim() || null, call.notes?.trim() ? truncate(call.notes.trim().replace(/\s+/g, ' '), notesMax) : null]
    .filter(Boolean)
    .join(SEP);
}

/** "12 / 30" for TalkBack: "12 of 30 calls counted". */
export function guaranteeSpoken(g: Pick<Guarantee, 'counted' | 'target'>): string {
  return `${g.counted} of ${g.target} ${plural(g.target, 'call', 'calls')} counted`;
}

/** "41 days in, 19 left, 20 expected by now", or "60 day window, clock not started". */
export function guaranteeProgressLine(g: Pick<Guarantee, 'clockStarted' | 'daysIn' | 'daysLeft' | 'expectedByNow' | 'windowDays'>): string {
  if (!g.clockStarted) return `${g.windowDays} day window, clock not started`;
  return `${g.daysIn} ${plural(g.daysIn, 'day', 'days')} in, ${g.daysLeft} left, ${g.expectedByNow} expected by now`;
}

/** "Counts booked calls · ends Nov 30" (or "Counts calls that showed" with the showed rule). */
export function guaranteeTermsLine(g: Pick<Guarantee, 'countRule' | 'endsOn'>, now: Date = new Date()): string {
  const rule = g.countRule === 'showed' ? 'Counts calls that showed' : 'Counts booked calls';
  return g.endsOn ? `${rule}${SEP}ends ${formatCalendarDate(g.endsOn, now)}` : rule;
}

/** The pace badge (Met, On pace, Behind pace); none before the clock starts or without a guarantee. */
export function paceBadge(g: Pick<Guarantee, 'status'>, labels: ClientLabels): { label: string; tone: Tone } | null {
  if (g.status !== 'met' && g.status !== 'on_pace' && g.status !== 'behind') return null;
  return { label: labelOf(labels.guaranteePaces, g.status), tone: toneOf(labels.guaranteePaces, g.status, g.status === 'behind' ? 'warn' : 'ok') };
}

/** The review banner (brief copy), singular for one appointment. */
export function reviewBannerText(count: number): string {
  return `${count} ${plural(count, 'appointment', 'appointments')} from the CRM waiting for your review. Nothing counts toward the guarantee until you confirm it.`;
}
