import { api, setAuthBridge } from '@/api/client';
import {
  addMember,
  addOnboardingTask,
  clientActivityInfiniteQuery,
  clientsInfiniteQuery,
  completeOnboarding,
  createClient,
  deleteClient,
  deleteOnboardingTemplate,
  getClient,
  getClientActivity,
  getClients,
  getOnboardingTemplates,
  goLive,
  logCall,
  postClientActivity,
  requestAccess,
  requestApproval,
  reviewCall,
  reviewIntake,
  saveCrmLocation,
  saveOnboardingTemplate,
  sendMemberLink,
  signAsset,
  updateAccessGrant,
  updateCall,
  updateClient,
  updateMember,
  updateOnboarding,
  updateTaskStatus,
  type ClientListParams,
} from '@/api/endpoints/clients';
import { ApiError } from '@/api/errors';
import { CRM_DB_FAIL_LOCATION_ID, CRM_OWN_LOCATION_ID, metaFixture } from '@/api/mock/fixtures/clients';
import { torontoDate } from '@/api/mock/router';
import {
  metaFragment,
  zAccessGrant,
  zActivity,
  zActivityPage,
  zAddMemberResult,
  zApproval,
  zCallResult,
  zClient,
  zClientBundle,
  zClientList,
  zCreateClientResult,
  zCrmLocation,
  zDeletedTemplate,
  zGoLiveResult,
  zIntake,
  zMember,
  zMemberLinkResult,
  zOnboardingRun,
  zOnboardingTemplate,
  zOnboardingTemplates,
  zSignedAsset,
  zTaskResult,
  type ClientBundle,
  type ClientList,
} from '@/api/schemas/clients';

/**
 * The clients domain through the real mock transport: envelope, schemas, paging,
 * who may do what (capabilities: managers do nearly everything, staff help with
 * onboarding and never see money), the documented error codes and messages,
 * and writes that show up in the next read.
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

let keySeq = 0;
const key = () => `test-key-${++keySeq}`;

const ACME = 'cl_acmeplumb01';
const HARBOUR = 'cl_harbourhvac';
const BYTOWN = 'cl_bytownroof';
const RIDEAU = 'cl_rideaulawn';
const STEELTOWN = 'cl_steeltownph';
const NEPEAN = 'cl_nepeanortho';
const TEST_CLIENT = 'cl_testco_0001';

let warn: jest.SpyInstance;
beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
  warn = jest.spyOn(console, 'warn');
});
afterAll(() => {
  // The client logs schema drift in dev: nothing the mock sends may drift.
  expect(warn.mock.calls.filter((args) => String(args[0]).includes('[schema drift]'))).toEqual([]);
  warn.mockRestore();
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

/** Walk every page exactly like useInfiniteQuery does, cursor passed back verbatim. */
async function allPages(params: ClientListParams) {
  const options = clientsInfiniteQuery(params);
  const pages: ClientList[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page = await getClients({ ...params, cursor });
    expect(zClientList.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return pages;
}
const allRows = async (params: ClientListParams) => (await allPages(params)).flatMap((p) => p.items);

async function bundle(id: string): Promise<ClientBundle> {
  const b = await getClient(id);
  const parsed = zClientBundle.safeParse(b);
  if (!parsed.success) throw new Error(`bundle ${id} does not match its schema: ${parsed.error.message}`);
  return b;
}

describe('meta fragment', () => {
  it('matches its schema and carries every enum the screens need', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
    expect(metaFixture.accessProviders).toHaveLength(17);
    expect(metaFixture.clientStatuses.map((s) => [s.value, s.tone])).toEqual([
      ['lead', 'muted'],
      ['pending', 'neutral'],
      ['onboarding', 'gold'],
      ['live', 'ok'],
      ['paused', 'warn'],
      ['churned', 'muted'],
    ]);
    expect(metaFixture.onboardingStages.map((s) => s.value)).toEqual(['welcome', 'intake', 'kickoff', 'build', 'review', 'go_live', 'optimizing', 'complete']);
    expect(metaFixture.taskStatuses.map((s) => s.label)).toEqual(['To do', 'In progress', 'Waiting on client', 'Done', 'Skipped', 'Blocked']);
    expect(metaFixture.intakeSchema.map((s) => s.key)).toEqual(['business', 'services', 'leads', 'brand', 'goals']);
    expect(metaFixture.planOptions.map((p) => [p.id, p.guarantee, p.needsCarePlan])).toEqual([
      ['convert', false, false],
      ['grow', true, false],
      ['lets-talk', true, false],
      ['webline', false, true],
    ]);
  });
});

describe('GET /clients', () => {
  it('pages the active list with an opaque cursor and ends on a short page', async () => {
    const pages = await allPages({});
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0].items).toHaveLength(30);
    const last = pages[pages.length - 1];
    expect(last.items.length).toBeGreaterThan(0);
    expect(last.items.length).toBeLessThan(30);
    expect(last.nextCursor).toBeNull();

    const rows = pages.flatMap((p) => p.items);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.status !== 'churned' && r.status !== 'lead' && !r.isTest)).toBe(true);

    const { stats } = pages[0];
    expect(stats.leads).toBe(2);
    expect(stats.blocked).toBeGreaterThanOrEqual(2);
    expect(stats.behindPace).toBeGreaterThanOrEqual(1);
    expect(stats.live).toBe(rows.filter((r) => r.status === 'live').length);
  });

  it('summarises each row the way the list card needs it', async () => {
    const rows = await allRows({ status: 'all' });
    const row = (id: string) => {
      const found = rows.find((r) => r.id === id);
      if (!found) throw new Error(`missing row ${id}`);
      return found;
    };

    const acme = row(ACME);
    expect(acme.blocked).toBe(true);
    expect(acme.blockedReason).toMatch(/DNS/);
    expect(acme.openTasks.client).toBeGreaterThan(0);
    expect(acme.openTasks.us).toBeGreaterThan(0);
    expect(acme.goLive).toEqual({ liveDate: null, targetDate: torontoDate(4) });
    expect(acme.guarantee.status).toBe('not_started');

    expect(row(HARBOUR).guarantee).toMatchObject({ eligible: true, counted: 12, target: 30, daysLeft: 41, status: 'on_pace' });
    expect(row(BYTOWN).guarantee.status).toBe('behind');
    expect(row('cl_glebelaw').guarantee.status).toBe('met');
    expect(row(STEELTOWN).guarantee.status).toBe('n/a');
    expect(row(HARBOUR).goLive.liveDate).toBe(torontoDate(-19));
    expect(row(RIDEAU).goLive.targetDate).toBe(torontoDate(-3));
  });

  it('filters by status chip and searches name and email', async () => {
    const leads = await allRows({ status: 'lead' });
    expect(leads).toHaveLength(2);
    expect(leads.every((r) => r.status === 'lead')).toBe(true);

    const churned = await allRows({ status: 'churned' });
    expect(churned.length).toBeGreaterThan(0);
    expect(churned.every((r) => r.status === 'churned')).toBe(true);

    const everyone = await allRows({ status: 'all' });
    const active = await allRows({});
    expect(everyone.length).toBe(active.length + leads.length + churned.length);

    const byName = await getClients({ q: 'acme' });
    expect(byName.items.map((r) => r.id)).toEqual([ACME]);
    const byEmail = await getClients({ q: 'priya@harbourhvac' });
    expect(byEmail.items.map((r) => r.id)).toEqual([HARBOUR]);

    const bad = await apiError(api.get('/clients', { query: { status: 'sleeping' } }));
    expect([bad.status, bad.code]).toEqual([400, 'status']);
  });

  it('shows test clients only to people with testdata.view who ask', async () => {
    expect((await allRows({ status: 'all' })).some((r) => r.isTest)).toBe(false);
    const withTest = await allRows({ status: 'all', includeTest: true });
    expect(withTest.find((r) => r.id === TEST_CLIENT)?.isTest).toBe(true);

    asManager();
    expect((await allRows({ status: 'all', includeTest: true })).find((r) => r.id === TEST_CLIENT)?.isTest).toBe(true);

    asStaff();
    const staff = await allRows({ status: 'all', includeTest: true });
    expect(staff.length).toBeGreaterThan(0);
    expect(staff.some((r) => r.isTest)).toBe(false);
  });
});

describe('GET /clients/:id', () => {
  it('returns the whole bundle for the showcase client', async () => {
    const b = await bundle(ACME);
    expect(b.client.businessName).toBe('Acme Plumbing');
    expect(b.billing?.subscription?.status).toBe('active');
    expect(b.onboarding?.run.blocked).toBe(true);
    expect(b.onboarding?.tasks.length).toBeGreaterThan(15);
    expect(b.intake?.status).toBe('submitted');
    expect(b.calls.filter((c) => c.review === 'needs_review')).toHaveLength(4);
    expect(b.calls.some((c) => c.review === 'needs_review' && c.disqualifiedReason === 'spam')).toBe(true);
    expect(b.guarantee.needsReview).toBe(4);
    expect(new Set(b.approvals.map((a) => a.status))).toEqual(new Set(['pending', 'approved', 'changes_requested', 'superseded']));
    expect(b.agreements.map((a) => a.status)).toEqual(expect.arrayContaining(['signed', 'sent']));
    expect(b.assets.some((a) => a.thumbnailUrl !== null)).toBe(true);
    expect(b.assets.some((a) => a.mime === 'application/pdf')).toBe(true);
    expect(new Set(b.accessGrants.map((g) => g.status)).size).toBeGreaterThanOrEqual(6);
    expect(b.members.some((m) => m.status === 'invited')).toBe(true);
    expect(b.crmLocation?.locationId).toEqual(expect.any(String));
    expect(b.activity.items).toHaveLength(30);
    expect(b.activity.nextCursor).toEqual(expect.any(String));
  });

  it('sends the CRM mapping key and billing only with clients.crm and clients.billing', async () => {
    asManager();
    const manager = await bundle(ACME);
    expect(manager.crmLocation?.locationId).toEqual(expect.any(String));
    expect(manager.billing?.subscription?.status).toBe('active');

    asStaff();
    const staff = await bundle(ACME);
    expect('crmLocation' in staff).toBe(false);
    // Money stays on the server: null, never a made-up record.
    expect(staff.billing).toBeNull();
    expect(staff.calls.length).toBe(manager.calls.length);
    expect(staff.onboarding?.tasks.length).toBe(manager.onboarding?.tasks.length);
  });

  it('pages the activity timeline and ends on a short page', async () => {
    const options = clientActivityInfiniteQuery(ACME);
    const first = await getClientActivity(ACME);
    expect(zActivityPage.safeParse(first).success).toBe(true);
    const b = await bundle(ACME);
    expect(first.items.map((a) => a.id)).toEqual(b.activity.items.map((a) => a.id));

    const pages = [first];
    let cursor: string | null = null;
    for (let page = first; ; ) {
      const next = options.getNextPageParam(page, pages, cursor, []);
      if (next === undefined) break;
      cursor = next;
      page = await getClientActivity(ACME, cursor);
      expect(zActivityPage.safeParse(page).success).toBe(true);
      pages.push(page);
    }
    const items = pages.flatMap((p) => p.items);
    expect(items.length).toBeGreaterThanOrEqual(30);
    expect(items.length).toBeLessThanOrEqual(60);
    expect(pages[pages.length - 1].items.length).toBeLessThan(30);
    expect(items.every((a, i) => i === 0 || items[i - 1].createdAt >= a.createdAt)).toBe(true);
    expect(items.some((a) => a.visibleToClient)).toBe(true);
    expect(items.some((a) => a.kind === 'note')).toBe(true);
  });

  it('answers 404 for unknown clients, and for test clients without testdata.view', async () => {
    expect((await apiError(getClient('cl_nobody'))).status).toBe(404);
    await bundle(TEST_CLIENT);
    asManager();
    await bundle(TEST_CLIENT);
    asStaff();
    expect((await apiError(getClient(TEST_CLIENT))).status).toBe(404);
  });
});

describe('POST /clients', () => {
  it('rejects a missing business name or email with the documented message', async () => {
    const noName = await apiError(createClient({ businessName: '  ', email: 'new@client.test', sendInvite: true }, key()));
    expect([noName.status, noName.code, noName.message]).toEqual([400, 'required', 'Business name and a valid email are required.']);
    expect(noName.fields?.businessName).toBeTruthy();

    const badEmail = await apiError(createClient({ businessName: 'Hess Village Bistro', email: 'not-an-email', sendInvite: true }, key()));
    expect([badEmail.code, badEmail.message]).toEqual(['required', 'Business name and a valid email are required.']);
    expect(badEmail.fields?.email).toBe('Enter a valid email.');
  });

  it('creates a client with a checklist and a portal invite, and lists it', async () => {
    const idem = key();
    const result = await createClient(
      { businessName: 'Hess Village Bistro', email: 'Owner@HessBistro.test', name: 'Marta Kowalski', planId: 'grow', assignedStrategist: 'manager@tekmadev.test', sendInvite: true },
      idem,
    );
    expect(zCreateClientResult.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ reused: false, invite: 'sent' });
    expect(result.client).toMatchObject({ businessName: 'Hess Village Bistro', primaryEmail: 'owner@hessbistro.test', planId: 'grow', status: 'pending', guaranteeEligible: true });

    // Retrying the same intent with the same key returns the same answer, not a second client.
    const retry = await createClient({ businessName: 'Hess Village Bistro', email: 'owner@hessbistro.test', planId: 'grow', sendInvite: true }, idem);
    expect(retry.client.id).toBe(result.client.id);

    const found = await getClients({ q: 'hess village' });
    expect(found.items.map((r) => r.id)).toEqual([result.client.id]);
    const b = await bundle(result.client.id);
    expect(b.onboarding?.tasks.length).toBeGreaterThan(10);
    expect(b.members).toEqual([expect.objectContaining({ email: 'owner@hessbistro.test', role: 'owner', status: 'invited' })]);
    expect(b.billing).toBeNull();
  });

  it('reuses a client with the same email instead of duplicating it', async () => {
    const before = (await allRows({ status: 'all' })).length;
    const result = await createClient({ businessName: 'Hess Village Bistro & Bar', email: 'OWNER@hessbistro.test', sendInvite: false }, key());
    expect(result.reused).toBe(true);
    expect(result.invite).toBe('skipped');
    expect(result.client.businessName).toBe('Hess Village Bistro & Bar');
    expect((await allRows({ status: 'all' })).length).toBe(before);
  });

  it('reports a failed invite email and a skipped one', async () => {
    const failed = await createClient({ businessName: 'Locke Street Barbers', email: 'bounce@lockebarbers.test', planId: null, sendInvite: true }, key());
    expect(failed.invite).toBe('failed');
    expect(failed.client.planId).toBeNull();
    const b = await bundle(failed.client.id);
    expect(b.onboarding).toBeNull();

    const skipped = await createClient({ businessName: 'James North Framing', email: 'hello@jamesnorthframing.test', planId: 'convert', sendInvite: false }, key());
    expect(skipped.invite).toBe('skipped');
  });
});

describe('PATCH /clients/:id', () => {
  it('changes only what is sent, clears nulls, and shows up on the next read', async () => {
    const updated = await updateClient(RIDEAU, { legalName: 'Rideau Lawn and Garden Inc.', serviceArea: null, guaranteeTarget: 25, internalNotes: 'Prefers calls.' });
    expect(zClient.safeParse(updated).success).toBe(true);
    expect(updated).toMatchObject({ legalName: 'Rideau Lawn and Garden Inc.', serviceArea: null, guaranteeTarget: 25, businessName: 'Rideau Lawn & Garden' });
    const b = await bundle(RIDEAU);
    expect(b.client.internalNotes).toBe('Prefers calls.');
    expect(b.guarantee.target).toBe(25);
    expect(b.activity.items[0].event).toBe('client.updated');
  });

  it('validates required fields, statuses and formats', async () => {
    const empty = await apiError(updateClient(RIDEAU, { businessName: '' }));
    expect([empty.status, empty.code, empty.message]).toEqual([400, 'required', 'Business name and a valid email are required.']);
    const email = await apiError(updateClient(RIDEAU, { primaryEmail: 'nope' }));
    expect(email.code).toBe('required');
    const taken = await apiError(updateClient(RIDEAU, { primaryEmail: 'Priya@HarbourHVAC.test' }));
    expect([taken.status, taken.code]).toEqual([409, 'email_taken']);
    const lead = await apiError(updateClient(RIDEAU, { status: 'lead' }));
    expect(lead.fields?.status).toBeTruthy();
    const zone = await apiError(updateClient(RIDEAU, { timezone: 'Mars/Olympus' }));
    expect(zone.fields?.timezone).toBeTruthy();
    const date = await apiError(updateClient(RIDEAU, { liveDate: '2026-13-40' }));
    expect(date.fields?.liveDate).toBeTruthy();
  });
});

describe('POST /clients/:id/go-live', () => {
  it('needs Webline Care for a Webline client, unless overridden', async () => {
    const blocked = await apiError(goLive(STEELTOWN));
    expect([blocked.status, blocked.code]).toEqual([422, 'care_required']);
    expect(blocked.message).toMatch(/Webline Care/);

    const result = await goLive(STEELTOWN, { override: true });
    expect(zGoLiveResult.safeParse(result).success).toBe(true);
    expect(result.client).toMatchObject({ status: 'live', liveDate: torontoDate(0) });
    expect(result.guarantee).toMatchObject({ eligible: false, clockStarted: false, status: 'n/a' });
  });

  it('starts the guarantee clock for an eligible client, once', async () => {
    const result = await goLive(RIDEAU);
    expect(result.client).toMatchObject({ status: 'live', liveDate: torontoDate(0), guaranteeClockStartedOn: torontoDate(0), guaranteeStatus: 'running' });
    expect(result.guarantee).toMatchObject({ eligible: true, clockStarted: true, daysIn: 0, daysLeft: 60 });
    const b = await bundle(RIDEAU);
    expect(b.activity.items[0].summary).toBe('Went live. Guarantee clock started.');
    const row = (await getClients({ q: 'rideau' })).items[0];
    expect(row.goLive.liveDate).toBe(torontoDate(0));

    const again = await apiError(goLive(RIDEAU));
    expect([again.status, again.code]).toEqual([409, 'already_live']);
  });
});

describe('onboarding runs and tasks', () => {
  it('blocks, unblocks and validates a run', async () => {
    const run = (await bundle(NEPEAN)).onboarding?.run;
    if (!run) throw new Error('Nepean has a run');
    const statsBefore = (await getClients({})).stats.blocked;

    const blocked = await updateOnboarding(run.id, { blocked: true, blockedReason: 'Waiting on the clinic photos.', targetLiveDate: torontoDate(12) });
    expect(zOnboardingRun.safeParse(blocked).success).toBe(true);
    expect(blocked).toMatchObject({ blocked: true, blockedReason: 'Waiting on the clinic photos.', targetLiveDate: torontoDate(12) });
    expect((await getClients({})).stats.blocked).toBe(statsBefore + 1);
    expect((await getClients({ q: 'nepean' })).items[0].blockedReason).toBe('Waiting on the clinic photos.');

    const unblocked = await updateOnboarding(run.id, { blocked: false });
    expect(unblocked).toMatchObject({ blocked: false, blockedReason: null });

    const bad = await apiError(updateOnboarding(run.id, { targetLiveDate: 'next week' }));
    expect(bad.status).toBe(400);
    expect(bad.fields?.targetLiveDate).toBeTruthy();
  });

  it('adds tasks and changes their status, returning the recomputed run', async () => {
    const run = (await bundle(NEPEAN)).onboarding?.run;
    if (!run) throw new Error('Nepean has a run');

    const missing = await apiError(addOnboardingTask(run.id, { title: '' }, key()));
    expect([missing.status, missing.code]).toEqual([400, 'title']);

    const added = await addOnboardingTask(run.id, { title: 'Send three before and after photos', owner: 'client', kind: 'upload', required: true, stage: 'intake' }, key());
    expect(zTaskResult.safeParse(added).success).toBe(true);
    expect(added.task).toMatchObject({ owner: 'client', required: true, status: 'todo', stage: 'intake' });
    expect(added.run.requiredTotal).toBe(run.requiredTotal + 1);

    const b = await bundle(NEPEAN);
    expect(b.onboarding?.tasks.some((t) => t.id === added.task.id)).toBe(true);
    expect(b.activity.items[0]).toMatchObject({ event: 'task.added', visibleToClient: true });

    const done = await updateTaskStatus(added.task.id, 'done');
    expect(done.task).toMatchObject({ status: 'done', doneBy: 'Shajeed I.' });
    expect(done.task.doneAt).toEqual(expect.any(String));
    expect(done.run.requiredDone).toBe(added.run.requiredDone + 1);

    const reopened = await updateTaskStatus(added.task.id, 'waiting_client');
    expect(reopened.task).toMatchObject({ status: 'waiting_client', doneAt: null, doneBy: null });

    const bad = await apiError(api.patch('/tasks/' + added.task.id, { status: 'finished' }));
    expect([bad.status, bad.code]).toEqual([400, 'status']);
  });

  it('completes a run for good', async () => {
    const run = (await bundle(NEPEAN)).onboarding?.run;
    if (!run) throw new Error('Nepean has a run');
    const done = await completeOnboarding(run.id);
    expect(done).toMatchObject({ stage: 'complete', derivedStage: 'complete' });
    expect(done.completedAt).toEqual(expect.any(String));

    for (const attempt of [completeOnboarding(run.id), updateOnboarding(run.id, { stage: 'build' }), addOnboardingTask(run.id, { title: 'Too late' }, key())]) {
      const e = await apiError(attempt);
      expect([e.status, e.code]).toEqual([409, 'run_complete']);
    }
  });
});

describe('intake review', () => {
  it('marks a submitted intake reviewed once, and closes the review task', async () => {
    const b = await bundle(ACME);
    if (!b.intake) throw new Error('Acme has an intake');
    const reviewed = await reviewIntake(b.intake.id);
    expect(zIntake.safeParse(reviewed).success).toBe(true);
    expect(reviewed).toMatchObject({ status: 'reviewed', reviewedBy: 'Shajeed I.', version: 2 });
    const after = await bundle(ACME);
    expect(after.onboarding?.tasks.find((t) => t.title === 'Review the intake')?.status).toBe('done');

    const again = await apiError(reviewIntake(b.intake.id));
    expect([again.status, again.code]).toEqual([409, 'not_submitted']);
  });
});

describe('access grants', () => {
  it('requests access and updates status and the note shown to the client', async () => {
    const bad = await apiError(requestAccess(ACME, { provider: 'myspace' as never }, key()));
    expect([bad.status, bad.code]).toEqual([400, 'provider']);

    const grant = await requestAccess(ACME, { provider: 'google_analytics', note: 'Add owner@tekmadev.test as an admin.' }, key());
    expect(zAccessGrant.safeParse(grant).success).toBe(true);
    expect(grant).toMatchObject({ status: 'requested', method: 'invite_user', note: 'Add owner@tekmadev.test as an admin.' });

    const verified = await updateAccessGrant(grant.id, { status: 'verified', note: 'Thanks, all set.' });
    expect(verified).toMatchObject({ status: 'verified', verifiedBy: 'Shajeed I.', note: 'Thanks, all set.' });
    expect(verified.verifiedAt).toEqual(expect.any(String));

    // An empty note keeps the old one.
    expect((await updateAccessGrant(grant.id, { note: '' })).note).toBe('Thanks, all set.');
    expect((await updateAccessGrant(grant.id, { note: null })).note).toBeNull();
    expect((await bundle(ACME)).accessGrants.find((g) => g.id === grant.id)?.status).toBe('verified');
  });
});

describe('files', () => {
  it('re-signs an expired file URL', async () => {
    const expired = (await bundle(ACME)).assets.find((a) => Date.parse(a.expiresAt) < Date.now());
    if (!expired) throw new Error('Acme has an expired file');
    const signed = await signAsset(expired.id);
    expect(zSignedAsset.safeParse(signed).success).toBe(true);
    expect(Date.parse(signed.expiresAt)).toBeGreaterThan(Date.now());
    expect(signed.url).not.toBe(expired.url);
    expect((await bundle(ACME)).assets.find((a) => a.id === expired.id)?.expiresAt).toBe(signed.expiresAt);
    expect((await apiError(signAsset('ast_missing'))).status).toBe(404);
  });
});

describe('approvals', () => {
  it('makes the next version and supersedes the pending one', async () => {
    const missing = await apiError(requestApproval(ACME, { title: '' }, key()));
    expect([missing.status, missing.code]).toEqual([400, 'title']);
    const badUrl = await apiError(requestApproval(ACME, { title: 'Footer', previewUrl: 'preview dot com' }, key()));
    expect([badUrl.status, badUrl.code]).toEqual([400, 'url']);

    const approval = await requestApproval(
      ACME,
      { title: 'Homepage design', kind: 'website', previewUrl: 'https://preview.tekmadev.test/acme/home-v3', attachment: { label: 'Desktop', url: 'https://preview.tekmadev.test/acme/desktop.pdf' } },
      key(),
    );
    expect(zApproval.safeParse(approval).success).toBe(true);
    expect(approval).toMatchObject({ version: 3, status: 'pending' });
    const homepage = (await bundle(ACME)).approvals.filter((a) => a.title === 'Homepage design');
    expect(homepage.map((a) => [a.version, a.status]).sort()).toEqual([
      [1, 'superseded'],
      [2, 'superseded'],
      [3, 'pending'],
    ]);
  });
});

describe('calls and the guarantee', () => {
  it('counts a reviewed CRM call toward the guarantee', async () => {
    const b = await bundle(BYTOWN);
    const pending = b.calls.find((c) => c.review === 'needs_review');
    if (!pending) throw new Error('Bytown has a call to review');
    const result = await reviewCall(pending.id, true);
    expect(zCallResult.safeParse(result).success).toBe(true);
    expect(result.call).toMatchObject({ qualified: true, review: 'qualified', counts: true });
    expect(result.guarantee.counted).toBe(b.guarantee.counted + 1);
    expect(result.guarantee.needsReview).toBe(b.guarantee.needsReview - 1);
    expect((await bundle(BYTOWN)).guarantee.counted).toBe(b.guarantee.counted + 1);
  });

  it('keeps the preset reason when agreeing a call does not count', async () => {
    const spam = (await bundle(ACME)).calls.find((c) => c.review === 'needs_review' && c.disqualifiedReason === 'spam');
    if (!spam) throw new Error('Acme has a preset spam call');
    const result = await reviewCall(spam.id, false);
    expect(result.call).toMatchObject({ qualified: false, review: 'disqualified', disqualifiedReason: 'spam', counts: false });
    const bad = await apiError(api.post(`/calls/${spam.id}/review`, { counts: 'maybe' }));
    expect([bad.status, bad.code]).toEqual([400, 'counts']);
  });

  it('counts a call logged by hand right away', async () => {
    const before = (await bundle(HARBOUR)).guarantee.counted;
    const result = await logCall(HARBOUR, { contactName: 'Gord Baxter', phone: '+19055550299', serviceRequested: 'Furnace not starting', status: 'confirmed' }, key());
    expect(result.call).toMatchObject({ source: 'manual', qualified: true, counts: true, review: 'qualified' });
    expect(result.guarantee.counted).toBe(before + 1);

    const nobody = await apiError(logCall(HARBOUR, { notes: 'Someone called' }, key()));
    expect([nobody.status, nobody.code]).toEqual([400, 'contact']);
    const badEmail = await apiError(logCall(HARBOUR, { contactName: 'Gord', email: 'gord@' }, key()));
    expect([badEmail.code, badEmail.message]).toEqual(['email', 'Enter a valid email.']);
    const crm = await apiError(logCall(HARBOUR, { contactName: 'Gord', source: 'crm' }, key()));
    expect(crm.code).toBe('source');
  });

  it('needs a reason to disqualify a call, then stops counting it', async () => {
    const b = await bundle(HARBOUR);
    const counted = b.calls.find((c) => c.counts);
    if (!counted) throw new Error('Harbour has counted calls');
    const noReason = await apiError(updateCall(counted.id, { qualified: false }));
    expect([noReason.status, noReason.code]).toEqual([400, 'reason']);
    const result = await updateCall(counted.id, { qualified: false, disqualifiedReason: 'duplicate', notes: 'Booked twice.' });
    expect(result.call).toMatchObject({ review: 'disqualified', counts: false, notes: 'Booked twice.' });
    expect(result.guarantee.counted).toBe(b.guarantee.counted - 1);
  });
});

describe('PUT /clients/:id/crm-location', () => {
  it('needs clients.crm (staff are refused)', async () => {
    asStaff();
    const e = await apiError(saveCrmLocation(ACME, { locationId: 'aCmEpLuMb7Hx2KqW9rTz', calendarIds: [] }));
    expect([e.status, e.code, e.message]).toEqual([403, 'forbidden', 'Your role cannot do that.']);
  });

  it('returns each documented mapping error', async () => {
    const cases: [Promise<unknown>, number, string][] = [
      [saveCrmLocation(ACME, { locationId: 'too-short', calendarIds: [] }), 400, 'crm_location'],
      [saveCrmLocation(ACME, { locationId: 'aCmEpLuMb7Hx2KqW9rTz', calendarIds: ['calendar one'] }), 400, 'crm_calendar'],
      [saveCrmLocation(ACME, { locationId: 'hRbRhVaC4kQ8pL2mN6sT', calendarIds: [] }), 409, 'crm_taken'],
      [saveCrmLocation(ACME, { locationId: CRM_OWN_LOCATION_ID, calendarIds: [] }), 422, 'crm_own'],
      [saveCrmLocation(ACME, { locationId: CRM_DB_FAIL_LOCATION_ID, calendarIds: [] }), 500, 'crm_db'],
    ];
    for (const [promise, status, code] of cases) {
      const e = await apiError(promise);
      expect([e.status, e.code]).toEqual([status, code]);
      expect(e.message.length).toBeGreaterThan(10);
    }
    expect((await apiError(saveCrmLocation(ACME, { locationId: 'hRbRhVaC4kQ8pL2mN6sT', calendarIds: [] }))).message).toMatch(/Harbour HVAC/);
  });

  it('saves a mapping that the bundle then shows', async () => {
    const saved = await saveCrmLocation(ACME, { locationId: 'aCmEpLuMb7Hx2KqW9rTz', calendarIds: ['cal8Fh2Kq0Lr5Tz3Wm1x', ' calNew0Est1Qz9Lm2Rt5 ', 'cal8Fh2Kq0Lr5Tz3Wm1x'] });
    expect(zCrmLocation.safeParse(saved).success).toBe(true);
    expect(saved.calendarIds).toEqual(['cal8Fh2Kq0Lr5Tz3Wm1x', 'calNew0Est1Qz9Lm2Rt5']);
    expect(saved.pendingToApply).toBe(2);
    expect((await bundle(ACME)).crmLocation).toEqual(saved);
  });
});

describe('portal team', () => {
  it('adds people, with the documented email error and duplicate guard', async () => {
    const bad = await apiError(addMember(ACME, { email: 'rita at acme' }, key()));
    expect([bad.status, bad.code, bad.message]).toEqual([400, 'email', 'Enter a valid email.']);

    const added = await addMember(ACME, { email: 'Estimator@AcmePlumbing.test', name: 'Lena Fischer', title: 'Estimator' }, key());
    expect(zAddMemberResult.safeParse(added).success).toBe(true);
    expect(added).toMatchObject({ invite: 'sent', member: { email: 'estimator@acmeplumbing.test', role: 'member', status: 'invited' } });

    const dup = await apiError(addMember(ACME, { email: 'estimator@acmeplumbing.test' }, key()));
    expect([dup.status, dup.code]).toEqual([409, 'member_exists']);

    const bounced = await addMember(ACME, { email: 'bounce+yard@acmeplumbing.test' }, key());
    expect(bounced.invite).toBe('failed');
  });

  it('resends invites, sends reset links, and reports a failed invite email', async () => {
    const members = (await bundle(ACME)).members;
    const failing = members.find((m) => m.email === 'office+bounce@acmeplumbing.test');
    const active = members.find((m) => m.email === 'rita@acmeplumbing.test');
    const invited = members.find((m) => m.email === 'estimator@acmeplumbing.test');
    const disabled = members.find((m) => m.status === 'disabled');
    if (!failing || !active || !invited || !disabled) throw new Error('Acme has the seeded team');

    const e = await apiError(sendMemberLink(failing.id));
    expect([e.status, e.code, e.message]).toEqual([502, 'invite', 'Invite email failed. Check the Supabase auth email settings.']);

    const reset = await sendMemberLink(active.id);
    expect(zMemberLinkResult.safeParse(reset).success).toBe(true);
    expect(reset.sent).toBe('reset');
    expect((await sendMemberLink(invited.id)).sent).toBe('invite');
    expect((await apiError(sendMemberLink(disabled.id))).code).toBe('member_disabled');
  });

  it('changes role and status', async () => {
    const rita = (await bundle(ACME)).members.find((m) => m.email === 'rita@acmeplumbing.test');
    if (!rita) throw new Error('Rita is on the team');
    const updated = await updateMember(rita.id, { role: 'owner' });
    expect(zMember.safeParse(updated).success).toBe(true);
    expect(updated.role).toBe('owner');
    expect((await updateMember(rita.id, { status: 'disabled' })).status).toBe('disabled');
    expect((await updateMember(rita.id, { status: 'active' })).status).toBe('active');
    expect((await apiError(updateMember(rita.id, { role: 'boss' as never }))).status).toBe(400);
  });
});

describe('activity', () => {
  it('posts internal notes and updates to the client', async () => {
    const note = await postClientActivity(HARBOUR, { kind: 'note', text: 'Priya wants the October report early.\nCall Thursday.' }, key());
    expect(zActivity.safeParse(note).success).toBe(true);
    expect(note).toMatchObject({ kind: 'note', event: 'note', visibleToClient: false, summary: 'Priya wants the October report early.' });

    const update = await postClientActivity(
      HARBOUR,
      { kind: 'update', subject: 'Your September numbers', text: '14 booked calls so far. Details in the report.', actionUrl: 'https://account.tekmadev.com/reports' },
      key(),
    );
    expect(update).toMatchObject({ kind: 'update', visibleToClient: true, summary: 'Your September numbers', actor: { kind: 'staff', name: 'Shajeed I.' } });

    const first = await getClientActivity(HARBOUR);
    expect(first.items.slice(0, 2).map((a) => a.id)).toEqual([update.id, note.id]);

    const empty = await apiError(postClientActivity(HARBOUR, { kind: 'note', text: '   ' }, key()));
    expect([empty.status, empty.code]).toEqual([400, 'text']);
    const kind = await apiError(api.post(`/clients/${HARBOUR}/activity`, { kind: 'email', text: 'Hi' }));
    expect(kind.code).toBe('kind');
    const link = await apiError(postClientActivity(HARBOUR, { kind: 'update', text: 'See this', actionUrl: 'account page' }, key()));
    expect(link.code).toBe('url');
  });
});

describe('checklist templates', () => {
  it('need clients.templates: managers may, staff are refused', async () => {
    asManager();
    expect((await getOnboardingTemplates()).length).toBeGreaterThan(0);
    asStaff();
    expect((await apiError(getOnboardingTemplates())).status).toBe(403);
    expect((await apiError(saveOnboardingTemplate('welcome-call', { title: 'x', stage: 'welcome', owner: 'tekmadev', kind: 'meeting' }))).status).toBe(403);
    expect((await apiError(deleteOnboardingTemplate('welcome-call'))).status).toBe(403);
  });

  it('lists, creates, updates and deletes templates', async () => {
    const list = await getOnboardingTemplates();
    expect(zOnboardingTemplates.safeParse(list).success).toBe(true);
    expect(list.some((t) => t.key === 'welcome-call')).toBe(true);
    expect(list.some((t) => !t.active)).toBe(true);

    const badJson = await apiError(saveOnboardingTemplate('review-video', { title: 'Record a review video', stage: 'optimizing', owner: 'client', kind: 'upload', payload: '{ "assetKind": video }' }));
    expect([badJson.status, badJson.code, badJson.message]).toEqual([400, 'json', 'Payload must be valid JSON.']);
    expect(badJson.fields?.payload).toBe('Payload must be valid JSON.');

    const badKey = await apiError(saveOnboardingTemplate('Review Video!', { title: 'x', stage: 'welcome', owner: 'client', kind: 'upload' }));
    expect(badKey.code).toBe('key');

    const created = await saveOnboardingTemplate('review-video', {
      title: 'Record a review video',
      stage: 'optimizing',
      owner: 'client',
      kind: 'upload',
      plans: ['grow', 'lets-talk'],
      dueOffsetDays: 45,
      sortOrder: 30,
      description: 'Thirty seconds on your phone is plenty.',
      payload: '{ "assetKind": "video", "maxSeconds": 60 }',
      required: false,
      active: true,
    });
    expect(zOnboardingTemplate.safeParse(created).success).toBe(true);
    expect(created.payload).toEqual({ assetKind: 'video', maxSeconds: 60 });

    const edited = await saveOnboardingTemplate('review-video', { title: 'Record a short review video', stage: 'optimizing', owner: 'client', kind: 'upload' });
    expect(edited).toMatchObject({ title: 'Record a short review video', dueOffsetDays: 45, plans: ['grow', 'lets-talk'] });
    expect((await getOnboardingTemplates()).find((t) => t.key === 'review-video')?.title).toBe('Record a short review video');

    const deleted = await deleteOnboardingTemplate('review-video');
    expect(zDeletedTemplate.safeParse(deleted).success).toBe(true);
    expect((await getOnboardingTemplates()).some((t) => t.key === 'review-video')).toBe(false);
    expect((await apiError(deleteOnboardingTemplate('review-video'))).status).toBe(404);
  });
});

describe('DELETE /clients/:id', () => {
  it('needs clients.trash, and a trashed client disappears everywhere', async () => {
    asStaff();
    expect((await apiError(deleteClient('cl_waterdown_d'))).status).toBe(403);

    asOwner();
    const trashed = await deleteClient('cl_waterdown_d');
    expect(zClient.safeParse(trashed).success).toBe(true);
    expect(trashed.deletedAt).toEqual(expect.any(String));
    expect((await apiError(getClient('cl_waterdown_d'))).status).toBe(404);
    expect((await allRows({ status: 'all' })).some((r) => r.id === 'cl_waterdown_d')).toBe(false);
    expect((await getClients({})).stats.leads).toBe(1);
  });
});

describe('staff (capabilities, owner decision 2026-10-03)', () => {
  it('are refused every client write they do not hold, with "Your role cannot do that." and nothing changed', async () => {
    const before = await bundle(ACME);
    const run = before.onboarding?.run;
    const intake = before.intake;
    const grant = before.accessGrants[0];
    const call = before.calls[0];
    const member = before.members[0];
    if (!run || !intake || !grant || !call || !member) throw new Error('ACME should have a run, an intake, a grant, a call and a member');

    asStaff();
    const refused = [
      updateClient(ACME, { legalName: 'Nope Inc.' }),
      goLive(ACME),
      updateOnboarding(run.id, { blocked: false }),
      completeOnboarding(run.id),
      reviewIntake(intake.id),
      updateAccessGrant(grant.id, { status: 'verified' }),
      reviewCall(call.id, true),
      updateCall(call.id, { notes: 'Edited by staff.' }),
      addMember(ACME, { email: 'staff-added@acmeplumbing.test' }, key()),
      updateMember(member.id, { status: 'disabled' }),
      sendMemberLink(member.id),
    ];
    for (const attempt of refused) {
      const e = await apiError(attempt);
      expect([e.status, e.code, e.message]).toEqual([403, 'forbidden', 'Your role cannot do that.']);
    }

    asOwner();
    const after = await bundle(ACME);
    expect(after.client).toEqual(before.client);
    expect(after.onboarding?.run).toEqual(before.onboarding?.run);
    expect(after.intake).toEqual(before.intake);
    expect(after.calls).toEqual(before.calls);
    expect(after.members).toEqual(before.members);
  });

  it('may add a client by hand (2026-10-05): created, never shown money', async () => {
    asStaff();
    const created = await createClient({ businessName: 'Concession Street Bakery', email: 'hello@concessionbakery.test', planId: 'webline', sendInvite: false }, key());
    expect(zCreateClientResult.safeParse(created).success).toBe(true);
    expect(created).toMatchObject({ reused: false, invite: 'skipped', client: { businessName: 'Concession Street Bakery', status: 'pending' } });
    const b = await bundle(created.client.id);
    expect(b.billing).toBeNull();
  });

  it('may help with onboarding: tasks, access and approval requests, booked calls and activity', async () => {
    const run = (await bundle(ACME)).onboarding?.run;
    if (!run) throw new Error('expected a run');

    asStaff();
    const added = await addOnboardingTask(run.id, { title: 'Send the yard photos', owner: 'client', kind: 'general', required: false, stage: 'intake' }, key());
    expect(zTaskResult.safeParse(added).success).toBe(true);
    expect((await updateTaskStatus(added.task.id, 'done')).task.status).toBe('done');

    const grant = await requestAccess(ACME, { provider: 'google_analytics', note: 'Add staff@tekmadev.test as a viewer.' }, key());
    expect(zAccessGrant.safeParse(grant).success).toBe(true);

    const approval = await requestApproval(ACME, { title: 'Service area banner', kind: 'design' }, key());
    expect(zApproval.safeParse(approval).success).toBe(true);

    const logged = await logCall(ACME, { contactName: 'Marie Tremblay', phone: '+16135550188', status: 'confirmed' }, key());
    expect(zCallResult.safeParse(logged).success).toBe(true);

    const note = await postClientActivity(ACME, { kind: 'note', text: 'Asked for the yard photos.' }, key());
    expect(zActivity.safeParse(note).success).toBe(true);

    const b = await bundle(ACME);
    expect(b.billing).toBeNull();
    // Several writes can land in the same millisecond, so only check the note is on the timeline.
    expect(b.activity.items.some((a) => a.id === note.id)).toBe(true);
  });
});
