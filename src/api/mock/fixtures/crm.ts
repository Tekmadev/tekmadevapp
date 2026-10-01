import type { SubscriberStatus, UnsubscribeSource } from '../../schemas/email';
import type {
  CrmApp,
  CrmAttentionItem,
  CrmConnection,
  CrmHealth,
  CrmInspect,
  CrmInspectSide,
  CrmLastReconcile,
  CrmMergeField,
  CrmProbeResult,
  CrmRun,
  CrmStatus,
  CrmSurface,
  CrmSwitch,
} from '../../schemas/crm';
import { daysAgo, hoursAgo, minutesAgo } from '../router';
import { consentFor, erasedEmails, findSubscriberByEmail, subscribers } from './email';

/**
 * Fixtures for the "crm" domain. Realistic data, same shapes as the live API.
 * Mutable in-memory state: the CRM routes and the email routes (unsubscribe,
 * erase) change it, so the queue, run log and contact inspector stay consistent.
 *
 * Tests may flip the scenario fields (`configured`, `tokenAccepted`,
 * `failingProbes`, `upstreamDown`, `pendingDrift`) to reach every state.
 * Never name the CRM vendor here: it is "the CRM".
 */

export type OutboxAction = 'upsert' | 'dnd' | 'erase';
export type OutboxItem = { id: string; email: string; action: OutboxAction; queuedAt: string };
export type InboxAction = 'unsubscribe' | 'appointment';
export type InboxItem = { id: string; email: string; action: InboxAction; queuedAt: string };

/** The CRM's own copy of a contact (what the inspector's "CRM" column shows). */
export type CrmContact = {
  contactId: string;
  canEmail: boolean;
  /** DND set as permanent in the CRM. */
  dndPermanent: boolean;
  consented: boolean;
  tags: string[];
  updatedAt: string;
};

export const MERGE_FIELDS: CrmMergeField[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'full_name', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company_name', label: 'Business name' },
  { key: 'website', label: 'Website' },
  { key: 'city', label: 'City' },
  { key: 'lead_source', label: 'Lead source' },
  { key: 'plan_name', label: 'Plan' },
  { key: 'booking_link', label: 'Booking link' },
  { key: 'tool_leak_estimate', label: 'Free tool estimate' },
];

/** Every check Verify runs, in checklist order. */
const PROBES: { key: string; sentence: string; failure: string; detail: string }[] = [
  { key: 'token', sentence: 'The CRM accepted the token.', failure: 'The CRM rejected the token.', detail: 'It answered 401. The token was revoked or mistyped.' },
  { key: 'account', sentence: 'The token belongs to the Tekmadev account.', failure: 'The token belongs to another account.', detail: 'Use a token from the Tekmadev account, not a client account.' },
  { key: 'contacts_read', sentence: 'We can read contacts.', failure: 'We cannot read contacts.', detail: 'The token is missing the contacts read scope.' },
  { key: 'contacts_write', sentence: 'We can create and update contacts.', failure: 'We cannot create or update contacts.', detail: 'The token is missing the contacts write scope.' },
  { key: 'dnd', sentence: 'We can turn email DND on and off.', failure: 'We cannot change email DND.', detail: 'The token is missing the contacts write scope.' },
  { key: 'tags', sentence: 'We can add and remove tags.', failure: 'We cannot change tags.', detail: 'The token is missing the tags scope.' },
  { key: 'fields', sentence: 'All 12 merge fields exist in the CRM.', failure: 'Some merge fields are missing in the CRM.', detail: 'Missing: plan_name, tool_leak_estimate.' },
  { key: 'webhook', sentence: 'The webhook app is installed on our account and signs its messages.', failure: 'The webhook app is not sending signed messages.', detail: 'Install it from the website CRM page, on the Tekmadev account.' },
];

const HEALTH_EXPLANATION: Record<CrmHealth, string> = {
  not_connected: 'No CRM token is set on the server yet. Add one on the website first.',
  token_rejected: 'The CRM rejected the token. Paste a new one on the website, then verify again.',
  verified: 'Connected and verified. Every check passed.',
  not_verified: 'Connected, but some checks failed. Fix them, then verify again.',
};

const APP_EXPLANATION: Record<CrmApp['status'], string> = {
  installed_here: 'Installed on the Tekmadev account. Unsubscribes and appointments reach us within a minute.',
  installed_elsewhere: 'Installed on another account, so its messages are ignored. Install it on the Tekmadev account.',
  not_installed: 'Not installed. Inbound sync only works once it is installed on the Tekmadev account.',
};

function probeResults(): CrmProbeResult[] {
  return PROBES.map((p, i) => {
    // A rejected token fails the first check and makes the rest impossible to run.
    const failed = crmState.tokenAccepted ? crmState.failingProbes.includes(p.key) : i === 0;
    if (!crmState.tokenAccepted && i > 0) return { key: p.key, ok: false, sentence: p.failure, detail: 'Not checked: the token was rejected.' };
    return failed ? { key: p.key, ok: false, sentence: p.failure, detail: p.detail } : { key: p.key, ok: true, sentence: p.sentence };
  });
}

let counter = 0;
export const crmId = (prefix: string) => {
  counter += 1;
  return `${prefix}_${counter.toString(36).padStart(6, '0')}`;
};

/** A stable CRM contact id per email. */
function contactIdFor(email: string): string {
  let h = 2166136261;
  for (let i = 0; i < email.length; i++) h = Math.imul(h ^ email.charCodeAt(i), 16777619) >>> 0;
  return `ct_${h.toString(36).padStart(7, '0')}`;
}

const sw = (on: boolean, running: boolean, lastRunAt: string | null, error?: string): CrmSwitch =>
  error ? { on, running, lastRunAt, error } : { on, running, lastRunAt };

export const crmState = {
  /** A CRM token is set on the server. */
  configured: true,
  /** Scenario: the CRM accepts the token. */
  tokenAccepted: true,
  /** Scenario: probe keys that fail on the next Verify. */
  failingProbes: [] as string[],
  /** Scenario: the CRM does not answer (verify, sync and reconcile fail with 502). */
  upstreamDown: false,
  health: 'verified' as CrmHealth,
  probe: { checkedAt: daysAgo(6, 2), results: PROBES.map((p) => ({ key: p.key, ok: true, sentence: p.sentence })) } as CrmConnection['probe'],
  switches: {
    outbound: sw(true, true, minutesAgo(3)),
    inbound: sw(true, true, minutesAgo(1)),
    // Stopped by last night's safety stop: on, but not running.
    reconcile: sw(true, false, hoursAgo(9), 'Stopped by the safety stop last night. Check the CRM, then run it now.'),
  } as Record<CrmSurface, CrmSwitch>,
  app: { status: 'installed_here', explanation: APP_EXPLANATION.installed_here } as CrmApp,
  outbox: [] as OutboxItem[],
  inbox: [] as InboxItem[],
  /** Rolling 7 day counters. */
  pushed7d: 1284,
  applied7d: 37,
  runs: [] as CrmRun[],
  lastReconcile: {
    at: hoursAgo(9),
    checked: 412,
    corrected: 0,
    halted: true,
    haltReason: 'It would have unsubscribed 97 of 412 contacts (more than a fifth), so it stopped without changing anything.',
  } as CrmLastReconcile | null,
  /** Scenario: contacts the next reconcile would unsubscribe or correct. */
  pendingDrift: 3,
  attention: [] as CrmAttentionItem[],
  /** Discarded items stay on record; they are never deleted. */
  discarded: [] as CrmAttentionItem[],
};

/** The CRM's contacts by lowercase email. */
export const crmContacts = new Map<string, CrmContact>();

/* ------------------------------------------------------------------ */
/* Seed                                                                 */
/* ------------------------------------------------------------------ */

(function seed() {
  for (const s of subscribers) {
    if (!s.inCrm) continue;
    const active = s.status === 'active';
    crmContacts.set(s.email.toLowerCase(), {
      contactId: contactIdFor(s.email),
      canEmail: active,
      dndPermanent: s.unsubscribeSource === 'crm_permanent' || s.status === 'complained',
      consented: active,
      tags: active ? ['subscriber', `source-${s.source.replace(/_/g, '-')}`] : [`source-${s.source.replace(/_/g, '-')}`],
      updatedAt: s.unsubscribedAt ?? s.signedUpAt,
    });
  }
  // They asked to come back: unsubscribed here, mailable again in the CRM.
  const noah = crmContacts.get('noah.singh@mailbox.test');
  if (noah) Object.assign(noah, { canEmail: true, consented: true, tags: [...noah.tags, 'subscriber', 'asked-to-return'], updatedAt: daysAgo(1, 5) });
  // Bounced here, yet mailable in the CRM: the sides disagree, but a bounce can never be revived.
  const chloe = crmContacts.get('chloe.roy@mailbox.test');
  if (chloe) Object.assign(chloe, { canEmail: true, consented: true, tags: [...chloe.tags, 'subscriber'], updatedAt: daysAgo(30) });
  // Erased here, but the suppression push is stuck (see Needs attention): still mailable there.
  crmContacts.set('former.customer@mailbox.test', {
    contactId: contactIdFor('former.customer@mailbox.test'),
    canEmail: true,
    dndPermanent: false,
    consented: true,
    tags: ['subscriber', 'source-checkout'],
    updatedAt: daysAgo(64),
  });

  // Contacts never pushed are waiting for their first push; one unsubscribe is waiting for its DND.
  for (const s of subscribers) {
    if (!s.inCrm && !erasedEmails.has(s.email.toLowerCase())) {
      crmState.outbox.push({ id: crmId('obx'), email: s.email, action: 'upsert', queuedAt: minutesAgo(2) });
    }
  }
  crmState.outbox.push({ id: crmId('obx'), email: 'ava.nguyen@mailbox.test', action: 'dnd', queuedAt: minutesAgo(1) });
  crmState.inbox.push({ id: crmId('ibx'), email: 'owen.b@mailbox.test', action: 'unsubscribe', queuedAt: minutesAgo(1) });

  crmState.attention.push(
    {
      id: 'att_out00001',
      queue: 'outbox',
      what: 'Push contact',
      direction: 'to_crm',
      who: 'hugo@kanatapest.test',
      tries: 5,
      why: 'The CRM rejected the phone number format (+1 613 555 0147 ext 2).',
      at: hoursAgo(6),
      signed: true,
    },
    {
      id: 'att_out00002',
      queue: 'outbox',
      what: 'Turn on email DND (unsubscribe)',
      direction: 'to_crm',
      who: 'mia.c@mailbox.test',
      tries: 5,
      why: 'The CRM contact was merged into another one. The old contact id no longer exists.',
      at: daysAgo(1, 2),
      signed: true,
    },
    {
      id: 'att_out00003',
      queue: 'outbox',
      what: 'Suppress and tag erased',
      direction: 'to_crm',
      who: 'former.customer@mailbox.test',
      tries: 3,
      why: 'The CRM answered "too many requests" three times in a row.',
      at: hoursAgo(14),
      signed: true,
    },
    {
      id: 'att_in000001',
      queue: 'inbox',
      what: 'Unsubscribe from the CRM',
      direction: 'from_crm',
      who: 'zoe.ahmed@mailbox.test',
      tries: 1,
      why: 'The message signature did not match, so it was not applied.',
      at: hoursAgo(3),
      signed: false,
    },
    {
      id: 'att_in000002',
      queue: 'inbox',
      what: 'Appointment for review',
      direction: 'from_crm',
      who: 'Bytown Roofing Co. (marc@bytownroofing.test)',
      tries: 2,
      why: 'No client is mapped to that CRM calendar.',
      at: daysAgo(2, 4),
      signed: true,
    },
  );

  crmState.runs.push(
    { id: 'run_00000001', job: 'verify', startedAt: daysAgo(6, 2), by: 'you', result: 'All 8 checks passed.', status: 'ok' },
    { id: 'run_00000002', job: 'backfill', startedAt: daysAgo(6, 1.9), by: 'you', result: 'Queued 386 existing contacts for their first push.', status: 'ok' },
    { id: 'run_00000003', job: 'inbound', startedAt: daysAgo(1, 7), by: 'schedule', result: 'The CRM did not answer in time. It tries again on the next run.', status: 'error' },
    { id: 'run_00000004', job: 'reconcile', startedAt: hoursAgo(9), by: 'schedule', result: 'Safety stop: would have unsubscribed 97 of 412 contacts. Nothing changed.', status: 'error' },
    { id: 'run_00000005', job: 'push', startedAt: hoursAgo(2), by: 'schedule', result: 'Pushed 14 contacts. 1 failed and needs attention.', status: 'partial' },
    { id: 'run_00000006', job: 'push', startedAt: minutesAgo(26), by: 'signup', result: 'Pushed 1 contact (new lead).', status: 'ok' },
    { id: 'run_00000007', job: 'inbound', startedAt: minutesAgo(9), by: 'schedule', result: 'Applied 2 unsubscribes. Brought in 1 appointment for review.', status: 'ok' },
    { id: 'run_00000008', job: 'push', startedAt: minutesAgo(3), by: 'schedule', result: 'Pushed 3 contacts.', status: 'ok' },
  );
})();

/* ------------------------------------------------------------------ */
/* Behaviour shared by the routes                                       */
/* ------------------------------------------------------------------ */

/** Queue a push to the CRM (unless the address was erased, which only ever queues its suppression). */
export function queueOutbox(email: string, action: OutboxAction, at: string) {
  crmState.outbox.push({ id: crmId('obx'), email, action, queuedAt: at });
}

/** Drops anything still queued for an address (an erased address is only ever suppressed). */
export function dropQueued(email: string) {
  const needle = email.toLowerCase();
  crmState.outbox = crmState.outbox.filter((o) => o.email.toLowerCase() !== needle);
}

export function addRun(run: Omit<CrmRun, 'id'>): CrmRun {
  const record = { id: crmId('run'), ...run };
  crmState.runs.push(record);
  return record;
}

/** Runs Verify against the current scenario and stores the result. */
export function verifyConnection(at: string): CrmConnection {
  const results = probeResults();
  const failed = results.filter((r) => !r.ok).length;
  crmState.health = !crmState.tokenAccepted ? 'token_rejected' : failed > 0 ? 'not_verified' : 'verified';
  crmState.probe = { checkedAt: at, results };
  crmState.app = crmState.failingProbes.includes('webhook') ? { status: 'not_installed', explanation: APP_EXPLANATION.not_installed } : { status: 'installed_here', explanation: APP_EXPLANATION.installed_here };
  for (const surface of ['outbound', 'inbound', 'reconcile'] as const) {
    const current = crmState.switches[surface];
    if (!current.on) continue;
    if (crmState.health !== 'verified') {
      crmState.switches[surface] = sw(true, false, current.lastRunAt, 'Stopped: the connection is not verified. Fix it, then verify again.');
    } else if (surface !== 'reconcile' || !crmState.lastReconcile?.halted) {
      // A safety stop stays until a reconcile run succeeds.
      crmState.switches[surface] = sw(true, true, current.lastRunAt);
    }
  }
  addRun({
    job: 'verify',
    startedAt: at,
    by: 'you',
    result: !crmState.tokenAccepted ? 'The CRM rejected the token.' : failed > 0 ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`,
    status: !crmState.tokenAccepted ? 'error' : failed > 0 ? 'partial' : 'ok',
  });
  return connection();
}

export function connection(): CrmConnection {
  const health: CrmHealth = crmState.configured ? crmState.health : 'not_connected';
  return {
    configured: crmState.configured,
    health,
    explanation: HEALTH_EXPLANATION[health],
    probe: crmState.configured ? crmState.probe : null,
  };
}

/** Subscribers whose contact was never pushed and is not queued yet ("queues everyone once"). */
export function queueNeverPushed(at: string): number {
  const queued = new Set(crmState.outbox.filter((o) => o.action === 'upsert').map((o) => o.email.toLowerCase()));
  let count = 0;
  for (const s of subscribers) {
    const email = s.email.toLowerCase();
    if (s.inCrm || queued.has(email) || erasedEmails.has(email)) continue;
    queueOutbox(s.email, 'upsert', at);
    count += 1;
  }
  return count;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function crmStatus(): CrmStatus {
  const waitingToPush = crmState.outbox.length;
  const waitingToApply = crmState.inbox.length;
  return {
    connection: connection(),
    switches: { ...crmState.switches },
    app: crmState.app,
    mergeFields: MERGE_FIELDS,
    queue: {
      waitingToPush: { count: waitingToPush, sub: waitingToPush ? 'Goes out on the next run' : 'Nothing waiting' },
      pushed: { count: crmState.pushed7d, sub: 'In the last 7 days' },
      waitingToApply: { count: waitingToApply, sub: waitingToApply ? 'Unsubscribes and appointments from the CRM' : 'Nothing waiting' },
      applied: { count: crmState.applied7d, sub: 'In the last 7 days' },
    },
    runs: [...crmState.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 6),
    lastReconcile: crmState.lastReconcile,
    attention: [...crmState.attention].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

/* ------------------------------------------------------------------ */
/* Contact inspector                                                    */
/* ------------------------------------------------------------------ */

const SITE_STATUS: Record<SubscriberStatus, string> = {
  active: 'Active',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Marked as spam',
};
const SOURCE_SUFFIX: Record<UnsubscribeSource, string> = {
  unsubscribe_page: 'via the unsubscribe page',
  crm: 'via the CRM',
  crm_permanent: 'via the CRM, as permanent',
  admin: 'via the admin',
};

function crmSide(contact: CrmContact): CrmInspectSide {
  return {
    canEmail: contact.canEmail,
    status: contact.canEmail ? 'Mailable' : contact.dndPermanent ? 'Email DND on, permanent' : 'Email DND on',
    consented: contact.consented,
    tags: [...contact.tags],
    lastSyncedAt: contact.updatedAt,
    contactId: contact.contactId,
  };
}

/** The side-by-side comparison for one address. */
export function inspectContact(rawEmail: string): CrmInspect {
  const email = rawEmail.trim().toLowerCase();
  const subscriber = findSubscriberByEmail(email);
  const contact = crmContacts.get(email);
  const erased = erasedEmails.has(email);
  const crm = contact ? crmSide(contact) : null;

  let site: CrmInspectSide;
  if (subscriber) {
    const suffix = subscriber.status === 'unsubscribed' && subscriber.unsubscribeSource ? ` ${SOURCE_SUFFIX[subscriber.unsubscribeSource]}` : '';
    site = {
      canEmail: subscriber.status === 'active',
      status: `${SITE_STATUS[subscriber.status]}${suffix}`,
      consented: subscriber.status === 'active',
      tags: subscriber.status === 'active' ? ['subscriber', `source-${subscriber.source.replace(/_/g, '-')}`] : [`source-${subscriber.source.replace(/_/g, '-')}`],
      lastSyncedAt: subscriber.inCrm && contact ? contact.updatedAt : null,
      contactId: subscriber.inCrm && contact ? contact.contactId : null,
    };
  } else {
    site = { canEmail: false, status: erased ? 'Erased' : 'Not a subscriber', consented: false, tags: erased ? ['erased'] : [], lastSyncedAt: null, contactId: null };
  }

  const result: CrmInspect = {
    email,
    site,
    crm,
    consentHistory: subscriber ? consentFor(subscriber.id) : [],
    canResubscribe: subscriber?.status === 'unsubscribed' && contact?.canEmail === true,
  };
  if (!contact) {
    const queued = crmState.outbox.some((o) => o.email.toLowerCase() === email && o.action === 'upsert');
    result.notFoundReason = queued ? 'No contact with this email in the CRM yet. It is queued for its first push.' : 'No contact with this email in the CRM.';
  }
  if (erased) result.erased = true;
  return result;
}

/* ------------------------------------------------------------------ */
/* GET /meta                                                            */
/* ------------------------------------------------------------------ */

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture = {
  crmHealth: [
    { value: 'not_connected' as const, label: 'Not connected', tone: 'muted' as const },
    { value: 'token_rejected' as const, label: 'Token rejected', tone: 'neutral' as const },
    { value: 'verified' as const, label: 'Verified', tone: 'ok' as const },
    { value: 'not_verified' as const, label: 'Not verified', tone: 'neutral' as const },
  ],
  crmAppStatuses: [
    { value: 'installed_here' as const, label: 'Installed on our account' },
    { value: 'installed_elsewhere' as const, label: 'Installed on another account' },
    { value: 'not_installed' as const, label: 'Not installed' },
  ],
  crmSurfaces: [
    { value: 'outbound' as const, label: 'Outbound' },
    { value: 'inbound' as const, label: 'Inbound' },
    { value: 'reconcile' as const, label: 'Nightly reconcile' },
  ],
  crmJobs: [
    { value: 'push' as const, label: 'Push' },
    { value: 'inbound' as const, label: 'Inbound' },
    { value: 'reconcile' as const, label: 'Reconcile' },
    { value: 'backfill' as const, label: 'Backfill' },
    { value: 'verify' as const, label: 'Verify' },
  ],
  crmRunBy: [
    { value: 'schedule' as const, label: 'Schedule' },
    { value: 'signup' as const, label: 'Signup' },
    { value: 'you' as const, label: 'You' },
  ],
  crmRunStatuses: [
    { value: 'ok' as const, label: 'ok', tone: 'ok' as const },
    { value: 'running' as const, label: 'running', tone: 'neutral' as const },
    { value: 'partial' as const, label: 'part done', tone: 'warn' as const },
    { value: 'error' as const, label: 'error', tone: 'signal' as const },
  ],
  crmDirections: [
    { value: 'to_crm' as const, label: 'To the CRM' },
    { value: 'from_crm' as const, label: 'From the CRM' },
  ],
  crmQueues: [
    { value: 'outbox' as const, label: 'Outbox' },
    { value: 'inbox' as const, label: 'Inbox' },
  ],
};
