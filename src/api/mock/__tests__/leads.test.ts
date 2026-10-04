import { api, setAuthBridge } from '@/api/client';
import { getLead, getLeads, leadsInfiniteQuery, type LeadListParams } from '@/api/endpoints/leads';
import { ApiError } from '@/api/errors';
import { leadsDb, metaFixture } from '@/api/mock/fixtures/leads';
import { toolSubmissionsDb, leadIdFor } from '@/api/mock/fixtures/tools';
import { metaFragment, zLead, zLeadPage, type Lead } from '@/api/schemas/leads';

/**
 * The leads domain through the real mock transport: schemas, cursor paging,
 * server-side search and filters, the documented filter errors, and the links to
 * other domains (inbox anchors, clients, free tool submissions).
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

/** Walk every page like useInfiniteQuery does, the cursor passed back verbatim. */
async function allLeads(params: LeadListParams = {}): Promise<{ pages: number; items: Lead[] }> {
  const options = leadsInfiniteQuery(params);
  const pages: Awaited<ReturnType<typeof getLeads>>[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page = await getLeads({ ...params, cursor });
    expect(zLeadPage.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return { pages: pages.length, items: pages.flatMap((p) => p.items) };
}

const newestFirst = (items: Lead[]) => items.every((l, i) => i === 0 || items[i - 1].createdAt >= l.createdAt);

describe('meta fragment', () => {
  it('matches its schema and carries the website labels', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
    const label = (list: { value: string; label: string }[], value: string) => list.find((o) => o.value === value)?.label;
    expect(label(metaFixture.leadSources, 'grow')).toBe('Lead form');
    expect(label(metaFixture.leadNeeds, 'custom')).toBe('A custom build: AI, app or software');
    expect(label(metaFixture.leadRevenueBands, '100k_plus')).toBe('$100K+ a month');
    expect(metaFixture.leadStatuses.find((s) => s.value === 'new')?.tone).toBe('gold');
    expect(metaFixture.leadStatuses.find((s) => s.value === 'booked')?.tone).toBe('ok');
    expect(metaFixture.leadStatuses.filter((s) => s.value !== 'new' && s.value !== 'booked').every((s) => s.tone === 'muted')).toBe(true);
  });
});

describe('GET /leads', () => {
  it('pages every lead newest first and ends on a short page', async () => {
    const { pages, items } = await allLeads();
    expect(items.length).toBe(leadsDb.length);
    expect(items.length).toBeGreaterThan(60);
    expect(pages).toBe(Math.ceil(items.length / 30));
    expect(new Set(items.map((l) => l.id)).size).toBe(items.length);
    expect(newestFirst(items)).toBe(true);
    // Instants carry microseconds, like the server.
    expect(items[0].createdAt).toMatch(/\.\d{6}Z$/);
    // Every source is there, plus the edge cases screens must handle.
    expect(new Set(items.map((l) => l.source))).toEqual(new Set(['cal_booking', 'grow', 'lead_magnet', 'portal_signup']));
    expect(items.some((l) => l.name === null)).toBe(true);
    expect(items.some((l) => l.phone === null)).toBe(true);
    expect(items.some((l) => (l.business ?? '').length > 50)).toBe(true);
    expect(items.some((l) => (l.message ?? '').includes('\n'))).toBe(true);
  });

  it('honours a smaller limit and returns a short last page', async () => {
    const first = await getLeads({ limit: 25 });
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await getLeads({ limit: 25, cursor: first.nextCursor });
    expect(second.items[0].createdAt <= first.items[24].createdAt).toBe(true);
    expect(second.items.some((l) => first.items.some((f) => f.id === l.id))).toBe(false);
    const last = await getLeads({ limit: 100 });
    expect(last.items.length).toBe(leadsDb.length);
    expect(last.nextCursor).toBeNull();
  });

  it('filters by source, status and need on the server', async () => {
    const forms = (await allLeads({ source: 'grow' })).items;
    expect(forms.length).toBeGreaterThan(5);
    expect(forms.every((l) => l.source === 'grow' && l.need !== null && l.revenue !== null)).toBe(true);

    const booked = (await allLeads({ status: 'booked' })).items;
    expect(booked.length).toBeGreaterThan(2);
    expect(booked.every((l) => l.status === 'booked' && l.source === 'cal_booking')).toBe(true);
    // A call that is still booked is in the future.
    expect(booked.every((l) => l.bookingAt !== null && Date.parse(l.bookingAt) > Date.now())).toBe(true);

    const website = (await allLeads({ need: 'website', source: 'cal_booking' })).items;
    expect(website.length).toBeGreaterThan(0);
    expect(website.every((l) => l.need === 'website' && l.source === 'cal_booking')).toBe(true);

    const none = await getLeads({ status: 'won', source: 'lead_magnet', need: 'content' });
    expect(none.items).toHaveLength(0);
    expect(none.nextCursor).toBeNull();
  });

  it('searches name, email, business and phone', async () => {
    const byBusiness = (await allLeads({ q: 'snow & ice' })).items;
    expect(byBusiness.map((l) => l.name)).toContain('Lucas Fortin');
    const byEmail = (await allLeads({ q: 'ACMEPLUMBING' })).items;
    expect(byEmail).toHaveLength(1);
    expect(byEmail[0].convertedClientId).toBe('cl_acmeplumb01');
    const byPhone = (await allLeads({ q: '+16135550171' })).items;
    expect(byPhone[0].source).toBe('portal_signup');
    expect((await allLeads({ q: 'zzz-no-such-lead' })).items).toHaveLength(0);
  });

  it('returns the documented filter errors', async () => {
    const source = await apiError(api.get('/leads', { query: { source: 'billboard' } }));
    expect([source.status, source.code, source.message]).toEqual([400, 'source', 'Unknown lead source.']);
    const status = await apiError(api.get('/leads', { query: { status: 'hot' } }));
    expect([status.status, status.code]).toEqual([400, 'status']);
    const need = await apiError(api.get('/leads', { query: { need: 'seo' } }));
    expect([need.status, need.code]).toEqual([400, 'need']);
  });

  it('is open to managers and staff too (leads.view)', async () => {
    asManager();
    const page = await getLeads({});
    expect(zLeadPage.safeParse(page).success).toBe(true);
    expect(page.items.length).toBe(30);
    asStaff();
    expect((await getLeads({})).items).toEqual(page.items);
  });
});

describe('GET /leads/:id', () => {
  it('returns one lead with every field', async () => {
    const lead = await getLead('ld_cdab8924');
    expect(zLead.safeParse(lead).success).toBe(true);
    // The newest booking in the inbox: same person and need.
    expect(lead).toMatchObject({ name: 'Olivia Martin', source: 'cal_booking', status: 'booked', need: 'customers', revenue: '20k_50k' });
    expect(lead.utm).toEqual({ source: 'facebook', medium: 'paid_social', campaign: 'growth-ottawa-home-services' });
    expect(lead.referrer).toBe('https://l.facebook.com/');
  });

  it('links free tool submissions to their lead', async () => {
    const submission = toolSubmissionsDb[0];
    const lead = await getLead(leadIdFor(submission.id));
    expect(lead).toMatchObject({ source: 'lead_magnet', email: submission.email, createdAt: submission.createdAt, need: null, revenue: null });
  });

  it('answers 404 for an unknown id', async () => {
    const e = await apiError(getLead('ld_nope'));
    expect([e.status, e.code, e.message]).toEqual([404, 'not_found', 'That lead no longer exists.']);
  });
});
