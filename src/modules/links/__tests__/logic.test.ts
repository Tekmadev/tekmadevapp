import type { LinkClickPage, ShortLink } from '@/api/schemas/links';
import {
  clicksText,
  clickWhere,
  destinationError,
  EMPTY_FORM,
  finalDestinationUrl,
  flattenClicks,
  LINK_COPY,
  linkFinalUrl,
  linkMenuActions,
  referrerLabel,
  removeLink,
  shareUrlOf,
  shortLinkText,
  slugError,
  statusBadge,
  toLinkCreate,
  upsertLink,
  utmChips,
  utmSuggestions,
  validateNewLink,
} from '@/modules/links/logic';

const RESERVED = ['start', 'blog', 'pricing'];

const link = (over: Partial<ShortLink> = {}): ShortLink => ({
  id: 'lnk_1',
  slug: 'insta',
  destination: '/start',
  shareUrl: 'https://www.tekmadev.com/insta',
  utmSource: 'instagram',
  utmMedium: 'social',
  utmCampaign: 'bio',
  label: 'Instagram bio',
  active: true,
  clicks: 64,
  createdAt: '2026-06-01T12:00:00.000Z',
  ...over,
});

describe('slugError', () => {
  it('is quiet for a blank slug and a good one', () => {
    expect(slugError('', RESERVED, [])).toBeNull();
    expect(slugError('spring-promo', RESERVED, [])).toBeNull();
    // A trailing dash while typing is dropped before checking.
    expect(slugError('spring-', RESERVED, [])).toBeNull();
  });

  it('rejects reserved slugs with the brief copy', () => {
    expect(slugError('start', RESERVED, [])).toBe('That slug is reserved by an existing page. Pick another.');
    expect(slugError('Blog', RESERVED, [])).toBe(LINK_COPY.reserved);
  });

  it('rejects a slug that already exists', () => {
    expect(slugError('insta', RESERVED, ['insta'])).toBe(LINK_COPY.dupe);
  });

  it('rejects slugs over 60 characters', () => {
    expect(slugError('a'.repeat(61), RESERVED, [])).toBe(LINK_COPY.slug);
    expect(slugError('a'.repeat(60), RESERVED, [])).toBeNull();
  });
});

describe('destinationError', () => {
  it('accepts blank (home page), site paths and https URLs', () => {
    for (const ok of ['', '  ', '/start', '/blog/x?y=1', 'https://www.youtube.com/@tekmadev', 'https://example.com']) {
      expect(destinationError(ok, true)).toBeNull();
    }
  });

  it('asks for https:// on a bare domain, even while typing', () => {
    expect(destinationError('example.com', false)).toBe('Add https:// for another website.');
    expect(destinationError('www.example.com/page', true)).toBe(LINK_COPY.bareDomain);
  });

  it('waits for the field to be complete before the generic error', () => {
    expect(destinationError('https://exa', false)).toBeNull();
    expect(destinationError('https://exa', true)).toBe('Enter a valid destination: a path like /start or a full https:// URL.');
    expect(destinationError('start', true)).toBe(LINK_COPY.destination);
    expect(destinationError('http://example.com', true)).toBe(LINK_COPY.destination);
    expect(destinationError('//evil.test', true)).toBe(LINK_COPY.destination);
  });
});

describe('validateNewLink', () => {
  it('needs a slug', () => {
    expect(validateNewLink(EMPTY_FORM, RESERVED, [])).toEqual({ slug: LINK_COPY.slug });
  });

  it('reports slug and destination together', () => {
    expect(validateNewLink({ ...EMPTY_FORM, slug: 'pricing', destination: 'example.com' }, RESERVED, [])).toEqual({
      slug: LINK_COPY.reserved,
      destination: LINK_COPY.bareDomain,
    });
  });

  it('passes a valid form', () => {
    expect(validateNewLink({ ...EMPTY_FORM, slug: 'card', destination: '/start' }, RESERVED, ['insta'])).toEqual({});
  });
});

describe('toLinkCreate', () => {
  it('finalizes the slug and leaves blank fields out', () => {
    expect(toLinkCreate({ ...EMPTY_FORM, slug: 'home-show-' })).toEqual({ slug: 'home-show' });
  });

  it('trims every value', () => {
    expect(
      toLinkCreate({ slug: 'card', destination: ' /start ', utmSource: ' business_card ', utmMedium: 'qr', utmCampaign: ' cards ', label: ' Card QR ' }),
    ).toEqual({ slug: 'card', destination: '/start', utmSource: 'business_card', utmMedium: 'qr', utmCampaign: 'cards', label: 'Card QR' });
  });
});

describe('finalDestinationUrl', () => {
  it('turns a path into a site URL and a blank into the home page', () => {
    expect(finalDestinationUrl('/start', {})).toBe('https://www.tekmadev.com/start');
    expect(finalDestinationUrl('', {})).toBe('https://www.tekmadev.com/');
  });

  it('appends UTMs in order, encoded, skipping blanks', () => {
    expect(finalDestinationUrl('/start', { source: 'instagram', medium: ' ', campaign: 'fall sale' })).toBe(
      'https://www.tekmadev.com/start?utm_source=instagram&utm_campaign=fall%20sale',
    );
  });

  it('joins an existing query and keeps the fragment last', () => {
    expect(finalDestinationUrl('https://example.com/p?x=1#top', { source: 'email' })).toBe('https://example.com/p?x=1&utm_source=email#top');
    expect(finalDestinationUrl('/a?', { medium: 'qr' })).toBe('https://www.tekmadev.com/a?utm_medium=qr');
  });

  it('works from a saved link', () => {
    expect(linkFinalUrl(link())).toBe('https://www.tekmadev.com/start?utm_source=instagram&utm_medium=social&utm_campaign=bio');
  });
});

describe('labels', () => {
  it('uses meta labels and falls back to the brief', () => {
    expect(statusBadge(undefined, true)).toEqual({ label: 'Active', tone: 'gold' });
    expect(statusBadge(undefined, false)).toEqual({ label: 'Disabled', tone: 'muted' });
    const meta = {
      linkReservedSlugs: [],
      utmSuggestions: { sources: [], mediums: ['qr'] },
      linkStatuses: [{ value: 'active' as const, label: 'Live', tone: 'ok' as const }],
    };
    expect(statusBadge(meta, true)).toEqual({ label: 'Live', tone: 'ok' });
    expect(utmSuggestions(meta).mediums).toEqual(['qr']);
    expect(utmSuggestions(meta).sources).toContain('business_card');
  });

  it('formats links and clicks', () => {
    expect(shortLinkText('insta')).toBe('tekmadev.com/insta');
    expect(shareUrlOf({ slug: 'card', shareUrl: '' })).toBe('https://www.tekmadev.com/card');
    expect(utmChips(link({ utmMedium: null })).map((c) => c.key)).toEqual(['source', 'campaign']);
    expect(clickWhere({ device: 'mobile', country: null })).toBe('Mobile · Unknown country');
    expect(referrerLabel(null)).toBe('Direct or QR scan');
    expect(clicksText(1)).toBe('1 click');
    expect(clicksText(1204)).toBe('1,204 clicks');
  });
});

describe('cache helpers', () => {
  it('upserts newest first and removes by id', () => {
    const a = link({ id: 'a', slug: 'a' });
    const b = link({ id: 'b', slug: 'b' });
    expect(upsertLink([a], b)?.map((l) => l.id)).toEqual(['b', 'a']);
    expect(upsertLink([a, b], { ...a, active: false })?.[0]?.active).toBe(false);
    expect(upsertLink(undefined, a)).toBeUndefined();
    expect(removeLink([a, b], 'a')?.map((l) => l.id)).toEqual(['b']);
  });

  it('flattens click pages without duplicates', () => {
    const click = (id: string) => ({ id, at: '2026-06-01T12:00:00.000Z', linkId: 'a', slug: 'a', device: null, country: null, referrer: null });
    const pages: LinkClickPage[] = [
      { items: [click('1'), click('2')], nextCursor: 'x' },
      { items: [click('2'), click('3')], nextCursor: null },
    ];
    expect(flattenClicks(pages).map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(flattenClicks(undefined)).toEqual([]);
  });
});

describe('linkMenuActions', () => {
  it('gives writers Disable or Enable and Delete after the sharing actions', () => {
    expect(linkMenuActions(link({ active: true }), true)).toEqual(['copy', 'share', 'qr', 'disable', 'delete']);
    expect(linkMenuActions(link({ active: false }), true)).toEqual(['copy', 'share', 'qr', 'enable', 'delete']);
  });

  it('keeps Copy, Share and QR code for staff, nothing that writes', () => {
    expect(linkMenuActions(link({ active: true }), false)).toEqual(['copy', 'share', 'qr']);
    expect(linkMenuActions(link({ active: false }), false)).toEqual(['copy', 'share', 'qr']);
  });
});
