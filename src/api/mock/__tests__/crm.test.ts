import { api, setAuthBridge } from '@/api/client';
import {
  discardCrmItems,
  getCrm,
  inspectCrmContact,
  reconcileCrm,
  resubscribeCrmContact,
  retryCrmItems,
  setCrmSwitch,
  syncCrm,
  verifyCrm,
} from '@/api/endpoints/crm';
import { getSubscriber } from '@/api/endpoints/email';
import { ApiError } from '@/api/errors';
import { crmState, metaFixture } from '@/api/mock/fixtures/crm';
import { subscribers } from '@/api/mock/fixtures/email';
import {
  metaFragment,
  zCrmBatchResult,
  zCrmConnection,
  zCrmInspect,
  zCrmReconcileResult,
  zCrmStatus,
  zCrmSwitchResult,
  zCrmSyncResult,
} from '@/api/schemas/crm';

/**
 * The CRM domain through the real mock transport: the status screen, Verify
 * (all scenarios), switches gated on a verified connection, Sync now, the
 * reconcile safety stop, retry and discard, the contact inspector and
 * resubscribe with every documented refusal.
 */

let token = '';
const asOwner = () => {
  token = `mock.usr_owner01.${Date.now() + 3_600_000}`;
};
const asManager = () => {
  token = `mock.usr_mgr01.${Date.now() + 3_600_000}`;
};
const asStaff = () => {
  token = `mock.usr_staff01.${Date.now() + 3_600_000}`;
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
});
beforeEach(asOwner);

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

describe('meta fragment', () => {
  it('matches its schema with the brief labels and tones', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
    expect(metaFixture.crmHealth.map((h) => [h.label, h.tone])).toEqual([
      ['Not connected', 'muted'],
      ['Token rejected', 'neutral'],
      ['Verified', 'ok'],
      ['Not verified', 'neutral'],
    ]);
    expect(metaFixture.crmRunStatuses.find((s) => s.value === 'partial')?.label).toBe('part done');
  });
});

describe('capabilities', () => {
  it('answers 403 to staff on every CRM endpoint (crm.view, crm.write)', async () => {
    asStaff();
    const calls: Promise<unknown>[] = [
      getCrm(),
      verifyCrm(),
      setCrmSwitch('outbound', true),
      syncCrm(),
      reconcileCrm(),
      retryCrmItems('outbox', ['att_out00001']),
      discardCrmItems('outbox', ['att_out00001']),
      inspectCrmContact('olivia.martin@mailbox.test'),
      resubscribeCrmContact('noah.singh@mailbox.test'),
    ];
    for (const call of calls) expect(await apiError(call)).toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('lets a manager read', async () => {
    asManager();
    expect((await getCrm()).mergeFields.length).toBeGreaterThan(0);
  });
});

describe('GET /crm', () => {
  it('returns the whole screen: connection, switches, 12 merge fields, queue, latest 6 runs, attention', async () => {
    const status = await getCrm();
    expect(zCrmStatus.safeParse(status).success).toBe(true);
    expect(status.connection).toMatchObject({ configured: true, health: 'verified' });
    expect(status.connection.probe?.results.every((r) => r.ok)).toBe(true);
    expect(status.mergeFields).toHaveLength(12);
    expect(status.runs).toHaveLength(6);
    const started = status.runs.map((r) => r.startedAt);
    expect([...started].sort().reverse()).toEqual(started);
    expect(status.queue.waitingToPush.count).toBe(crmState.outbox.length);
    expect(status.queue.waitingToApply.count).toBe(crmState.inbox.length);
    expect(status.switches.reconcile).toMatchObject({ on: true, running: false });
    expect(status.switches.reconcile.error).toBeTruthy();
    expect(status.lastReconcile).toMatchObject({ halted: true });
    expect(status.attention.some((a) => !a.signed)).toBe(true);
  });
});

describe('GET /crm/inspect', () => {
  it('shows they asked to come back when unsubscribed here but mailable in the CRM', async () => {
    const result = await inspectCrmContact('Noah.Singh@mailbox.test');
    expect(zCrmInspect.safeParse(result).success).toBe(true);
    expect(result.site).toMatchObject({ canEmail: false, status: 'Unsubscribed via the unsubscribe page' });
    expect(result.crm).toMatchObject({ canEmail: true, status: 'Mailable' });
    expect(result.canResubscribe).toBe(true);
    expect(result.consentHistory.length).toBeGreaterThan(0);
  });

  it('never offers to revive a bounce, and explains missing and erased contacts', async () => {
    const bounced = await inspectCrmContact('chloe.roy@mailbox.test');
    expect(bounced.site.canEmail).toBe(false);
    expect(bounced.crm?.canEmail).toBe(true);
    expect(bounced.canResubscribe).toBe(false);

    const notPushed = await inspectCrmContact('liam.w@mailbox.test');
    expect(notPushed.crm).toBeNull();
    expect(notPushed.notFoundReason).toMatch(/queued for its first push/);

    const erased = await inspectCrmContact('former.customer@mailbox.test');
    expect(zCrmInspect.safeParse(erased).success).toBe(true);
    expect(erased.erased).toBe(true);
    expect(erased.site.status).toBe('Erased');
    expect(erased.consentHistory).toEqual([]);

    const unknown = await inspectCrmContact('nobody@nowhere.test');
    expect(unknown.site).toMatchObject({ canEmail: false, status: 'Not a subscriber', contactId: null });
    expect(unknown.crm).toBeNull();
    expect(unknown.notFoundReason).toBe('No contact with this email in the CRM.');
    expect(unknown.erased).toBeUndefined();
  });

  it('needs a valid email', async () => {
    const error = await apiError(inspectCrmContact('not-an-email'));
    expect(error).toMatchObject({ status: 400, code: 'email' });
    expect(error.fields?.email).toBeTruthy();
  });
});

describe('POST /crm/resubscribe', () => {
  it('refuses bounced addresses, unknown addresses and stale comparisons', async () => {
    expect(await apiError(resubscribeCrmContact('chloe.roy@mailbox.test'))).toMatchObject({ status: 422, code: 'resub_refused' });
    expect(await apiError(resubscribeCrmContact('ethan.brown@mailbox.test'))).toMatchObject({ status: 422, code: 'resub_refused' });
    expect(await apiError(resubscribeCrmContact('nobody@nowhere.test'))).toMatchObject({ status: 404, code: 'resub_notfound' });
    expect(await apiError(resubscribeCrmContact('former.customer@mailbox.test'))).toMatchObject({ code: 'resub_notfound' });
    // Active here: nothing to do.
    expect(await apiError(resubscribeCrmContact('zoe.ahmed@mailbox.test'))).toMatchObject({ status: 409, code: 'resub_stale' });
    // Unsubscribed, but the CRM does not show them mailable.
    expect(await apiError(resubscribeCrmContact('emma.gauthier@mailbox.test'))).toMatchObject({ code: 'resub_stale' });
    expect((await apiError(api.post('/crm/resubscribe', { email: 'x' }))).code).toBe('email');
  });

  it('resubscribes, records consent and returns the fresh comparison', async () => {
    const result = await resubscribeCrmContact('noah.singh@mailbox.test');
    expect(zCrmInspect.safeParse(result).success).toBe(true);
    expect(result.site).toMatchObject({ canEmail: true, status: 'Active', consented: true });
    expect(result.canResubscribe).toBe(false);
    expect(result.consentHistory[0]).toMatchObject({ event: 'resubscribed', source: 'crm' });
    const detail = await getSubscriber('sub_noah0001');
    expect(detail.subscriber).toMatchObject({ status: 'active', reason: null, unsubscribeSource: null, unsubscribedAt: null });
    expect(await apiError(resubscribeCrmContact('noah.singh@mailbox.test'))).toMatchObject({ code: 'resub_stale' });
  });
});

describe('retry and discard', () => {
  it('retries signed items only and moves them back to the queue', async () => {
    const waiting = crmState.outbox.length;
    const result = await retryCrmItems('outbox', ['att_out00001', 'att_out00002', 'att_nope']);
    expect(zCrmBatchResult.parse(result)).toEqual({ count: 2 });
    expect(crmState.outbox.length).toBe(waiting + 2);
    const status = await getCrm();
    expect(status.attention.some((a) => a.id === 'att_out00001' || a.id === 'att_out00002')).toBe(false);
    expect(status.queue.waitingToPush.count).toBe(waiting + 2);

    // Unsigned: cannot be retried.
    expect(await apiError(retryCrmItems('inbox', ['att_in000001']))).toMatchObject({ status: 422, code: 'nothing', message: 'Nothing to retry or discard.' });
    // Mixed: only the signed one counts.
    expect(await retryCrmItems('inbox', ['att_in000001', 'att_in000002'])).toEqual({ count: 1 });
    // Wrong queue for the id, or nothing picked.
    expect((await apiError(retryCrmItems('inbox', ['att_out00003']))).code).toBe('nothing');
    expect((await apiError(retryCrmItems('outbox', []))).code).toBe('nothing');
  });

  it('discards for good (kept on record) and validates the body', async () => {
    const result = await discardCrmItems('inbox', ['att_in000001']);
    expect(result).toEqual({ count: 1 });
    expect(crmState.discarded.some((a) => a.id === 'att_in000001')).toBe(true);
    expect((await getCrm()).attention.some((a) => a.id === 'att_in000001')).toBe(false);
    expect((await apiError(discardCrmItems('inbox', ['att_in000001']))).code).toBe('nothing');
    expect(await apiError(api.post('/crm/discard', { queue: 'sideways', ids: [] }))).toMatchObject({ status: 400, code: 'queue' });
    expect(await apiError(api.post('/crm/retry', { queue: 'outbox', ids: 'att_out00003' }))).toMatchObject({ status: 400, code: 'ids' });
  });
});

describe('PUT /crm/switches/:surface', () => {
  it('turns a switch off and on', async () => {
    const off = await setCrmSwitch('inbound', false);
    expect(zCrmSwitchResult.safeParse(off).success).toBe(true);
    expect(off.switch).toMatchObject({ on: false, running: false });
    expect(off.queued).toBeUndefined();
    expect((await getCrm()).switches.inbound.on).toBe(false);
    const on = await setCrmSwitch('inbound', true);
    expect(on.switch).toMatchObject({ on: true, running: true });
  });

  it('turning Outbound on queues every contact never pushed, once', async () => {
    const neverPushed = subscribers.find((s) => s.email === 'olivia.martin@mailbox.test');
    if (!neverPushed) throw new Error('fixture missing');
    neverPushed.inCrm = false;
    await setCrmSwitch('outbound', false);
    const runs = crmState.runs.length;
    const first = await setCrmSwitch('outbound', true);
    expect(first.queued).toBe(1);
    expect(crmState.outbox.some((o) => o.email === neverPushed.email && o.action === 'upsert')).toBe(true);
    expect(crmState.runs.length).toBe(runs + 1);
    expect((await getCrm()).runs[0]).toMatchObject({ job: 'backfill', by: 'you' });
    // Already queued: not queued twice.
    expect((await setCrmSwitch('outbound', true)).queued).toBe(0);
  });

  it('validates the surface and the body', async () => {
    expect((await apiError(api.put('/crm/switches/sideways', { on: true }))).status).toBe(404);
    expect(await apiError(api.put('/crm/switches/outbound', { on: 'yes' }))).toMatchObject({ status: 400, code: 'on' });
  });
});

describe('POST /crm/sync', () => {
  it('pushes and applies what is queued, only for switches that are on', async () => {
    await setCrmSwitch('inbound', false);
    const waitingToApply = crmState.inbox.length;
    const pushedBefore = crmState.pushed7d;
    const toPush = crmState.outbox.length;
    expect(toPush).toBeGreaterThan(0);

    const result = await syncCrm();
    expect(zCrmSyncResult.parse(result)).toEqual({ handled: toPush });
    expect(crmState.outbox).toHaveLength(0);
    expect(crmState.inbox).toHaveLength(waitingToApply);
    expect(crmState.pushed7d).toBe(pushedBefore + toPush);
    // The never-pushed contact now exists in the CRM.
    const liam = await inspectCrmContact('liam.w@mailbox.test');
    expect(liam.crm).toMatchObject({ canEmail: true });
    expect(liam.notFoundReason).toBeUndefined();

    await setCrmSwitch('inbound', true);
    const second = await syncCrm();
    expect(second.handled).toBe(waitingToApply);
    expect(crmState.inbox).toHaveLength(0);
    const owen = await inspectCrmContact('owen.b@mailbox.test');
    expect(owen.site.status).toBe('Unsubscribed via the CRM');
    const status = await getCrm();
    expect(status.queue.waitingToPush).toEqual({ count: 0, sub: 'Nothing waiting' });
    expect(status.runs[0].by).toBe('you');
  });
});

describe('POST /crm/reconcile', () => {
  it('stops without changing anything when it would unsubscribe more than a fifth of the list', async () => {
    crmState.pendingDrift = 10_000;
    const halted = await reconcileCrm();
    expect(zCrmReconcileResult.parse(halted)).toEqual({ corrected: 0, halted: true });
    const status = await getCrm();
    expect(status.lastReconcile).toMatchObject({ halted: true, corrected: 0 });
    expect(status.lastReconcile?.haltReason).toMatch(/more than a fifth/);
    expect(status.switches.reconcile).toMatchObject({ on: true, running: false });
  });

  it('corrects the drift and clears the safety stop', async () => {
    crmState.pendingDrift = 3;
    expect(await reconcileCrm()).toEqual({ corrected: 3, halted: false });
    const status = await getCrm();
    expect(status.lastReconcile).toMatchObject({ halted: false, corrected: 3 });
    expect(status.lastReconcile?.haltReason).toBeUndefined();
    expect(status.switches.reconcile).toEqual(expect.objectContaining({ on: true, running: true }));
    expect(status.switches.reconcile.error).toBeUndefined();
    expect(status.runs[0]).toMatchObject({ job: 'reconcile', status: 'ok' });
  });
});

describe('POST /crm/verify', () => {
  afterEach(() => {
    crmState.tokenAccepted = true;
    crmState.failingProbes = [];
    crmState.upstreamDown = false;
  });

  it('passes every check', async () => {
    const result = await verifyCrm();
    expect(zCrmConnection.safeParse(result).success).toBe(true);
    expect(result.health).toBe('verified');
    expect(result.probe?.results).toHaveLength(8);
    expect((await getCrm()).runs[0]).toMatchObject({ job: 'verify', status: 'ok' });
  });

  it('reports failed checks: not verified, switches stop, turning on is refused until it passes', async () => {
    crmState.failingProbes = ['dnd', 'fields'];
    const result = await verifyCrm();
    expect(result.health).toBe('not_verified');
    const failed = result.probe?.results.filter((r) => !r.ok) ?? [];
    expect(failed.map((r) => r.key)).toEqual(['dnd', 'fields']);
    expect(failed.every((r) => !!r.detail)).toBe(true);
    const status = await getCrm();
    expect(status.switches.outbound).toMatchObject({ on: true, running: false });
    await setCrmSwitch('inbound', false);
    expect(await apiError(setCrmSwitch('inbound', true))).toMatchObject({ status: 422, code: 'unverified' });
    expect((await apiError(syncCrm())).code).toBe('unverified');
    expect((await apiError(reconcileCrm())).code).toBe('unverified');

    crmState.failingProbes = [];
    expect((await verifyCrm()).health).toBe('verified');
    expect((await getCrm()).switches.outbound).toMatchObject({ on: true, running: true });
    expect((await setCrmSwitch('inbound', true)).switch.on).toBe(true);
  });

  it('reports a rejected token, and the inspector cannot call the CRM', async () => {
    crmState.tokenAccepted = false;
    const result = await verifyCrm();
    expect(result.health).toBe('token_rejected');
    expect(result.probe?.results[0]).toMatchObject({ key: 'token', ok: false });
    expect((await apiError(inspectCrmContact('olivia.martin@mailbox.test'))).code).toBe('unverified');
    crmState.tokenAccepted = true;
    expect((await verifyCrm()).health).toBe('verified');
  });

  it('fails with probe, sync and reconcile codes when the CRM does not answer', async () => {
    crmState.upstreamDown = true;
    expect(await apiError(verifyCrm())).toMatchObject({ status: 502, code: 'probe' });
    expect(await apiError(syncCrm())).toMatchObject({ status: 502, code: 'sync' });
    expect(await apiError(reconcileCrm())).toMatchObject({ status: 502, code: 'reconcile' });
  });
});

describe('not configured', () => {
  afterAll(() => {
    crmState.configured = true;
  });

  it('shows Not connected and refuses anything that needs the CRM', async () => {
    crmState.configured = false;
    const status = await getCrm();
    expect(status.connection).toMatchObject({ configured: false, health: 'not_connected', probe: null });
    expect(await apiError(verifyCrm())).toMatchObject({ status: 503, code: 'not_configured' });
    expect((await apiError(setCrmSwitch('outbound', true))).code).toBe('not_configured');
    expect((await apiError(syncCrm())).code).toBe('not_configured');
    expect((await apiError(inspectCrmContact('olivia.martin@mailbox.test'))).code).toBe('not_configured');
    // Turning a switch off always works.
    expect((await setCrmSwitch('reconcile', false)).switch.on).toBe(false);
  });
});
