import { ApiError, errorMessage } from '@/api/errors';
import type {
  CrmAppStatus,
  CrmAttentionItem,
  CrmDirection,
  CrmHealth,
  CrmInspectSide,
  CrmJob,
  CrmLastReconcile,
  CrmMeta,
  CrmQueueName,
  CrmRunBy,
  CrmRunStatus,
  CrmSurface,
  CrmSwitch,
} from '@/api/schemas/crm';
import type { ConsentEvent, EmailMeta } from '@/api/schemas/email';
import type { Tone } from '@/design/tokens';
import { formatDateTime, relativeTime, todayToronto, toDate, torontoDateOf } from '@/lib/dates';
import { countLabel, formatCount, plural } from '@/lib/format';

/**
 * Pure helpers for CRM sync (brief 8.11): the brief's copy, labels from GET
 * /meta with the brief's tables as the fallback, badge and toast wording, and
 * the contact inspector's comparison rows. Always "the CRM", never a vendor.
 */

/* ---------- copy (brief 8.11, exact) ---------- */

export const VERIFYING = 'Checking, about 20 seconds';
export const RECONCILING = 'Checking every contact';
export const SYNCING = 'Syncing with the CRM';
export const NO_RUNS = 'Nothing has run yet. The first run happens after a switch is turned on.';
export const NO_RECONCILE = 'Has not run yet. It runs every night once the Reconcile switch is on.';
export const NOTHING_STUCK = 'Nothing is stuck.';
export const DISCARD_ONE = 'Stop trying this one for good? It stays on record, it is not deleted.';
export const RESUBSCRIBE = 'They asked to come back, resubscribe them';
export const LONG_JOB_NOTE = 'Up to 2 minutes. You can keep using the app.';
export const VERIFY_FIRST = 'Verify the connection first.';
export const DEFAULT_INSTALL_URL = 'https://www.tekmadev.com/admin/crm';

/** The three switch cards: what each one does, word for word. */
export const SWITCH_DESCRIPTIONS: Record<CrmSurface, string> = {
  outbound:
    'Pushes leads, subscribers, bookings and clients as contacts, and every unsubscribe as email DND. Turning it on queues everyone once.',
  inbound: 'Applies CRM unsubscribes here and brings client appointments in for review.',
  reconcile:
    'Checks every contact on both sides and applies missed unsubscribes. Stops if one night would unsubscribe more than a fifth of the list.',
};

/** A long job that outlived the 2 minute timeout may still finish on the server: never "try again". */
export const JOB_TIMEOUT: Record<'verify' | 'sync' | 'reconcile', string> = {
  verify: 'The check is taking longer than 2 minutes. It may still finish; the run log shows it when it does.',
  sync: 'The sync is taking longer than 2 minutes. It may still finish; the run log shows it when it does.',
  reconcile: 'The reconcile is taking longer than 2 minutes. It may still finish; the run log shows it when it does.',
};

/* ---------- labels from GET /meta (the brief's tables until it loads) ---------- */

type Labelled<V extends string> = readonly { value: V; label: string }[] | undefined;
type TonedLabelled<V extends string> = readonly { value: V; label: string; tone: Tone }[] | undefined;
export type ToneLabel = { label: string; tone: Tone };

/** "past_due" to "Past due": for a value the app does not know yet. */
export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

function labelOf<V extends string>(list: Labelled<V>, fallback: Partial<Record<V, string>>, value: V): string {
  return list?.find((o) => o.value === value)?.label ?? fallback[value] ?? humanize(value);
}

function toneLabelOf<V extends string>(list: TonedLabelled<V>, fallback: Partial<Record<V, ToneLabel>>, value: V): ToneLabel {
  const found = list?.find((o) => o.value === value);
  if (found) return { label: found.label, tone: found.tone };
  return fallback[value] ?? { label: humanize(value), tone: 'neutral' };
}

const HEALTH: Record<CrmHealth, ToneLabel> = {
  not_connected: { label: 'Not connected', tone: 'muted' },
  token_rejected: { label: 'Token rejected', tone: 'neutral' },
  verified: { label: 'Verified', tone: 'ok' },
  not_verified: { label: 'Not verified', tone: 'neutral' },
};
const APP: Record<CrmAppStatus, string> = {
  installed_here: 'Installed on our account',
  installed_elsewhere: 'Installed on another account',
  not_installed: 'Not installed',
};
/** GET /meta sends no tone for the app status: installed here is good, elsewhere needs fixing. */
const APP_TONE: Record<CrmAppStatus, Tone> = { installed_here: 'ok', installed_elsewhere: 'warn', not_installed: 'neutral' };
const SURFACE: Record<CrmSurface, string> = { outbound: 'Outbound', inbound: 'Inbound', reconcile: 'Nightly reconcile' };
const JOB: Record<CrmJob, string> = { push: 'Push', inbound: 'Inbound', reconcile: 'Reconcile', backfill: 'Backfill', verify: 'Verify' };
const BY: Record<CrmRunBy, string> = { schedule: 'Schedule', signup: 'Signup', you: 'You' };
const RUN_STATUS: Record<CrmRunStatus, ToneLabel> = {
  ok: { label: 'ok', tone: 'ok' },
  running: { label: 'running', tone: 'neutral' },
  partial: { label: 'part done', tone: 'warn' },
  error: { label: 'error', tone: 'signal' },
};
const DIRECTION: Record<CrmDirection, string> = { to_crm: 'To the CRM', from_crm: 'From the CRM' };

type MetaLike = Partial<CrmMeta> | undefined;

export const healthBadge = (meta: MetaLike, health: CrmHealth) => toneLabelOf(meta?.crmHealth, HEALTH, health);
export const appBadge = (meta: MetaLike, status: CrmAppStatus): ToneLabel => ({
  label: labelOf(meta?.crmAppStatuses, APP, status),
  tone: APP_TONE[status] ?? 'neutral',
});
export const surfaceLabel = (meta: MetaLike, surface: CrmSurface) => labelOf(meta?.crmSurfaces, SURFACE, surface);
export const jobLabel = (meta: MetaLike, job: CrmJob) => labelOf(meta?.crmJobs, JOB, job);
export const byLabel = (meta: MetaLike, by: CrmRunBy) => labelOf(meta?.crmRunBy, BY, by);
export const runStatusBadge = (meta: MetaLike, status: CrmRunStatus) => toneLabelOf(meta?.crmRunStatuses, RUN_STATUS, status);
export const directionLabel = (meta: MetaLike, direction: CrmDirection) => labelOf(meta?.crmDirections, DIRECTION, direction);

/* ---------- connection ---------- */

/** "just now", "5 min ago", "3 h ago" today (Toronto); "Sep 28, 2:41 PM" before today. */
export function whenText(at: string, now: Date): string {
  const then = toDate(at);
  if (!then) return '';
  // A server clock a moment ahead reads as now.
  if (then.getTime() >= now.getTime()) return 'just now';
  if (torontoDateOf(then) === todayToronto(now)) return relativeTime(then, now);
  return formatDateTime(then, now);
}

/** "Last checked 5 min ago", or "Not checked yet" before the first Verify. */
export function lastCheckedLine(checkedAt: string | null | undefined, now: Date): string {
  if (!checkedAt) return 'Not checked yet';
  const when = whenText(checkedAt, now);
  return when ? `Last checked ${when}` : 'Not checked yet';
}

/* ---------- switches ---------- */

/** Off (muted), Running (ok), or "On, not running" (signal, with the reason as a red warning). */
export function switchBadge(sw: CrmSwitch): ToneLabel {
  if (!sw.on) return { label: 'Off', tone: 'muted' };
  if (sw.running) return { label: 'Running', tone: 'ok' };
  return { label: 'On, not running', tone: 'signal' };
}

/** The warning under an "On, not running" switch: the server's reason, or a plain fallback. */
export function switchWarning(sw: CrmSwitch): string | null {
  if (!sw.on || sw.running) return null;
  return sw.error?.trim() ? sw.error.trim() : 'It is on but not running. Verify the connection, then check the run log.';
}

/**
 * The toast after a switch changes. Turning Outbound on adds how many existing
 * contacts were queued for their first push ("N existing contact(s) queued for their first push.").
 */
export function switchToast(label: string, on: boolean, queued?: number): string {
  const base = `${label} is ${on ? 'on' : 'off'}.`;
  if (!on || queued === undefined || queued <= 0) return base;
  return `${base} ${countLabel(queued, 'existing contact', 'existing contacts')} queued for their first push.`;
}

/* ---------- jobs ---------- */

export function syncDoneMessage(handled: number): string {
  return handled > 0 ? `Synced. ${countLabel(handled, 'item', 'items')} handled.` : 'Synced. Nothing was waiting.';
}

export function reconcileDoneMessage(corrected: number, halted: boolean): string {
  if (halted) return 'The safety stop fired, so nothing was changed. See the last reconcile.';
  return `Checked every contact, corrected ${formatCount(corrected)}.`;
}

/**
 * The failure toast for a long job, or null when nothing should show (a
 * cancelled request, or 401/403/426, which the client already handles).
 */
export function jobFailureMessage(error: unknown, timedOut: boolean, timeoutCopy: string): string | null {
  if (timedOut) return timeoutCopy;
  if (error instanceof ApiError) {
    if (error.kind === 'aborted' || error.status === 401 || error.status === 403 || error.status === 426) return null;
  }
  return errorMessage(error);
}

/* ---------- last reconcile ---------- */

export type ReconcileLine = { kind: 'ok'; text: string } | { kind: 'halted'; text: string; reason: string };

/** "<time>: checked N contacts, corrected M." or the safety-stop explanation. */
export function reconcileLine(last: CrmLastReconcile, now: Date): ReconcileLine {
  const when = formatDateTime(last.at, now);
  if (last.halted) {
    const reason = last.haltReason?.trim()
      ? last.haltReason.trim()
      : 'One night would have unsubscribed more than a fifth of the list, so it stopped without changing anything.';
    return { kind: 'halted', text: `${when}: the safety stop fired.`, reason };
  }
  return {
    kind: 'ok',
    text: `${when}: checked ${countLabel(last.checked, 'contact', 'contacts')}, corrected ${formatCount(last.corrected)}.`,
  };
}

/* ---------- needs attention ---------- */

export const attentionKey = (item: Pick<CrmAttentionItem, 'queue' | 'id'>) => `${item.queue}:${item.id}`;

/** Ids per queue, for POST /crm/retry and /crm/discard (one call per queue). */
export function groupByQueue(items: readonly CrmAttentionItem[]): { queue: CrmQueueName; ids: string[] }[] {
  const groups = new Map<CrmQueueName, string[]>();
  for (const item of items) {
    const ids = groups.get(item.queue) ?? [];
    if (!ids.includes(item.id)) ids.push(item.id);
    groups.set(item.queue, ids);
  }
  return Array.from(groups, ([queue, ids]) => ({ queue, ids }));
}

/** "5 tries", "1 try". */
export const triesLabel = (tries: number) => countLabel(tries, 'try', 'tries');

export function retryDoneMessage(count: number): string {
  return `${countLabel(count, 'item', 'items')} queued to try again.`;
}

export function discardDoneMessage(count: number): string {
  return count === 1 ? 'Discarded. It stays on record.' : `${countLabel(count, 'item', 'items')} discarded. They stay on record.`;
}

/** The brief's line for one item; the same promise in the plural for several. */
export function discardQuestion(count: number): string {
  if (count <= 1) return DISCARD_ONE;
  return `Stop trying these ${formatCount(count)} for good? They stay on record, they are not deleted.`;
}

/* ---------- merge fields ---------- */

/** The tag to paste in a CRM template: `{{contact.first_name}}`. */
export const mergeTag = (key: string) => `{{contact.${key}}}`;

/* ---------- contact inspector ---------- */

export const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

export type CompareRow = {
  key: 'canEmail' | 'status' | 'consented' | 'tags' | 'lastSynced' | 'contactId';
  label: string;
  site: string;
  /** Null when the CRM has no contact for this email. */
  crm: string | null;
  mono?: boolean;
  /** "Can be emailed" differs between the two sides. */
  disagree?: boolean;
};

const syncedText = (at: string | null, now: Date) => (at ? formatDateTime(at, now) : 'Never');
const tagsText = (tags: readonly string[]) => (tags.length > 0 ? tags.join(', ') : 'None');

/** The rows of "This site" vs "CRM": can be emailed, status, consented, tags, last synced, contact id. */
export function compareRows(site: CrmInspectSide, crm: CrmInspectSide | null, now: Date): CompareRow[] {
  return [
    {
      key: 'canEmail',
      label: 'Can be emailed',
      site: yesNo(site.canEmail),
      crm: crm ? yesNo(crm.canEmail) : null,
      disagree: crm !== null && crm.canEmail !== site.canEmail,
    },
    { key: 'status', label: 'Status', site: site.status, crm: crm ? crm.status : null },
    { key: 'consented', label: 'Consented', site: yesNo(site.consented), crm: crm ? yesNo(crm.consented) : null },
    { key: 'tags', label: 'Tags', site: tagsText(site.tags), crm: crm ? tagsText(crm.tags) : null },
    { key: 'lastSynced', label: 'Last synced', site: syncedText(site.lastSyncedAt, now), crm: crm ? syncedText(crm.lastSyncedAt, now) : null },
    { key: 'contactId', label: 'Contact id', site: site.contactId ?? 'None', crm: crm ? (crm.contactId ?? 'None') : null, mono: true },
  ];
}

/* ---------- consent history ---------- */

const CONSENT_EVENT: Record<ConsentEvent['event'], string> = {
  subscribed: 'Subscribed',
  resubscribed: 'Resubscribed',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Marked as spam',
  reason: 'Said why they left',
};
const UNSUBSCRIBE_SOURCE: Record<string, string> = {
  unsubscribe_page: 'via the unsubscribe page',
  crm: 'via the CRM',
  crm_permanent: 'via the CRM, as permanent',
  admin: 'via the admin',
};
const REASON: Record<string, string> = {
  too_many: 'Too many emails',
  not_relevant: 'Not relevant to me',
  never_signed_up: 'I never signed up',
  other: 'Something else',
};

type EmailMetaLike = Partial<Pick<EmailMeta, 'consentEvents' | 'unsubscribeSources' | 'subscriberSources' | 'unsubscribeReasons'>> | undefined;

export type ConsentLine = { title: string; detail: string };

/**
 * One consent history entry: "Unsubscribed" with "via the CRM · Too many emails · Policy 2026-04".
 * Unsubscribes name where they came from; signups name their source.
 */
export function consentLine(meta: EmailMetaLike, event: ConsentEvent): ConsentLine {
  const title = labelOf(meta?.consentEvents, CONSENT_EVENT, event.event);
  const parts: string[] = [];
  const source = event.source.trim();
  if (source) {
    const unsubscribeSide = event.event === 'unsubscribed' || event.event === 'reason';
    const fromUnsub = meta?.unsubscribeSources?.find((s) => s.value === source)?.label ?? UNSUBSCRIBE_SOURCE[source];
    const fromSignup = meta?.subscriberSources?.find((s) => s.value === source)?.label;
    parts.push(unsubscribeSide ? (fromUnsub ?? fromSignup ?? humanize(source)) : (fromSignup ?? fromUnsub ?? humanize(source)));
  }
  if (event.reason) parts.push(meta?.unsubscribeReasons?.find((r) => r.value === event.reason)?.label ?? REASON[event.reason] ?? humanize(event.reason));
  if (event.policyVersion) parts.push(`Policy ${event.policyVersion}`);
  return { title, detail: parts.join(' · ') };
}

/** A count for a section header ("3 stuck"). */
export const stuckCount = (n: number) => `${formatCount(n)} ${plural(n, 'item', 'items')}`;
