import { zCrmQueueName, zCrmSurface, type CrmSwitch } from '../../schemas/crm';
import {
  addRun,
  connection,
  crmContacts,
  crmId,
  crmState,
  crmStatus,
  inspectContact,
  plural,
  queueNeverPushed,
  verifyConnection,
} from '../fixtures/crm';
import { addConsentEvent, CURRENT_POLICY_VERSION, findSubscriberByEmail } from '../fixtures/email';
import { bool, fail, isEmail, notFound, nowIso, ok, str, type MockResult, type MockRoute } from '../router';

/**
 * Mock routes for the "crm" domain (contract section 11, Marketing > CRM).
 * Owner only. Verify, Sync now and Run now are long jobs. Switches cannot be
 * turned on until the connection is verified. Every inspector lookup "calls
 * the CRM live" (slow). Never name the CRM vendor: it is "the CRM".
 * Rules the contract does not spell out are in docs/api-requests/crm.md.
 */

export const CRM_MESSAGES = {
  notConfigured: 'The CRM is not connected. Add the CRM token on the website first.',
  unverified: 'The CRM has not passed Verify yet. Verify the connection first.',
  probe: 'The check could not reach the CRM. Nothing changed. Try again in a moment.',
  sync: 'The sync could not reach the CRM. Nothing was lost: queued items stay queued.',
  reconcile: 'The reconcile could not reach the CRM. Nothing was changed.',
  nothing: 'Nothing to retry or discard.',
  resubRefused: 'Not resubscribed: bounced or complained addresses can never be revived.',
  resubNotFound: 'Not resubscribed: there is no subscriber with that email here.',
  resubStale: 'Not resubscribed: this changed since you looked them up. Look them up again.',
  email: 'Enter a valid email.',
} as const;

const notConfigured = () => fail(503, 'not_configured', CRM_MESSAGES.notConfigured);
const unverified = () => fail(422, 'unverified', CRM_MESSAGES.unverified);

/** The CRM must be connected (a token is set) for anything that talks to it. */
function needsConnection(): MockResult | null {
  if (!crmState.configured) return notConfigured();
  if (!crmState.tokenAccepted || crmState.health === 'token_rejected') return unverified();
  return null;
}

/** Switches, sync and reconcile also need a passed Verify. */
function needsVerified(): MockResult | null {
  if (!crmState.configured) return notConfigured();
  if (connection().health !== 'verified') return unverified();
  return null;
}

const sw = (on: boolean, running: boolean, lastRunAt: string | null, error?: string): CrmSwitch =>
  error ? { on, running, lastRunAt, error } : { on, running, lastRunAt };

function readBatch(body: Record<string, unknown>): { queue: 'outbox' | 'inbox'; ids: string[] } | MockResult {
  const queue = zCrmQueueName.safeParse(body.queue);
  if (!queue.success) return fail(400, 'queue', 'Pick the outbox or the inbox.', { queue: 'Pick the outbox or the inbox.' });
  const ids = body.ids;
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) {
    return fail(400, 'ids', 'Pick at least one item.', { ids: 'Pick at least one item.' });
  }
  return { queue: queue.data, ids: Array.from(new Set(ids)) };
}

const isResult = (value: object): value is MockResult => 'status' in value && 'body' in value;

/** Applies every queued push to the CRM's copy of the contacts. */
function pushOutbox(at: string): number {
  const items = crmState.outbox;
  for (const item of items) {
    const email = item.email.toLowerCase();
    const subscriber = findSubscriberByEmail(email);
    const contact = crmContacts.get(email);
    if (item.action === 'upsert' && subscriber) {
      const active = subscriber.status === 'active';
      subscriber.inCrm = true;
      crmContacts.set(email, {
        contactId: contact?.contactId ?? crmId('ct'),
        canEmail: active,
        dndPermanent: false,
        consented: active,
        tags: active ? ['subscriber', `source-${subscriber.source.replace(/_/g, '-')}`] : [`source-${subscriber.source.replace(/_/g, '-')}`],
        updatedAt: at,
      });
    } else if (item.action === 'dnd' && contact) {
      Object.assign(contact, { canEmail: false, consented: false, updatedAt: at });
    } else if (item.action === 'erase' && contact) {
      Object.assign(contact, { canEmail: false, dndPermanent: true, consented: false, tags: [...contact.tags.filter((t) => t !== 'subscriber'), 'erased'], updatedAt: at });
    }
  }
  crmState.outbox = [];
  crmState.pushed7d += items.length;
  return items.length;
}

/** Applies every queued change from the CRM here (unsubscribes; appointments go to review). */
function applyInbox(at: string): number {
  const items = crmState.inbox;
  for (const item of items) {
    if (item.action !== 'unsubscribe') continue;
    const subscriber = findSubscriberByEmail(item.email);
    if (!subscriber || subscriber.status !== 'active') continue;
    subscriber.status = 'unsubscribed';
    subscriber.unsubscribeSource = 'crm';
    subscriber.reason = null;
    subscriber.unsubscribedAt = at;
    addConsentEvent(subscriber.id, { at, event: 'unsubscribed', source: 'crm', policyVersion: CURRENT_POLICY_VERSION });
    const contact = crmContacts.get(item.email.toLowerCase());
    if (contact) Object.assign(contact, { canEmail: false, consented: false, updatedAt: at });
  }
  crmState.inbox = [];
  crmState.applied7d += items.length;
  return items.length;
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/crm',
    ownerOnly: true,
    latency: 'normal',
    handler: () => ok(crmStatus()),
  },
  {
    method: 'POST',
    path: '/crm/verify',
    ownerOnly: true,
    latency: 'long',
    jobMs: 6000,
    handler: () => {
      if (!crmState.configured) return notConfigured();
      if (crmState.upstreamDown) return fail(502, 'probe', CRM_MESSAGES.probe);
      return ok(verifyConnection(nowIso()));
    },
  },
  {
    method: 'PUT',
    path: '/crm/switches/:surface',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ params, body }) => {
      const surface = zCrmSurface.safeParse(params.surface);
      if (!surface.success) return notFound('That switch');
      const on = bool(body.on);
      if (on === undefined) return fail(400, 'on', 'Send on as true or false.', { on: 'Send on as true or false.' });
      const current = crmState.switches[surface.data];
      if (!on) {
        crmState.switches[surface.data] = sw(false, false, current.lastRunAt);
        return ok({ switch: crmState.switches[surface.data] });
      }
      const blocked = needsVerified();
      if (blocked) return blocked;
      crmState.switches[surface.data] = sw(true, true, current.lastRunAt);
      if (surface.data !== 'outbound') return ok({ switch: crmState.switches[surface.data] });
      // Turning Outbound on queues every contact that was never pushed, once.
      const at = nowIso();
      const queued = queueNeverPushed(at);
      if (queued > 0) {
        addRun({ job: 'backfill', startedAt: at, by: 'you', result: `Queued ${plural(queued, 'existing contact', 'existing contacts')} for their first push.`, status: 'ok' });
      }
      return ok({ switch: crmState.switches.outbound, queued });
    },
  },
  {
    method: 'POST',
    path: '/crm/sync',
    ownerOnly: true,
    latency: 'long',
    jobMs: 5000,
    handler: () => {
      const blocked = needsVerified();
      if (blocked) return blocked;
      if (crmState.upstreamDown) return fail(502, 'sync', CRM_MESSAGES.sync);
      const at = nowIso();
      let handled = 0;
      // Each direction only runs while its switch is on.
      if (crmState.switches.outbound.on) {
        const pushed = pushOutbox(at);
        handled += pushed;
        crmState.switches.outbound = { ...crmState.switches.outbound, lastRunAt: at };
        addRun({ job: 'push', startedAt: at, by: 'you', result: pushed ? `Pushed ${plural(pushed, 'contact', 'contacts')}.` : 'Nothing was waiting to push.', status: 'ok' });
      }
      if (crmState.switches.inbound.on) {
        const applied = applyInbox(at);
        handled += applied;
        crmState.switches.inbound = { ...crmState.switches.inbound, lastRunAt: at };
        addRun({ job: 'inbound', startedAt: at, by: 'you', result: applied ? `Applied ${plural(applied, 'change', 'changes')} from the CRM.` : 'Nothing was waiting to apply.', status: 'ok' });
      }
      return ok({ handled });
    },
  },
  {
    method: 'POST',
    path: '/crm/reconcile',
    ownerOnly: true,
    latency: 'long',
    jobMs: 7000,
    handler: () => {
      const blocked = needsVerified();
      if (blocked) return blocked;
      if (crmState.upstreamDown) return fail(502, 'reconcile', CRM_MESSAGES.reconcile);
      const at = nowIso();
      const checked = crmContacts.size;
      const current = crmState.switches.reconcile;
      // Safety stop: never unsubscribe more than a fifth of the list in one run.
      if (crmState.pendingDrift > checked / 5) {
        const haltReason = `It would have unsubscribed ${crmState.pendingDrift} of ${checked} contacts (more than a fifth), so it stopped without changing anything.`;
        crmState.lastReconcile = { at, checked, corrected: 0, halted: true, haltReason };
        if (current.on) crmState.switches.reconcile = sw(true, false, at, 'Stopped by the safety stop. Check the CRM, then run it now.');
        addRun({ job: 'reconcile', startedAt: at, by: 'you', result: `Safety stop: would have unsubscribed ${crmState.pendingDrift} of ${checked} contacts. Nothing changed.`, status: 'error' });
        return ok({ corrected: 0, halted: true });
      }
      const corrected = crmState.pendingDrift;
      crmState.pendingDrift = 0;
      crmState.lastReconcile = { at, checked, corrected, halted: false };
      crmState.switches.reconcile = current.on ? sw(true, true, at) : sw(false, false, at);
      addRun({ job: 'reconcile', startedAt: at, by: 'you', result: `Checked ${plural(checked, 'contact', 'contacts')}, corrected ${corrected}.`, status: 'ok' });
      return ok({ corrected, halted: false });
    },
  },
  {
    method: 'POST',
    path: '/crm/retry',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ body }) => {
      const batch = readBatch(body);
      if (isResult(batch)) return batch;
      // Only signed items can be retried: an unsigned message cannot be trusted.
      const picked = crmState.attention.filter((a) => a.queue === batch.queue && batch.ids.includes(a.id) && a.signed);
      if (picked.length === 0) return fail(422, 'nothing', CRM_MESSAGES.nothing);
      const at = nowIso();
      for (const item of picked) {
        if (item.queue === 'outbox') crmState.outbox.push({ id: crmId('obx'), email: item.who, action: 'upsert', queuedAt: at });
        else crmState.inbox.push({ id: crmId('ibx'), email: item.who, action: 'appointment', queuedAt: at });
      }
      crmState.attention = crmState.attention.filter((a) => !picked.includes(a));
      return ok({ count: picked.length });
    },
  },
  {
    method: 'POST',
    path: '/crm/discard',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ body }) => {
      const batch = readBatch(body);
      if (isResult(batch)) return batch;
      const picked = crmState.attention.filter((a) => a.queue === batch.queue && batch.ids.includes(a.id));
      if (picked.length === 0) return fail(422, 'nothing', CRM_MESSAGES.nothing);
      // Discarded items stay on record; they are never deleted.
      crmState.discarded.push(...picked);
      crmState.attention = crmState.attention.filter((a) => !picked.includes(a));
      return ok({ count: picked.length });
    },
  },
  {
    method: 'GET',
    path: '/crm/inspect',
    ownerOnly: true,
    // Each lookup calls the CRM live.
    latency: 'slow',
    handler: ({ query }) => {
      const email = query.email?.trim();
      if (!isEmail(email)) return fail(400, 'email', CRM_MESSAGES.email, { email: CRM_MESSAGES.email });
      const blocked = needsConnection();
      if (blocked) return blocked;
      return ok(inspectContact(email ?? ''));
    },
  },
  {
    method: 'POST',
    path: '/crm/resubscribe',
    ownerOnly: true,
    latency: 'slow',
    handler: ({ body }) => {
      const email = str(body.email)?.trim();
      if (!isEmail(email) || !email) return fail(400, 'email', CRM_MESSAGES.email, { email: CRM_MESSAGES.email });
      const blocked = needsConnection();
      if (blocked) return blocked;
      const subscriber = findSubscriberByEmail(email);
      if (!subscriber) return fail(404, 'resub_notfound', CRM_MESSAGES.resubNotFound);
      if (subscriber.status === 'bounced' || subscriber.status === 'complained') return fail(422, 'resub_refused', CRM_MESSAGES.resubRefused);
      const contact = crmContacts.get(email.toLowerCase());
      if (subscriber.status !== 'unsubscribed' || contact?.canEmail !== true) return fail(409, 'resub_stale', CRM_MESSAGES.resubStale);
      const at = nowIso();
      subscriber.status = 'active';
      subscriber.reason = null;
      subscriber.unsubscribeSource = null;
      subscriber.unsubscribedAt = null;
      addConsentEvent(subscriber.id, { at, event: 'resubscribed', source: 'crm', policyVersion: CURRENT_POLICY_VERSION });
      Object.assign(contact, { consented: true, updatedAt: at });
      return ok(inspectContact(email));
    },
  },
];
