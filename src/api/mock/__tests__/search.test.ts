import { setAuthBridge } from '@/api/client';
import { createPost, getPost, trashPost } from '@/api/endpoints/blog';
import { createClient, deleteClient, getClient } from '@/api/endpoints/clients';
import { createCoupon, getCoupons } from '@/api/endpoints/coupons';
import { deleteSubscriber, getSubscriber } from '@/api/endpoints/email';
import { getLead } from '@/api/endpoints/leads';
import { deleteLink, getLinks } from '@/api/endpoints/links';
import { searchQuery } from '@/api/endpoints/overview';
import { search } from '@/api/endpoints/session';
import { foldSearchText, SEARCH_MAX } from '@/api/mock/fixtures/overview';
import { zSearchResults, type SearchResult, type SearchResultType } from '@/api/schemas/session';
import { mapAdminUrl } from '@/lib/deeplinks';

/**
 * GET /search through the real mock transport: capability filtering, ranking, the
 * 20 result cap, links that open the right screen, and records created or
 * removed elsewhere showing up (or not) on the next search.
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

let keySeq = 0;
const key = () => `search-test-${(keySeq += 1)}`;

/** GET /search, checked against its schema every time. */
async function find(q: string): Promise<SearchResult[]> {
  const data = await search(q);
  expect(zSearchResults.safeParse(data).success).toBe(true);
  return data.results;
}

/** Queries that hit every kind of record for the owner. */
const BROAD = ['a', 'e', 'o', 'ai', 'acme', 'insta', 'mailbox', 'hvac', 'grow', 'care', 'olivia', 'test', 'hamilton', 'booked'];

describe('GET /search: basics', () => {
  it('an empty query answers nothing', async () => {
    expect(await find('')).toEqual([]);
    expect(await find('   ')).toEqual([]);
    expect(await find('@#!')).toEqual([]);
  });

  it('a query that matches nothing is an empty list, not an error', async () => {
    expect(await find('zzqx nothing here')).toEqual([]);
  });

  it('never answers more than 20 results', async () => {
    expect(SEARCH_MAX).toBe(20);
    for (const q of ['a', 'e', 'mailbox']) {
      const results = await find(q);
      expect(results).toHaveLength(20);
    }
  });

  it('owners can find every kind of record', async () => {
    const seen = new Set<SearchResultType>();
    for (const q of BROAD) for (const r of await find(q)) seen.add(r.type);
    expect([...seen].sort()).toEqual(['client', 'coupon', 'lead', 'link', 'post', 'subscriber']);
  });

  it('every url is a web admin path that opens the record, never the Inbox fallback', async () => {
    const expected: Record<SearchResultType, (id: string) => object> = {
      client: (id) => ({ pathname: '/clients/[id]', params: { id } }),
      lead: (id) => ({ pathname: '/leads/[id]', params: { id } }),
      subscriber: (id) => ({ pathname: '/email/subscriber/[id]', params: { id } }),
      post: (id) => ({ pathname: '/blog/[id]', params: { id } }),
      coupon: () => ({ pathname: '/coupons' }),
      link: (id) => ({ pathname: '/links/[id]', params: { id } }),
    };
    for (const q of BROAD) {
      for (const r of await find(q)) {
        expect(r.url.startsWith('/admin/')).toBe(true);
        expect(mapAdminUrl(r.url, 'owner')).toEqual(expected[r.type](r.id));
      }
    }
  });

  it('every result id resolves through its own endpoint', async () => {
    const links = await getLinks();
    const coupons = await getCoupons();
    const results = new Map<string, SearchResult>();
    for (const q of ['acme', 'olivia', 'insta', 'hvac', 'care', 'fallgrow']) for (const r of await find(q)) results.set(`${r.type}:${r.id}`, r);
    expect(results.size).toBeGreaterThan(10);
    for (const r of results.values()) {
      if (r.type === 'client') expect((await getClient(r.id)).client.businessName).toBe(r.title);
      if (r.type === 'lead') expect((await getLead(r.id)).id).toBe(r.id);
      if (r.type === 'subscriber') expect((await getSubscriber(r.id)).subscriber.email).toBe(r.title);
      if (r.type === 'post') expect((await getPost(r.id)).post.title).toBe(r.title);
      if (r.type === 'coupon') expect(coupons.find((c) => c.id === r.id)?.code).toBe(r.title);
      if (r.type === 'link') expect(`tekmadev.com/${links.find((l) => l.id === r.id)?.slug}`).toBe(r.title);
    }
  });
});

describe('GET /search: filtered by capability', () => {
  it('managers find every kind of record, test clients included, like owners', async () => {
    for (const q of ['acme', 'insta', 'sandbox bakery', 'olivia']) {
      const owner = await find(q);
      asManager();
      expect(await find(q)).toEqual(owner);
      asOwner();
    }
  });

  it('staff never get subscribers (email.subscribers.view), but find posts, coupons and links', async () => {
    asStaff();
    const seen = new Set<SearchResultType>();
    for (const q of [...BROAD, 'FALLGROW', 'tekmadev.com/insta', 'olivia.martin@mailbox.test']) {
      for (const r of await find(q)) seen.add(r.type);
    }
    expect([...seen].sort()).toEqual(['client', 'coupon', 'lead', 'link', 'post']);
    expect((await find('olivia.martin@mailbox.test')).filter((r) => r.type === 'subscriber')).toEqual([]);
  });

  it('staff never see test clients (testdata.view); owners see them marked "Test"', async () => {
    asStaff();
    expect((await find('sandbox bakery')).map((r) => r.id)).not.toContain('cl_testco_0001');
    asOwner();
    const [first] = await find('sandbox bakery');
    expect(first).toMatchObject({ type: 'client', id: 'cl_testco_0001', url: '/admin/clients/cl_testco_0001' });
    expect(first.subtitle.startsWith('Test')).toBe(true);
  });

  it("staff get their own best matches: the owner's, minus what they may not see, first and in the same order", async () => {
    for (const q of ['acme', 'a', 'care']) {
      const owner = (await find(q)).filter((r) => r.type !== 'subscriber' && r.id !== 'cl_testco_0001');
      asStaff();
      const staff = await find(q);
      expect(staff.slice(0, owner.length)).toEqual(owner);
      expect(staff.some((r) => r.type === 'subscriber' || r.id === 'cl_testco_0001')).toBe(false);
      asOwner();
    }
  });

  it('applies the capabilities before the top 20 are cut, so staff still get a full page', async () => {
    const owner = await find('a');
    expect(owner).toHaveLength(20);
    expect(owner.some((r) => r.type === 'subscriber')).toBe(true);
    asStaff();
    expect(await find('a')).toHaveLength(20);
    asOwner();
  });
});

describe('GET /search: best matches first', () => {
  it('a business name beats an email that merely contains it', async () => {
    const results = await find('acme');
    expect(results[0]).toMatchObject({ type: 'client', id: 'cl_acmeplumb01', title: 'Acme Plumbing' });
    expect(results[0].subtitle).toContain('dan@acmeplumbing.test');
  });

  it('an exact email finds every record with that email first', async () => {
    const results = await find('dan@acmeplumbing.test');
    expect(results.map((r) => r.type).slice(0, 3)).toEqual(['client', 'lead', 'subscriber']);
  });

  it('an exact coupon code or link slug comes first', async () => {
    expect((await find('FALLGROW'))[0]).toMatchObject({ type: 'coupon', title: 'FALLGROW', url: '/admin/coupons' });
    expect((await find('fallgrow'))[0].title).toBe('FALLGROW');
    expect((await find('insta'))[0]).toMatchObject({ type: 'link', title: 'tekmadev.com/insta' });
  });

  it('is case and accent insensitive, and ignores punctuation', async () => {
    const plain = await find('benjamin cote');
    expect(plain.length).toBeGreaterThan(0);
    expect(await find('BENJAMIN CÔTÉ')).toEqual(plain);
    expect(foldSearchText("Let's Talk")).toBe('lets talk');
    expect((await find('home show')).some((r) => r.type === 'link' && r.title === 'tekmadev.com/hamilton-home-show')).toBe(true);
  });

  it('words can come in any order', async () => {
    const results = await find('plumbing acme');
    expect(results[0]).toMatchObject({ type: 'client', id: 'cl_acmeplumb01' });
  });

  it('a short query only matches the start of a word; three letters or more match inside one', async () => {
    const short = await find('ai');
    expect(short.some((r) => r.title === 'Aisha Khan')).toBe(true);
    expect(short.some((r) => r.id === 'cl_orleansauto')).toBe(false);
    expect((await find('tailing')).some((r) => r.id === 'cl_orleansauto')).toBe(true);
  });

  it('finds people and clients by phone number in any format', async () => {
    const results = await find('(905) 555-0142');
    expect(results.map((r) => r.id)).toContain('cl_acmeplumb01');
    expect(await find('905.555.0142')).toEqual(results);
  });
});

describe('GET /search: changes elsewhere show up on the next search', () => {
  it('a new client is found, and a deleted one is not', async () => {
    const { client } = await createClient({ businessName: 'Quillfeather Chimney Sweeps', email: 'ada@quillfeather.test', sendInvite: false }, key());
    const found = await find('quillfeather');
    expect(found[0]).toMatchObject({ type: 'client', id: client.id, title: 'Quillfeather Chimney Sweeps', url: `/admin/clients/${client.id}` });

    asManager();
    expect((await find('quillfeather'))[0]?.id).toBe(client.id);
    asOwner();
    await deleteClient(client.id);
    expect(await find('quillfeather')).toEqual([]);
  });

  it('a new post is found, and a trashed one is not', async () => {
    const created = await createPost({ title: 'Zebra mussels and your sump pump' }, key());
    expect((await find('zebra mussels'))[0]).toMatchObject({ type: 'post', id: created.post.id });
    await trashPost(created.post.id);
    expect(await find('zebra mussels')).toEqual([]);
    // Posts already in the trash never show.
    expect((await find('old checklist google ads')).some((r) => r.type === 'post')).toBe(false);
  });

  it('a new coupon is found by its code', async () => {
    const coupon = await createCoupon({ code: 'QUILL-15', type: 'percent', percent: 15, appliesTo: 'growth_monthly', duration: 'first_month' }, key());
    const [first] = await find('quill-15');
    expect(first).toMatchObject({ type: 'coupon', id: coupon.id, title: 'QUILL-15' });
    expect(first.subtitle).toContain('15% off');
  });

  it('a deleted link or erased subscriber is gone', async () => {
    await deleteLink('lnk_youtube01');
    expect((await find('youtube')).some((r) => r.id === 'lnk_youtube01')).toBe(false);

    const [subscriber] = (await find('olivia.martin@mailbox.test')).filter((r) => r.type === 'subscriber');
    expect(subscriber).toBeDefined();
    await deleteSubscriber(subscriber.id);
    expect((await find('olivia.martin@mailbox.test')).some((r) => r.type === 'subscriber')).toBe(false);
  });
});

describe('searchQuery()', () => {
  it('trims the query, never fetches an empty one, and is not persisted', () => {
    const options = searchQuery('  acme ');
    expect(options.queryKey).toEqual(['search', 'acme']);
    expect(options.enabled).toBe(true);
    expect(options.meta).toEqual({ persist: false });
    expect(searchQuery('   ').enabled).toBe(false);
  });
});
