import { api, setAuthBridge } from '@/api/client';
import {
  createLink,
  deleteLink,
  getLinkClicks,
  getLinks,
  linkClicksInfiniteQuery,
  setLinkActive,
  type LinkClicksParams,
} from '@/api/endpoints/links';
import { ApiError } from '@/api/errors';
import { metaFixture } from '@/api/mock/fixtures/links';
import { metaFragment, zLinkClickPage, zShortLink, zShortLinks, type LinkClickPage } from '@/api/schemas/links';

/**
 * The links domain through the real mock transport: schemas, share URLs and
 * click counts, the documented validation errors (slug, reserved, destination,
 * dupe), enable and disable, delete (history kept, slug reusable) and click paging.
 */

let token = '';
const asOwner = () => {
  token = `mock.usr_owner01.${Date.now() + 3_600_000}`;
};
const asManager = () => {
  token = `mock.usr_mgr01.${Date.now() + 3_600_000}`;
};

let keySeq = 0;
const key = () => `test-links-${(keySeq += 1)}`;

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

async function allPages(params: LinkClicksParams) {
  const options = linkClicksInfiniteQuery(params);
  const pages: LinkClickPage[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const page = await getLinkClicks({ ...params, cursor });
    expect(zLinkClickPage.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return pages;
}

describe('meta fragment', () => {
  it('matches its schema, reserves the real pages and suggests the UTM values', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
    for (const slug of ['admin', 'api', 'blog', 'start', 'pricing', 'webline', 'growth-system', 'about', 'contact', 'privacy', 'terms', 'login', 'account', 'book', 'tools']) {
      expect(metaFixture.linkReservedSlugs).toContain(slug);
    }
    expect(metaFixture.utmSuggestions.sources).toEqual(['instagram', 'facebook', 'linkedin', 'business_card', 'google', 'youtube', 'email']);
    expect(metaFixture.utmSuggestions.mediums).toEqual(['social', 'qr', 'email', 'cpc', 'organic', 'offline']);
  });
});

describe('owner only', () => {
  it('answers 403 to a manager on every links endpoint', async () => {
    asManager();
    const calls: Promise<unknown>[] = [getLinks(), createLink({ slug: 'nope' }, key()), setLinkActive('lnk_insta0001', false), deleteLink('lnk_insta0001'), getLinkClicks({})];
    for (const call of calls) expect((await apiError(call)).status).toBe(403);
  });
});

describe('GET /links', () => {
  it('lists links newest first with share URLs and click counts that match the log', async () => {
    const list = await getLinks();
    expect(zShortLinks.safeParse(list).success).toBe(true);
    const created = list.map((l) => l.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
    for (const link of list) expect(link.shareUrl).toBe(`https://www.tekmadev.com/${link.slug}`);
    const card = list.find((l) => l.slug === 'card');
    const history = (await allPages({ linkId: card?.id })).flatMap((p) => p.items);
    expect(card?.clicks).toBe(history.length);
    expect(list.find((l) => l.slug === 'email-sig')?.clicks).toBe(0);
    expect(list.some((l) => !l.active)).toBe(true);
    expect(list.some((l) => l.destination.startsWith('https://'))).toBe(true);
  });
});

describe('POST /links', () => {
  it('creates a link: slug lowercased, destination defaults to the home page, blanks become null', async () => {
    const created = await createLink({ slug: 'Fall-Promo', utmSource: 'instagram', utmMedium: ' ', label: '' }, key());
    expect(zShortLink.safeParse(created).success).toBe(true);
    expect(created).toMatchObject({
      slug: 'fall-promo',
      destination: '/',
      shareUrl: 'https://www.tekmadev.com/fall-promo',
      utmSource: 'instagram',
      utmMedium: null,
      utmCampaign: null,
      label: null,
      active: true,
      clicks: 0,
    });
    expect((await getLinks())[0].id).toBe(created.id);

    const external = await createLink({ slug: 'reviews', destination: 'https://g.page/r/acme-review' }, key());
    expect(external.destination).toBe('https://g.page/r/acme-review');
    const path = await createLink({ slug: 'hvac-guide', destination: '/blog/ai-follow-up-for-hvac-companies?ref=qr' }, key());
    expect(path.destination).toBe('/blog/ai-follow-up-for-hvac-companies?ref=qr');
  });

  it('honours the idempotency key', async () => {
    const k = key();
    const a = await createLink({ slug: 'once-only' }, k);
    const b = await createLink({ slug: 'once-only' }, k);
    expect(b.id).toBe(a.id);
  });

  it('returns the documented validation errors', async () => {
    const slug = await apiError(createLink({ slug: 'no spaces!' }, key()));
    expect(slug).toMatchObject({ status: 400, code: 'slug', message: 'Enter a slug using letters, numbers and dashes.' });
    expect(slug.fields?.slug).toBeTruthy();

    const reserved = await apiError(createLink({ slug: 'Pricing' }, key()));
    expect(reserved).toMatchObject({ status: 400, code: 'reserved', message: 'That slug is reserved by an existing page. Pick another.' });
    expect(reserved.fields?.slug).toBe('That slug is reserved by an existing page. Pick another.');

    for (const destination of ['example.com', 'http://example.com', '//evil.test/x', 'start', 'https://localhost']) {
      const error = await apiError(createLink({ slug: 'dest-test', destination }, key()));
      expect(error).toMatchObject({ status: 400, code: 'destination', message: 'Enter a valid destination: a path like /start or a full https:// URL.' });
      expect(error.fields?.destination).toBeTruthy();
    }

    const both = await apiError(createLink({ slug: '', destination: 'example.com' }, key()));
    expect(both.code).toBe('slug');
    expect(Object.keys(both.fields ?? {}).sort()).toEqual(['destination', 'slug']);

    const dupe = await apiError(createLink({ slug: 'INSTA' }, key()));
    expect(dupe).toMatchObject({ status: 409, code: 'dupe', message: 'A link with that slug already exists. Pick a different slug.' });
  });
});

describe('PATCH /links/:id', () => {
  it('disables and enables, and nothing else', async () => {
    const off = await setLinkActive('lnk_linkedin1', false);
    expect(off.active).toBe(false);
    expect((await getLinks()).find((l) => l.id === 'lnk_linkedin1')?.active).toBe(false);
    const on = await setLinkActive('lnk_linkedin1', true);
    expect(on.active).toBe(true);
    // Links cannot be edited: other fields are ignored.
    const unchanged = await api.patch<unknown>('/links/lnk_linkedin1', { active: true, slug: 'renamed', destination: '/pricing' });
    expect(zShortLink.parse(unchanged)).toMatchObject({ slug: 'li', destination: '/growth-system' });
    expect((await apiError(api.patch('/links/lnk_linkedin1', {}))).code).toBe('active');
    expect((await apiError(setLinkActive('lnk_nope', true))).status).toBe(404);
  });
});

describe('DELETE /links/:id', () => {
  it('keeps the click history, drops the counter and frees the slug', async () => {
    const insta = (await getLinks()).find((l) => l.slug === 'insta');
    expect(insta?.clicks).toBeGreaterThan(0);
    expect(await deleteLink('lnk_insta0001')).toBeNull();
    expect((await getLinks()).some((l) => l.id === 'lnk_insta0001')).toBe(false);
    const history = (await allPages({ linkId: 'lnk_insta0001' })).flatMap((p) => p.items);
    expect(history.length).toBe(insta?.clicks);
    const reused = await createLink({ slug: 'insta', destination: '/start' }, key());
    expect(reused.id).not.toBe('lnk_insta0001');
    expect(reused.clicks).toBe(0);
    expect((await apiError(deleteLink('lnk_insta0001'))).status).toBe(404);
  });
});

describe('GET /links/clicks', () => {
  it('pages every click newest first with an opaque cursor, ending on a short page', async () => {
    const pages = await allPages({});
    const rows = pages.flatMap((p) => p.items);
    expect(pages.length).toBeGreaterThan(3);
    expect(pages.slice(0, -1).every((p) => p.items.length === 30)).toBe(true);
    expect(pages[pages.length - 1].items.length).toBeLessThan(30);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    const at = rows.map((r) => r.at);
    expect([...at].sort().reverse()).toEqual(at);
    // A deleted link's clicks stay on record.
    expect(rows.some((r) => r.slug === 'spring-promo')).toBe(true);
  });

  it('filters by link, and answers 404 for a link that never existed', async () => {
    const rows = (await allPages({ linkId: 'lnk_card00001', limit: 10 })).flatMap((p) => p.items);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.linkId === 'lnk_card00001' && r.slug === 'card')).toBe(true);
    expect(rows.every((r) => r.referrer === null)).toBe(true);
    expect((await getLinkClicks({ linkId: 'lnk_oldpromo1' })).items.length).toBeGreaterThan(0);
    expect((await getLinkClicks({ linkId: 'lnk_emailsig1' })).items).toEqual([]);
    expect((await apiError(getLinkClicks({ linkId: 'lnk_nope' }))).status).toBe(404);
  });
});
