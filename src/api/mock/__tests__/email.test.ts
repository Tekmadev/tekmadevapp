import { api, setAuthBridge } from '@/api/client';
import {
  createCampaign,
  deleteCampaign,
  deleteSubscriber,
  getEmailOverview,
  getEmailTemplates,
  getSubscriber,
  getSubscribers,
  setCampaignActive,
  subscribersInfiniteQuery,
  unsubscribeSubscriber,
  type SubscriberListParams,
} from '@/api/endpoints/email';
import { ApiError } from '@/api/errors';
import { crmState } from '@/api/mock/fixtures/crm';
import { ERASE_FAILS_SUBSCRIBER_ID, erasedEmails, metaFixture } from '@/api/mock/fixtures/email';
import {
  metaFragment,
  zCampaign,
  zEmailOverview,
  zEmailTemplates,
  zSubscriberDetail,
  zSubscriberPage,
  type Subscriber,
  type SubscriberPage,
} from '@/api/schemas/email';

/**
 * The email domain through the real mock transport: schemas, campaign rules
 * (key, name, dupe, counters that reset when a key is re-added), templates
 * with intact merge tags, subscriber paging and filters, unsubscribe, and
 * permanent erasure (including the seeded `crm_erase` failure).
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
const key = () => `test-email-${(keySeq += 1)}`;

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

async function allPages(params: SubscriberListParams) {
  const options = subscribersInfiniteQuery(params);
  const pages: SubscriberPage[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page = await getSubscribers({ ...params, cursor });
    expect(zSubscriberPage.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return pages;
}

const everyone = async (): Promise<Subscriber[]> => (await allPages({ limit: 100 })).flatMap((p) => p.items);

describe('meta fragment', () => {
  it('matches its schema and carries the exact labels', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
    expect(metaFixture.unsubscribeReasons.map((r) => r.label)).toEqual(['Too many emails', 'Not relevant to me', 'I never signed up', 'Something else']);
    expect(metaFixture.unsubscribeSources.map((s) => s.label)).toEqual(
      expect.arrayContaining(['via the unsubscribe page', 'via the CRM', 'via the CRM, as permanent']),
    );
    expect(metaFixture.consentEvents.find((e) => e.value === 'complained')?.label).toBe('Marked as spam');
    expect(metaFixture.consentEvents.find((e) => e.value === 'reason')?.label).toBe('Said why they left');
  });
});

describe('capabilities', () => {
  it('lets staff read the overview and templates, nothing else (email.view)', async () => {
    asStaff();
    expect((await getEmailOverview()).campaigns.length).toBeGreaterThan(0);
    expect((await getEmailTemplates()).length).toBeGreaterThan(0);
    const calls: Promise<unknown>[] = [
      createCampaign({ key: 'nope', name: 'Nope' }, key()),
      setCampaignActive('camp_welcome01', false),
      deleteCampaign('camp_welcome01'),
      getSubscribers({}),
      getSubscriber('sub_olivia001'),
      unsubscribeSubscriber('sub_olivia001'),
      deleteSubscriber('sub_olivia001'),
    ];
    for (const call of calls) expect(await apiError(call)).toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('lets a manager read subscribers', async () => {
    asManager();
    expect((await getSubscribers({})).items.length).toBeGreaterThan(0);
    expect((await getSubscriber('sub_olivia001')).subscriber.id).toBe('sub_olivia001');
  });
});

describe('GET /email/overview', () => {
  it('has consistent stats, campaigns newest first and the latest events', async () => {
    const overview = await getEmailOverview();
    expect(zEmailOverview.safeParse(overview).success).toBe(true);
    const all = await everyone();
    expect(overview.stats.activeSubscribers).toBe(all.filter((s) => s.status === 'active').length);
    expect(overview.stats.new30d).toBeGreaterThan(0);
    expect(overview.stats.opens30d).toBeGreaterThan(overview.stats.clicks30d);
    const created = overview.campaigns.map((c) => c.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
    expect(overview.campaigns.find((c) => c.key === 'win-back')).toMatchObject({ opens: 0, clicks: 0, active: false });
    expect(overview.recentEvents.length).toBeLessThanOrEqual(25);
    const at = overview.recentEvents.map((e) => e.at);
    expect([...at].sort().reverse()).toEqual(at);
    expect(overview.recentEvents.every((e) => (e.type === 'open' ? e.link === null : !!e.link))).toBe(true);
  });
});

describe('GET /email/templates', () => {
  it('returns ready-made emails whose HTML keeps the merge tags exactly', async () => {
    const templates = await getEmailTemplates();
    expect(zEmailTemplates.safeParse(templates).success).toBe(true);
    expect(templates.length).toBeGreaterThanOrEqual(4);
    expect(templates.length).toBeLessThanOrEqual(6);
    for (const t of templates) {
      expect(t.html).toContain('{{contact.first_name}}');
      expect(t.html).toContain('{{unsubscribe}}');
      expect(t.html).toContain(`c=${t.key}`);
      expect(t.html).toMatch(/<table role="presentation"/);
      expect(t.previewHtml).not.toContain('{{');
      expect(t.previewHtml).not.toContain('/api/email/open');
      expect(t.useWhen.length).toBeGreaterThan(0);
    }
  });
});

describe('campaigns', () => {
  it('creates a campaign (key lowercased) that shows up in the overview', async () => {
    const created = await createCampaign({ key: 'Newsletter-2026-10', name: ' October newsletter ', subject: '', template: 'newsletter' }, key());
    expect(zCampaign.safeParse(created).success).toBe(true);
    expect(created).toMatchObject({ key: 'newsletter-2026-10', name: 'October newsletter', subject: null, template: 'newsletter', active: true, opens: 0, clicks: 0 });
    const overview = await getEmailOverview();
    expect(overview.campaigns[0].id).toBe(created.id);
  });

  it('returns the documented validation errors with inline fields', async () => {
    const badKey = await apiError(createCampaign({ key: 'not ok!', name: 'Fine' }, key()));
    expect(badKey).toMatchObject({ status: 400, code: 'key', message: 'Enter a campaign key using letters, numbers and dashes.' });
    expect(badKey.fields?.key).toBeTruthy();

    const noName = await apiError(createCampaign({ key: 'fine-key', name: '  ' }, key()));
    expect(noName).toMatchObject({ status: 400, code: 'name', message: 'Enter a campaign name.' });

    const both = await apiError(createCampaign({ key: '-bad-', name: '' }, key()));
    expect(both.code).toBe('key');
    expect(Object.keys(both.fields ?? {}).sort()).toEqual(['key', 'name']);

    const dupe = await apiError(createCampaign({ key: 'WELCOME', name: 'Again' }, key()));
    expect(dupe).toMatchObject({ status: 409, code: 'dupe', message: 'A campaign with that key already exists. Pick another.' });
  });

  it('pauses and resumes as a label only', async () => {
    const paused = await setCampaignActive('camp_dental01', false);
    expect(paused.active).toBe(false);
    expect(paused.opens).toBeGreaterThan(0);
    expect((await getEmailOverview()).campaigns.find((c) => c.id === 'camp_dental01')?.active).toBe(false);
    expect((await setCampaignActive('camp_dental01', true)).active).toBe(true);
    const bad = await apiError(api.patch('/email/campaigns/camp_dental01', { active: 'yes' }));
    expect(bad.code).toBe('active');
    expect((await apiError(setCampaignActive('camp_nope', true))).status).toBe(404);
  });

  it('deletes a campaign; adding the key again starts the counters from zero, past events stay', async () => {
    const before = (await getEmailOverview()).campaigns.find((c) => c.key === 'newsletter-2026-08');
    expect(before?.opens).toBeGreaterThan(0);
    const opensBefore = (await getEmailOverview()).stats.opens30d;
    expect(await deleteCampaign('camp_news2608')).toBeNull();
    expect((await getEmailOverview()).campaigns.some((c) => c.key === 'newsletter-2026-08')).toBe(false);
    expect((await getEmailOverview()).stats.opens30d).toBe(opensBefore);
    const again = await createCampaign({ key: 'newsletter-2026-08', name: 'August newsletter' }, key());
    expect(again).toMatchObject({ opens: 0, clicks: 0 });
    expect((await apiError(deleteCampaign('camp_news2608'))).status).toBe(404);
  });
});

describe('GET /email/subscribers', () => {
  it('pages newest signup first with an opaque cursor, ending on a short page', async () => {
    const pages = await allPages({});
    const rows = pages.flatMap((p) => p.items);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.slice(0, -1).every((p) => p.items.length === 30)).toBe(true);
    expect(pages[pages.length - 1].items.length).toBeLessThan(30);
    expect(pages[pages.length - 1].nextCursor).toBeNull();
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    const times = rows.map((r) => r.signedUpAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('has every status, reason and source, plus edge cases', async () => {
    const rows = await everyone();
    for (const status of ['active', 'unsubscribed', 'bounced', 'complained'] as const) expect(rows.some((r) => r.status === status)).toBe(true);
    for (const reason of ['too_many', 'not_relevant', 'never_signed_up', 'other'] as const) expect(rows.some((r) => r.reason === reason)).toBe(true);
    for (const source of ['unsubscribe_page', 'crm', 'crm_permanent', 'admin'] as const) expect(rows.some((r) => r.unsubscribeSource === source)).toBe(true);
    expect(rows.some((r) => !r.inCrm)).toBe(true);
    expect(rows.some((r) => r.country === null)).toBe(true);
    expect(rows.every((r) => (r.status === 'active') === (r.unsubscribedAt === null))).toBe(true);
  });

  it('filters by status and searches the email', async () => {
    const bounced = await getSubscribers({ status: 'bounced' });
    expect(bounced.items.length).toBeGreaterThan(0);
    expect(bounced.items.every((s) => s.status === 'bounced')).toBe(true);
    const found = await getSubscribers({ q: 'NOAH.SINGH' });
    expect(found.items.map((s) => s.id)).toEqual(['sub_noah0001']);
    const error = await apiError(api.get('/email/subscribers', { query: { status: 'gone' } }));
    expect(error).toMatchObject({ status: 400, code: 'status' });
  });
});

describe('GET /email/subscribers/:id', () => {
  it('returns the subscriber with consent history, newest first', async () => {
    const detail = await getSubscriber('sub_noah0001');
    expect(zSubscriberDetail.safeParse(detail).success).toBe(true);
    expect(detail.subscriber).toMatchObject({ status: 'unsubscribed', reason: 'too_many', unsubscribeSource: 'unsubscribe_page' });
    expect(detail.consentHistory.map((e) => e.event)).toEqual(['reason', 'unsubscribed', 'subscribed']);
    const at = detail.consentHistory.map((e) => e.at);
    expect([...at].sort().reverse()).toEqual(at);

    const back = await getSubscriber('sub_zoe00001');
    expect(back.consentHistory.map((e) => e.event)).toEqual(['resubscribed', 'unsubscribed', 'subscribed']);
    expect((await apiError(getSubscriber('sub_nope'))).status).toBe(404);
  });
});

describe('unsubscribe', () => {
  it('unsubscribes an active subscriber, records consent, queues the CRM DND, and is visible later', async () => {
    const before = (await getEmailOverview()).stats.activeSubscribers;
    const outbox = crmState.outbox.length;
    const result = await unsubscribeSubscriber('sub_olivia001');
    expect(zSubscriberDetail.safeParse(result).success).toBe(true);
    expect(result.subscriber).toMatchObject({ status: 'unsubscribed', unsubscribeSource: 'admin', reason: null });
    expect(result.subscriber.unsubscribedAt).not.toBeNull();
    expect(result.consentHistory[0]).toMatchObject({ event: 'unsubscribed', source: 'admin' });
    expect(crmState.outbox.length).toBe(outbox + 1);
    expect(crmState.outbox[crmState.outbox.length - 1]).toMatchObject({ email: 'olivia.martin@mailbox.test', action: 'dnd' });

    expect((await getSubscriber('sub_olivia001')).subscriber.status).toBe('unsubscribed');
    expect((await getEmailOverview()).stats.activeSubscribers).toBe(before - 1);

    const again = await apiError(unsubscribeSubscriber('sub_olivia001'));
    expect(again).toMatchObject({ status: 409, code: 'not_active' });
    expect((await apiError(unsubscribeSubscriber('sub_nope'))).status).toBe(404);
  });
});

describe('DELETE /email/subscribers/:id', () => {
  it('fails with crm_erase for the seeded subscriber and deletes nothing', async () => {
    const error = await apiError(deleteSubscriber(ERASE_FAILS_SUBSCRIBER_ID));
    expect(error.code).toBe('crm_erase');
    expect(error.message).toBe(
      'Not deleted: the CRM erasure could not be queued, so their CRM contact would have stayed mailable. Try again.',
    );
    expect((await getSubscriber(ERASE_FAILS_SUBSCRIBER_ID)).subscriber.id).toBe(ERASE_FAILS_SUBSCRIBER_ID);
  });

  it('erases for good: gone from reads, marked erased, CRM suppression queued', async () => {
    const victim = (await getSubscribers({ q: 'ava.nguyen' })).items[0];
    expect(await deleteSubscriber(victim.id)).toBeNull();
    expect((await apiError(getSubscriber(victim.id))).status).toBe(404);
    expect((await getSubscribers({ q: 'ava.nguyen' })).items).toEqual([]);
    expect(erasedEmails.has(victim.email)).toBe(true);
    const queued = crmState.outbox.filter((o) => o.email === victim.email);
    expect(queued.map((o) => o.action)).toEqual(['erase']);
    expect((await apiError(deleteSubscriber(victim.id))).status).toBe(404);
  });
});
