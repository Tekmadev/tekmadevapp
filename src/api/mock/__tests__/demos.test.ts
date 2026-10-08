import { api, setAuthBridge } from '@/api/client';
import { createClient, getClient } from '@/api/endpoints/clients';
import { createDemo, demosInfiniteQuery, getDemo, getDemos, updateDemo, type DemoListParams, type NewDemoInput } from '@/api/endpoints/demos';
import { ApiError } from '@/api/errors';
import { DEMO_IDS, demosDb } from '@/api/mock/fixtures/demos';
import { findLead, leadsDb } from '@/api/mock/fixtures/leads';
import { hexId } from '@/api/mock/fixtures/tools';
import { zDemoPage, zDemoRequest, type DemoRequest } from '@/api/schemas/demos';

/**
 * Demo requests through the real mock transport (contract "Demo requests: API
 * contract v1", 2026-10-05): schemas against the fixtures, the list's filters,
 * counts and cursor, `can` per role, the status rules, the error codes and
 * field keys, idempotent creates, and lead-to-client linking on conversion.
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
const key = () => `demo-key-${++keySeq}`;

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

/** Walk every page like useInfiniteQuery does, the cursor passed back verbatim. */
async function allDemos(params: DemoListParams = {}): Promise<{ pages: number; items: DemoRequest[] }> {
  const options = demosInfiniteQuery(params);
  const pages: Awaited<ReturnType<typeof getDemos>>[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page = await getDemos({ ...params, cursor });
    expect(zDemoPage.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return { pages: pages.length, items: pages.flatMap((p) => p.items) };
}

const ids = (items: DemoRequest[]) => items.map((d) => d.id);
const newestFirst = (items: DemoRequest[]) => items.every((d, i) => i === 0 || items[i - 1].createdAt >= d.createdAt);

const BUSINESS = {
  name: 'Locke Street Barbers',
  type: 'Barber shop',
  area: 'Hamilton (Kirkendall)',
  offer: 'Cuts, fades and hot towel shaves. Walk-ins and bookings.',
  website: null,
  brand: 'Black and gold sign',
  customers: null,
};

/** Leads no fixture request uses and that are not clients: each rule test takes its own. */
const FIXTURE_LEADS = [201, 111, 212, 213, 716].map((n) => hexId('ld', n));
const spareLeads = leadsDb.filter((l) => !l.convertedClientId && !FIXTURE_LEADS.includes(l.id)).slice(10);

/** A fresh request on a lead nobody asked a demo for, so each rule test starts clean. */
async function freshOnLead(as: () => void, n: number): Promise<DemoRequest> {
  as();
  const lead = spareLeads[n];
  if (!lead) throw new Error(`no spare lead ${n}`);
  const input: NewDemoInput = { leadId: lead.id, business: { ...BUSINESS, name: `${BUSINESS.name} ${++keySeq}` }, wants: null, neededBy: null };
  return createDemo(input, key());
}

describe('the fixtures', () => {
  it('parse as the schemas say, with every status and both kinds of target', async () => {
    const { items } = await allDemos({ status: 'all' });
    expect(items).toHaveLength(demosDb.length);
    expect(new Set(items.map((d) => d.status))).toEqual(new Set(['requested', 'building', 'ready', 'shown', 'cancelled']));
    expect(items.some((d) => d.clientId && !d.leadId)).toBe(true);
    expect(items.some((d) => d.leadId && !d.clientId)).toBe(true);
    for (const d of items) {
      expect(d.clientId ?? d.leadId).toBeTruthy();
      // List rows send no events.
      expect(d.events).toEqual([]);
      const detail = await getDemo(d.id);
      expect(zDemoRequest.safeParse(detail).success).toBe(true);
      expect(detail.events.length).toBeGreaterThan(0);
      expect(detail.events[0]).toMatchObject({ type: 'created', to: 'requested' });
      // Oldest first.
      expect(detail.events.every((e, i) => i === 0 || detail.events[i - 1].at <= e.at)).toBe(true);
      if (d.status === 'ready' || d.status === 'shown') expect(detail.demoUrl).toMatch(/^https:\/\//);
    }
  });

  it('names the client, the lead and the requester for display', async () => {
    const orleans = await getDemo(DEMO_IDS.orleansAuto);
    expect(orleans).toMatchObject({
      clientId: 'cl_orleansauto',
      clientName: 'Orleans Auto Detailing',
      leadName: 'Orleans Auto Detailing',
      requestedBy: 'staff@tekmadev.test',
      requestedByName: 'Noah Lavoie',
    });
    const tutoring = await getDemo(DEMO_IDS.stoneyTutoring);
    expect(tutoring).toMatchObject({ clientId: null, clientName: null, leadName: 'Stoney Creek Tutoring Centre', wants: null, neededBy: null });
  });
});

describe('GET /demos', () => {
  it('lists open requests by default, newest first, with counts', async () => {
    const page = await getDemos({});
    expect(page.items.every((d) => ['requested', 'building', 'ready'].includes(d.status))).toBe(true);
    expect(newestFirst(page.items)).toBe(true);
    expect(page.counts).toEqual({ open: 5, requested: 2, building: 1, ready: 2, mine: 1 });
    expect(page.counts.open).toBe(page.items.length);
  });

  it('filters by one status or all, and counts ignore the filter', async () => {
    const ready = await getDemos({ status: 'ready' });
    expect(ids(ready.items).sort()).toEqual([DEMO_IDS.orleansAuto, DEMO_IDS.dogGrooming].sort());
    const all = await getDemos({ status: 'all' });
    expect(all.items).toHaveLength(7);
    expect(ready.counts).toEqual(all.counts);
    expect(ids((await getDemos({ status: 'shown' })).items)).toEqual([DEMO_IDS.steeltownPhysio]);
    expect(ids((await getDemos({ status: 'cancelled' })).items)).toEqual([DEMO_IDS.waterdownDriving]);
  });

  it("shows only the caller's own with mine=1, and counts the caller's open ones", async () => {
    asStaff();
    const mine = await getDemos({ mine: true });
    expect(ids(mine.items).sort()).toEqual([DEMO_IDS.capitalWindows, DEMO_IDS.orleansAuto, DEMO_IDS.stoneyTutoring].sort());
    expect(mine.counts.mine).toBe(3);
    expect((await getDemos({ mine: true, status: 'all' })).items).toHaveLength(5);
    asManager();
    expect(ids((await getDemos({ mine: true })).items)).toEqual([DEMO_IDS.pelletier]);
  });

  it("narrows to a client's or a lead's requests, and the counts follow", async () => {
    const steeltown = await getDemos({ clientId: 'cl_steeltownph', status: 'all' });
    expect(ids(steeltown.items)).toEqual([DEMO_IDS.steeltownPhysio]);
    expect(steeltown.counts).toEqual({ open: 0, requested: 0, building: 0, ready: 0, mine: 0 });
    const lead = await getDemos({ leadId: hexId('ld', 111), status: 'all' });
    expect(ids(lead.items)).toEqual([DEMO_IDS.pelletier]);
    expect(lead.counts).toMatchObject({ open: 1, building: 1 });
    expect((await getDemos({ clientId: 'cl_acmeplumb01', status: 'all' })).items).toEqual([]);
  });

  it('pages with the cursor passed back verbatim', async () => {
    const { pages, items } = await allDemos({ status: 'all', limit: 3 });
    expect(pages).toBe(3);
    expect(items).toHaveLength(7);
    expect(new Set(ids(items)).size).toBe(7);
    expect(newestFirst(items)).toBe(true);
  });

  it('answers 400 for an unknown status filter', async () => {
    const e = await apiError(api.get('/demos', { query: { status: 'done' } }));
    expect([e.status, e.code]).toEqual([400, 'status']);
  });

  it('is open to every role (demos.view)', async () => {
    for (const as of [asOwner, asManager, asStaff]) {
      as();
      expect((await getDemos({ status: 'all' })).items.length).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('GET /demos/:id', () => {
  it('answers 404 not_found with the contract copy', async () => {
    const e = await apiError(getDemo('nope'));
    expect([e.status, e.code, e.message]).toEqual([404, 'not_found', 'That demo request no longer exists.']);
  });
});

describe('can, per caller', () => {
  it('gives owners and managers everything on an open request', async () => {
    for (const as of [asOwner, asManager]) {
      as();
      expect((await getDemo(DEMO_IDS.capitalWindows)).can).toEqual({ edit: true, cancel: true, markShown: false, manage: true });
      expect((await getDemo(DEMO_IDS.orleansAuto)).can).toEqual({ edit: true, cancel: true, markShown: true, manage: true });
    }
  });

  it('gives the requester edit and cancel while requested or building, and Mark as shown when ready', async () => {
    asStaff();
    expect((await getDemo(DEMO_IDS.capitalWindows)).can).toEqual({ edit: true, cancel: true, markShown: false, manage: false });
    expect((await getDemo(DEMO_IDS.orleansAuto)).can).toEqual({ edit: false, cancel: false, markShown: true, manage: false });
  });

  it("gives staff nothing on someone else's request", async () => {
    asStaff();
    expect((await getDemo(DEMO_IDS.pelletier)).can).toEqual({ edit: false, cancel: false, markShown: false, manage: false });
    expect((await getDemo(DEMO_IDS.dogGrooming)).can).toEqual({ edit: false, cancel: false, markShown: false, manage: false });
  });

  it('gives nobody anything on a closed request', async () => {
    for (const as of [asOwner, asManager, asStaff]) {
      as();
      const none = { edit: false, cancel: false, markShown: false, manage: false };
      expect((await getDemo(DEMO_IDS.steeltownPhysio)).can).toEqual(none);
      expect((await getDemo(DEMO_IDS.waterdownDriving)).can).toEqual(none);
    }
  });
});

describe('POST /demos', () => {
  it('creates a request for a lead: requested, by the caller, with the created event', async () => {
    asStaff();
    const created = await createDemo(
      { leadId: hexId('ld', 105), business: { ...BUSINESS, name: 'Brown Brothers Landscaping' }, wants: '  A gallery of their patios.  ', neededBy: '2026-11-03' },
      key(),
    );
    expect(zDemoRequest.safeParse(created).success).toBe(true);
    expect(created).toMatchObject({
      status: 'requested',
      clientId: null,
      leadId: hexId('ld', 105),
      leadName: 'Brown Brothers Landscaping',
      wants: 'A gallery of their patios.',
      neededBy: '2026-11-03',
      requestedBy: 'staff@tekmadev.test',
      requestedByName: 'Noah Lavoie',
      demoUrl: null,
      builderEmail: null,
      can: { edit: true, cancel: true, markShown: false, manage: false },
    });
    expect(created.events).toEqual([expect.objectContaining({ type: 'created', by: 'staff@tekmadev.test', byName: 'Noah Lavoie', from: null, to: 'requested' })]);
    // It is in the list now, first.
    expect((await getDemos({ mine: true })).items[0].id).toBe(created.id);
  });

  it('creates one for a client', async () => {
    const created = await createDemo({ clientId: 'cl_acmeplumb01', business: { ...BUSINESS, name: 'Acme Plumbing' } }, key());
    expect(created).toMatchObject({ clientId: 'cl_acmeplumb01', clientName: 'Acme Plumbing', leadId: null, wants: null, neededBy: null });
    expect(ids((await getDemos({ clientId: 'cl_acmeplumb01', status: 'all' })).items)).toEqual([created.id]);
  });

  it('carries the client when the lead already became one', async () => {
    const lead = findLead(hexId('ld', 716));
    expect(lead?.convertedClientId).toBe('cl_orleansauto');
    const created = await createDemo({ leadId: hexId('ld', 716), business: BUSINESS }, key());
    expect(created).toMatchObject({ leadId: hexId('ld', 716), clientId: 'cl_orleansauto' });
  });

  it('needs exactly one of clientId and leadId: 400 target', async () => {
    for (const body of [{ business: BUSINESS }, { clientId: 'cl_acmeplumb01', leadId: hexId('ld', 201), business: BUSINESS }, { clientId: '  ', business: BUSINESS }]) {
      const e = await apiError(api.post('/demos', { ...body, idempotencyKey: key() }));
      expect([e.status, e.code, e.message]).toEqual([400, 'target', 'Pick the client or lead this demo is for.']);
    }
  });

  it('answers 400 validation with the contract field keys', async () => {
    const e = await apiError(
      api.post('/demos', {
        leadId: hexId('ld', 201),
        business: { name: ' ', type: 'x'.repeat(81), offer: '', website: 'w'.repeat(501), brand: 7, customers: 'c'.repeat(501) },
        wants: 'w'.repeat(2001),
        neededBy: '2026-02-30',
        idempotencyKey: key(),
      }),
    );
    // The message is the first problem's words, like the server's.
    expect([e.status, e.code, e.message]).toEqual([400, 'validation', 'Enter the business name.']);
    expect(Object.keys(e.fields ?? {}).sort()).toEqual(['area', 'brand', 'businessName', 'businessType', 'customers', 'neededBy', 'offer', 'wants', 'website'].sort());
    expect(e.fields).toMatchObject({ businessName: 'Enter the business name.', area: 'Enter the city or area they serve.', neededBy: 'Pick a valid date.' });
  });

  it('answers 400 validation when the business is missing altogether', async () => {
    const e = await apiError(api.post('/demos', { clientId: 'cl_acmeplumb01', idempotencyKey: key() }));
    expect(Object.keys(e.fields ?? {}).sort()).toEqual(['area', 'businessName', 'businessType', 'offer']);
  });

  it('answers 404 for an unknown client or lead', async () => {
    const client = await apiError(createDemo({ clientId: 'cl_nope', business: BUSINESS }, key()));
    expect([client.status, client.code, client.message]).toEqual([404, 'not_found', 'That client no longer exists.']);
    const lead = await apiError(createDemo({ leadId: 'ld_nope', business: BUSINESS }, key()));
    expect([lead.status, lead.code, lead.message]).toEqual([404, 'not_found', 'That lead no longer exists.']);
  });

  it('hides test clients from staff (404), like the clients routes', async () => {
    asStaff();
    const e = await apiError(createDemo({ clientId: 'cl_testco_0001', business: BUSINESS }, key()));
    expect([e.status, e.code]).toEqual([404, 'not_found']);
  });

  it('is idempotent: the same key and body give the first result, never a second request', async () => {
    const before = demosDb.length;
    const k = key();
    const input: NewDemoInput = { leadId: hexId('ld', 207), business: { ...BUSINESS, name: 'Ottawa Valley Snow' } };
    const first = await createDemo(input, k);
    const again = await createDemo(input, k);
    expect(again.id).toBe(first.id);
    expect(demosDb.length).toBe(before + 1);
  });

  it('is idempotent on the body key alone too (no header), and refuses the key with a different body', async () => {
    const before = demosDb.length;
    const k = key();
    const body = { leadId: hexId('ld', 106), business: { ...BUSINESS, name: 'Nguyen Dental Group' }, idempotencyKey: k };
    const first = await api.post<DemoRequest>('/demos', body);
    const again = await api.post<DemoRequest>('/demos', body);
    expect(again.id).toBe(first.id);
    expect(demosDb.length).toBe(before + 1);
    const changed = await apiError(api.post('/demos', { ...body, wants: 'Something else' }));
    expect([changed.status, changed.code, changed.message]).toEqual([
      409,
      'idempotency_conflict',
      'That request was already sent with different details. Start again.',
    ]);
    const missing = await apiError(api.post('/demos', { ...body, idempotencyKey: undefined }));
    expect([missing.status, missing.code]).toEqual([400, 'idempotency']);
  });
});

describe('POST /demos with demoUrl: already built (demos.manage)', () => {
  const LINK = 'https://hamilton-grooming.vercel.app';

  it('starts ready, the caller as the builder, with the created, builder, link and status events', async () => {
    asManager();
    const created = await createDemo(
      { leadId: hexId('ld', 212), business: { ...BUSINESS, name: 'Hamilton Mobile Grooming' }, wants: null, neededBy: null, demoUrl: `  ${LINK}  ` },
      key(),
    );
    expect(zDemoRequest.safeParse(created).success).toBe(true);
    expect(created).toMatchObject({
      status: 'ready',
      demoUrl: LINK,
      builderEmail: 'manager@tekmadev.test',
      requestedBy: 'manager@tekmadev.test',
      requestedByName: 'Maya Chen',
      readyAt: created.createdAt,
      shownAt: null,
      cancelledAt: null,
      builderNote: null,
      leadId: hexId('ld', 212),
      can: { edit: true, cancel: true, markShown: true, manage: true },
    });
    expect(created.events.map((e) => [e.type, e.from, e.to, e.by])).toEqual([
      ['created', null, 'requested', 'manager@tekmadev.test'],
      ['builder', null, 'manager@tekmadev.test', 'manager@tekmadev.test'],
      ['link', null, LINK, 'manager@tekmadev.test'],
      ['status', 'requested', 'ready', 'manager@tekmadev.test'],
    ]);
    // Staff reading it: nothing to do on someone else's request.
    asStaff();
    expect((await getDemo(created.id)).can).toEqual({ edit: false, cancel: false, markShown: false, manage: false });
    // From then on an ordinary ready request.
    asManager();
    expect((await updateDemo(created.id, { status: 'shown' })).status).toBe('shown');
  });

  it('carries the client when the lead already became one, and works for a client too', async () => {
    asOwner();
    const lead = await createDemo({ leadId: hexId('ld', 716), business: BUSINESS, demoUrl: 'https://orleans-auto.vercel.app' }, key());
    expect(lead).toMatchObject({ status: 'ready', leadId: hexId('ld', 716), clientId: 'cl_orleansauto', builderEmail: 'owner@tekmadev.test' });
    const client = await createDemo({ clientId: 'cl_acmeplumb01', business: BUSINESS, demoUrl: 'https://acme-demo.vercel.app' }, key());
    expect(client).toMatchObject({ status: 'ready', clientId: 'cl_acmeplumb01', clientName: 'Acme Plumbing' });
  });

  it('refuses a link from staff with 403 forbidden and writes nothing; no link is an ordinary request', async () => {
    asStaff();
    const before = demosDb.length;
    const e = await apiError(createDemo({ leadId: hexId('ld', 105), business: BUSINESS, demoUrl: LINK }, key()));
    expect([e.status, e.code, e.message]).toEqual([403, 'forbidden', 'Your role cannot do that.']);
    // The 403 comes before the 404.
    const gone = await apiError(createDemo({ leadId: 'ld_nope', business: BUSINESS, demoUrl: LINK }, key()));
    expect(gone.status).toBe(403);
    expect(demosDb.length).toBe(before);
    for (const demoUrl of [null, '', '   ']) {
      const plain = await createDemo({ leadId: hexId('ld', 105), business: BUSINESS, demoUrl }, key());
      expect(plain).toMatchObject({ status: 'requested', demoUrl: null, builderEmail: null, readyAt: null });
      expect(plain.events.map((ev) => ev.type)).toEqual(['created']);
    }
    asManager();
    const missing = await apiError(createDemo({ leadId: 'ld_nope', business: BUSINESS, demoUrl: LINK }, key()));
    expect([missing.status, missing.message]).toEqual([404, 'That lead no longer exists.']);
  });

  it('checks the link with the other fields: one 400 validation, the first problem as the message', async () => {
    asManager();
    const both = await apiError(api.post('/demos', { leadId: hexId('ld', 105), business: { ...BUSINESS, offer: ' ' }, demoUrl: 'http://x.vercel.app', idempotencyKey: key() }));
    expect([both.status, both.code, both.message]).toEqual([400, 'validation', 'Say what they sell or do.']);
    expect(both.fields).toEqual({ offer: 'Say what they sell or do.', demoUrl: 'Enter a full link starting with https://.' });
    for (const demoUrl of ['grooming.vercel.app', 'https://localhost', 'https://user:pw@x.vercel.app', 'https://x.vercel.app/a b', `https://${'a'.repeat(2000)}.app`, 42]) {
      const e = await apiError(api.post('/demos', { leadId: hexId('ld', 105), business: BUSINESS, demoUrl, idempotencyKey: key() }));
      expect([e.status, e.code, e.message, e.fields]).toEqual([400, 'validation', 'Enter a full link starting with https://.', { demoUrl: 'Enter a full link starting with https://.' }]);
    }
    // A bad link from staff is a 400 first (validation comes before the role check).
    asStaff();
    const staff = await apiError(api.post('/demos', { leadId: hexId('ld', 105), business: BUSINESS, demoUrl: 'http://x', idempotencyKey: key() }));
    expect([staff.status, staff.code]).toEqual([400, 'validation']);
  });

  it('replays the same key with the same link, and refuses a different, added or removed link', async () => {
    asManager();
    const before = demosDb.length;
    const k = key();
    const body = { leadId: hexId('ld', 207), business: { ...BUSINESS, name: 'Ottawa Valley Snow' }, demoUrl: LINK, idempotencyKey: k };
    const first = await api.post<DemoRequest>('/demos', body);
    const again = await api.post<DemoRequest>('/demos', { ...body, demoUrl: ` ${LINK} ` });
    expect(again.id).toBe(first.id);
    expect(demosDb.length).toBe(before + 1);
    const conflict = [409, 'idempotency_conflict', 'That request was already sent with different details. Start again.'];
    for (const demoUrl of ['https://other.vercel.app', null]) {
      const e = await apiError(api.post('/demos', { ...body, demoUrl }));
      expect([e.status, e.code, e.message]).toEqual(conflict);
    }

    // Without a link, a blank one is the same request; adding one is not.
    const k2 = key();
    const plain = { leadId: hexId('ld', 207), business: { ...BUSINESS, name: 'Ottawa Valley Snow' }, idempotencyKey: k2 };
    const plainFirst = await api.post<DemoRequest>('/demos', plain);
    expect((await api.post<DemoRequest>('/demos', { ...plain, demoUrl: '' })).id).toBe(plainFirst.id);
    expect((await api.post<DemoRequest>('/demos', { ...plain, demoUrl: null })).id).toBe(plainFirst.id);
    const added = await apiError(api.post('/demos', { ...plain, demoUrl: LINK }));
    expect([added.status, added.code]).toEqual([409, 'idempotency_conflict']);
    expect(demosDb.length).toBe(before + 2);
  });
});

describe('PATCH /demos/:id: building it (demos.manage)', () => {
  it('walks requested -> building -> ready -> shown with events and timestamps', async () => {
    const d = await freshOnLead(asStaff, 0);
    asManager();
    const building = await updateDemo(d.id, { status: 'building', builderEmail: 'manager@tekmadev.test' });
    expect(building.status).toBe('building');
    expect(building.builderEmail).toBe('manager@tekmadev.test');
    expect(building.events.slice(1).map((e) => [e.type, e.from, e.to])).toEqual([
      ['builder', null, 'manager@tekmadev.test'],
      ['status', 'requested', 'building'],
    ]);

    // Ready without a link: the server says so, and nothing changes.
    const noLink = await apiError(updateDemo(d.id, { status: 'ready' }));
    expect([noLink.status, noLink.code, noLink.message]).toEqual([400, 'demo_url', 'Add the demo link first.']);
    expect(noLink.fields).toEqual({ demoUrl: 'Add the demo link first.' });
    expect((await getDemo(d.id)).status).toBe('building');

    const ready = await updateDemo(d.id, { demoUrl: 'https://demos.tekmadev.test/locke-street', status: 'ready', builderNote: 'Photos are placeholders.' });
    expect(ready).toMatchObject({ status: 'ready', demoUrl: 'https://demos.tekmadev.test/locke-street', builderNote: 'Photos are placeholders.' });
    expect(ready.readyAt).not.toBeNull();
    expect(ready.events.slice(3).map((e) => e.type)).toEqual(['edited', 'link', 'status']);

    // Rework, then ready again (the link is still there).
    const rework = await updateDemo(d.id, { status: 'building' });
    expect(rework).toMatchObject({ status: 'building', readyAt: null });
    const readyAgain = await updateDemo(d.id, { status: 'ready' });
    expect(readyAgain.status).toBe('ready');

    const shown = await updateDemo(d.id, { status: 'shown' });
    expect(shown.status).toBe('shown');
    expect(shown.shownAt).not.toBeNull();
    expect(shown.can).toEqual({ edit: false, cancel: false, markShown: false, manage: false });
  });

  it('refuses a step out of order with 409 status', async () => {
    const d = await freshOnLead(asStaff, 1);
    asOwner();
    for (const status of ['ready', 'shown'] as const) {
      const e = await apiError(updateDemo(d.id, { status }));
      expect([e.status, e.code]).toEqual([409, 'status']);
    }
  });

  it('cancels any open request, and a closed one answers 409 demo_closed to everything', async () => {
    const d = await freshOnLead(asStaff, 2);
    asOwner();
    const cancelled = await updateDemo(d.id, { status: 'cancelled' });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).not.toBeNull();
    for (const patch of [{ status: 'requested' as const }, { builderNote: 'Late note' }, { business: { area: 'Dundas' } }]) {
      const e = await apiError(updateDemo(d.id, patch));
      expect([e.status, e.code, e.message]).toEqual([409, 'demo_closed', 'This demo request is closed.']);
    }
  });

  it('checks the link, the builder and the note', async () => {
    const d = await freshOnLead(asStaff, 3);
    asOwner();
    const e = await apiError(updateDemo(d.id, { demoUrl: 'http://demos.tekmadev.test/x', builderEmail: 'someone@else.test', builderNote: 'n'.repeat(1001) }));
    expect([e.status, e.code]).toEqual([400, 'validation']);
    expect(Object.keys(e.fields ?? {}).sort()).toEqual(['builderEmail', 'builderNote', 'demoUrl']);
    // Clearing the link of a ready request is refused like entering ready without one.
    await updateDemo(d.id, { status: 'building' });
    await updateDemo(d.id, { demoUrl: 'https://demos.tekmadev.test/y', status: 'ready' });
    const cleared = await apiError(updateDemo(d.id, { demoUrl: null }));
    expect([cleared.status, cleared.code]).toEqual([400, 'demo_url']);
  });
});

describe('PATCH /demos/:id: the requester (demos.request, own request)', () => {
  it('edits the request while requested or building, with an edited event', async () => {
    const d = await freshOnLead(asStaff, 4);
    const edited = await updateDemo(d.id, { business: { area: 'Hamilton and Dundas', website: null }, wants: 'A price list.', neededBy: '2026-12-01' });
    expect(edited.business).toMatchObject({ area: 'Hamilton and Dundas', website: null, name: d.business.name });
    expect(edited).toMatchObject({ wants: 'A price list.', neededBy: '2026-12-01' });
    expect(edited.events.map((e) => e.type)).toEqual(['created', 'edited']);
    // Saving the same values again writes nothing.
    const same = await updateDemo(d.id, { wants: 'A price list.' });
    expect(same.events).toHaveLength(2);
    // A required field cannot be blanked.
    const blank = await apiError(updateDemo(d.id, { business: { name: ' ' } }));
    expect(blank.fields).toEqual({ businessName: 'Enter the business name.' });
  });

  it('may cancel while requested or building, and mark shown once ready', async () => {
    const toCancel = await freshOnLead(asStaff, 5);
    expect((await updateDemo(toCancel.id, { status: 'cancelled' })).status).toBe('cancelled');

    const toShow = await freshOnLead(asStaff, 6);
    asOwner();
    await updateDemo(toShow.id, { status: 'building' });
    await updateDemo(toShow.id, { status: 'ready', demoUrl: 'https://demos.tekmadev.test/z' });
    asStaff();
    const ready = await getDemo(toShow.id);
    expect(ready.can).toEqual({ edit: false, cancel: false, markShown: true, manage: false });
    // Ready: no more edits or cancelling by the requester.
    const edit = await apiError(updateDemo(toShow.id, { wants: 'More photos' }));
    expect([edit.status, edit.code]).toEqual([409, 'demo_ready']);
    const cancel = await apiError(updateDemo(toShow.id, { status: 'cancelled' }));
    expect([cancel.status, cancel.code]).toEqual([409, 'status']);
    const shown = await updateDemo(toShow.id, { status: 'shown' });
    expect(shown.status).toBe('shown');
    expect(shown.events[shown.events.length - 1]).toMatchObject({ type: 'status', from: 'ready', to: 'shown', by: 'staff@tekmadev.test' });
  });

  it("may not take the builder's steps or set the builder's fields: 403 forbidden", async () => {
    const d = await freshOnLead(asStaff, 7);
    for (const patch of [{ status: 'building' as const }, { demoUrl: 'https://demos.tekmadev.test/a' }, { builderEmail: 'staff@tekmadev.test' }, { builderNote: 'Hi' }]) {
      const e = await apiError(updateDemo(d.id, patch));
      expect([e.status, e.code, e.message]).toEqual([403, 'forbidden', 'Your role cannot do that.']);
    }
    // A step that is right but early is a conflict, not a role limit.
    const early = await apiError(updateDemo(d.id, { status: 'shown' }));
    expect([early.status, early.code]).toEqual([409, 'status']);
  });

  it("refuses someone else's request without demos.manage: 403 forbidden, nothing changed", async () => {
    asStaff();
    const before = await getDemo(DEMO_IDS.pelletier);
    const e = await apiError(updateDemo(DEMO_IDS.pelletier, { wants: 'Mine now' }));
    expect([e.status, e.code, e.message]).toEqual([403, 'forbidden', 'Your role cannot do that.']);
    expect(await getDemo(DEMO_IDS.pelletier)).toEqual(before);
  });

  it('answers 404 for a request that is gone', async () => {
    const e = await apiError(updateDemo('nope', { wants: 'x' }));
    expect([e.status, e.code]).toEqual([404, 'not_found']);
  });
});

describe('lead conversion', () => {
  it("links the lead's requests to the new client and keeps the leadId", async () => {
    const leadId = hexId('ld', 201);
    const lead = findLead(leadId);
    if (!lead) throw new Error('expected the Capital Window Cleaning lead');
    expect(lead.convertedClientId).toBeNull();
    expect((await getDemo(DEMO_IDS.capitalWindows)).clientId).toBeNull();

    asStaff();
    const created = await createClient({ businessName: 'Capital Window Cleaning', email: lead.email, sendInvite: false, leadId }, key());
    const clientId = created.client.id;
    expect((await getClient(clientId)).client.businessName).toBe('Capital Window Cleaning');

    const linked = await getDemo(DEMO_IDS.capitalWindows);
    expect(linked).toMatchObject({ clientId, clientName: 'Capital Window Cleaning', leadId, leadName: 'Capital Window Cleaning' });
    expect(ids((await getDemos({ clientId, status: 'all' })).items)).toEqual([DEMO_IDS.capitalWindows]);
    expect(ids((await getDemos({ leadId, status: 'all' })).items)).toEqual([DEMO_IDS.capitalWindows]);
  });
});
