import type { ClientsMeta } from '@/api/schemas/clients';
import type { Tone } from '@/design/tokens';

/**
 * Labels and tones for the Calls, CRM, Team, Account and Activity sections.
 * GET /meta is the source of truth; these fallbacks (the brief's own words)
 * only cover the moment before meta has loaded, or a meta that failed, so a
 * badge never shows a raw enum value like "no_show".
 */

type Labelled = { value: string; label: string; tone?: Tone };

export type ClientLabels = Pick<
  ClientsMeta,
  | 'clientStatuses'
  | 'callStatuses'
  | 'callSources'
  | 'callReviewStates'
  | 'disqualifyReasons'
  | 'memberRoles'
  | 'memberStatuses'
  | 'guaranteeCountRules'
  | 'guaranteeStatuses'
  | 'guaranteePaces'
  | 'planOptions'
  | 'activityEvents'
>;

export const FALLBACK_LABELS: ClientLabels = {
  clientStatuses: [
    { value: 'lead', label: 'Lead', tone: 'muted' },
    { value: 'pending', label: 'Pending', tone: 'neutral' },
    { value: 'onboarding', label: 'Onboarding', tone: 'gold' },
    { value: 'live', label: 'Live', tone: 'ok' },
    { value: 'paused', label: 'Paused', tone: 'warn' },
    { value: 'churned', label: 'Churned', tone: 'muted' },
  ],
  callStatuses: [
    { value: 'booked', label: 'Booked', tone: 'neutral' },
    { value: 'confirmed', label: 'Confirmed', tone: 'gold' },
    { value: 'showed', label: 'Showed', tone: 'ok' },
    { value: 'no_show', label: 'No show', tone: 'warn' },
    { value: 'cancelled', label: 'Cancelled', tone: 'muted' },
    { value: 'rescheduled', label: 'Rescheduled', tone: 'neutral' },
  ],
  callSources: [
    { value: 'crm', label: 'CRM' },
    { value: 'manual', label: 'Manual' },
    { value: 'phone', label: 'Phone' },
    { value: 'website', label: 'Website' },
    { value: 'referral', label: 'Referral' },
    { value: 'other', label: 'Other' },
  ],
  callReviewStates: [
    { value: 'needs_review', label: 'Needs review', tone: 'gold' },
    { value: 'qualified', label: 'Counts', tone: 'ok' },
    { value: 'disqualified', label: 'DQ', tone: 'muted' },
    { value: 'outside_window', label: 'Outside window', tone: 'muted' },
  ],
  disqualifyReasons: [
    { value: 'spam', label: 'Spam' },
    { value: 'duplicate', label: 'Duplicate' },
    { value: 'out_of_area', label: 'Out of area' },
    { value: 'wrong_service', label: 'Wrong service' },
    { value: 'fake', label: 'Fake' },
    { value: 'other', label: 'Other' },
  ],
  memberRoles: [
    { value: 'owner', label: 'Owner' },
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
  ],
  memberStatuses: [
    { value: 'active', label: 'Active', tone: 'ok' },
    { value: 'invited', label: 'Invited', tone: 'gold' },
    { value: 'disabled', label: 'Disabled', tone: 'muted' },
  ],
  guaranteeCountRules: [
    { value: 'booked', label: 'Booked' },
    { value: 'showed', label: 'Showed' },
  ],
  guaranteeStatuses: [
    { value: 'not_started', label: 'Not started', tone: 'muted' },
    { value: 'running', label: 'Running', tone: 'gold' },
    { value: 'met', label: 'Met', tone: 'ok' },
    { value: 'missed', label: 'Missed', tone: 'signal' },
    { value: 'waived', label: 'Waived', tone: 'muted' },
  ],
  guaranteePaces: [
    { value: 'met', label: 'Met', tone: 'ok' },
    { value: 'on_pace', label: 'On pace', tone: 'ok' },
    { value: 'behind', label: 'Behind pace', tone: 'warn' },
    { value: 'not_started', label: 'Not started', tone: 'muted' },
    { value: 'n/a', label: 'n/a', tone: 'muted' },
  ],
  planOptions: [
    { id: 'convert', name: 'Convert', kind: 'growth', guarantee: false, needsCarePlan: false },
    { id: 'grow', name: 'Grow', kind: 'growth', guarantee: true, needsCarePlan: false },
    { id: 'lets-talk', name: "Let's Talk", kind: 'growth', guarantee: true, needsCarePlan: false },
    { id: 'webline', name: 'Webline', kind: 'product', guarantee: false, needsCarePlan: true },
  ],
  activityEvents: [
    { value: 'note', label: 'Internal note' },
    { value: 'update', label: 'Update to client' },
  ],
};

/** Meta's lists where present and non-empty, the fallbacks otherwise. */
export function resolveLabels(meta: Partial<ClientLabels> | undefined | null): ClientLabels {
  const pick = <K extends keyof ClientLabels>(key: K): ClientLabels[K] => {
    const list = meta?.[key];
    return list && list.length > 0 ? list : FALLBACK_LABELS[key];
  };
  return {
    clientStatuses: pick('clientStatuses'),
    callStatuses: pick('callStatuses'),
    callSources: pick('callSources'),
    callReviewStates: pick('callReviewStates'),
    disqualifyReasons: pick('disqualifyReasons'),
    memberRoles: pick('memberRoles'),
    memberStatuses: pick('memberStatuses'),
    guaranteeCountRules: pick('guaranteeCountRules'),
    guaranteeStatuses: pick('guaranteeStatuses'),
    guaranteePaces: pick('guaranteePaces'),
    planOptions: pick('planOptions'),
    activityEvents: pick('activityEvents'),
  };
}

/** "no_show" -> "No show", "call.logged" -> "Call logged": only for a value meta does not know yet. */
export function humanize(value: string): string {
  const text = value.replace(/[._-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

export function labelOf(list: readonly Labelled[], value: string | null | undefined): string {
  if (value == null) return '';
  return list.find((o) => o.value === value)?.label ?? humanize(value);
}

export function toneOf(list: readonly Labelled[], value: string | null | undefined, fallback: Tone = 'neutral'): Tone {
  if (value == null) return fallback;
  return list.find((o) => o.value === value)?.tone ?? fallback;
}

/** Select options from a labelled list (labels only; raw values are never shown). */
export function optionsOf<V extends string>(list: readonly { value: V; label: string }[]): { value: V; label: string }[] {
  return list.map((o) => ({ value: o.value, label: o.label }));
}
