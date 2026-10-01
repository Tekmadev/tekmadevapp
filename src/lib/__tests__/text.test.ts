import { codeLive, finalizeSlug, isBareDomain, isValidDestination, isValidEmail, slugifyLive } from '@/lib/text';

describe('slugifyLive', () => {
  it.each([
    ['Spring Promo', 'spring-promo'],
    ['spring_promo', 'spring-promo'],
    ['Already-a-slug', 'already-a-slug'],
    ['Q&A: 2026!', 'qa-2026'],
    ['  lots   of   space  ', 'lots-of-space-'],
    ['a--b---c', 'a-b-c'],
    ['a - b', 'a-b'],
    ['-leading', 'leading'],
    ['---', ''],
    ['Café Déjà Vu', 'cafe-deja-vu'],
    ['UPPER', 'upper'],
    ['tekmadev.com/start', 'tekmadevcomstart'],
    ['', ''],
  ])('%j becomes %j', (input, slug) => {
    expect(slugifyLive(input)).toBe(slug);
  });

  it('keeps a trailing dash while typing', () => {
    expect(slugifyLive('my ')).toBe('my-');
    expect(slugifyLive('my-')).toBe('my-');
    expect(slugifyLive('my-p')).toBe('my-p');
  });

  it('is stable when applied again', () => {
    for (const input of ['Spring Promo', 'Q&A: 2026!', 'a--b', 'Café ']) {
      expect(slugifyLive(slugifyLive(input))).toBe(slugifyLive(input));
    }
  });
});

describe('finalizeSlug', () => {
  it('drops trailing dashes', () => {
    expect(finalizeSlug('my-')).toBe('my');
    expect(finalizeSlug('  Spring Promo  ')).toBe('spring-promo');
    expect(finalizeSlug('a---')).toBe('a');
    expect(finalizeSlug('---')).toBe('');
  });

  it('only ever contains a-z, 0-9 and single inner dashes', () => {
    for (const input of ['Hello, World!', '__init__', 'Ünïcödé text', '   ', '2026 - Plan B']) {
      expect(finalizeSlug(input)).toMatch(/^([a-z0-9]+(-[a-z0-9]+)*)?$/);
    }
  });
});

describe('codeLive', () => {
  it.each([
    ['startup50', 'STARTUP50'],
    ['startup-50', 'STARTUP-50'],
    ['startup 50', 'STARTUP50'],
    ['spring_sale!', 'SPRINGSALE'],
    ['été', 'ETE'],
    ['', ''],
  ])('%j becomes %j', (input, code) => {
    expect(codeLive(input)).toBe(code);
  });
});

describe('isValidEmail', () => {
  it.each(['maya@tekmadev.com', 'first.last+tag@sub.example.co.uk', 'a@b.co', ' maya@tekmadev.com '])('accepts %j', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'maya', 'maya@', '@tekmadev.com', 'maya@tekmadev', 'maya@tekmadev.c', 'maya @tekmadev.com', 'maya@@tekmadev.com', 'maya@.com', 'maya@tekmadev..com', 'maya@tekmadev.com.'])(
    'rejects %j',
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});

describe('isBareDomain', () => {
  it.each(['example.com', 'www.example.com', 'example.com/page', 'shop.example.co.uk/a?b=c', 'example.com:8080', 'EXAMPLE.COM'])(
    '%j is a bare domain',
    (input) => {
      expect(isBareDomain(input)).toBe(true);
    },
  );

  it.each(['https://example.com', 'http://example.com', '/start', '/blog/post.html', 'start', '', '   ', 'not a domain.com', 'example.c0m'])(
    '%j is not',
    (input) => {
      expect(isBareDomain(input)).toBe(false);
    },
  );
});

describe('isValidDestination', () => {
  it.each([
    '/start',
    '/',
    '/blog/how-we-grow?utm_source=qr#top',
    'https://example.com',
    'https://www.example.com/path?x=1',
    'HTTPS://Example.com/Page',
    'https://example.com:8443/a',
    '  /start  ',
  ])('accepts %j', (input) => {
    expect(isValidDestination(input)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'example.com',
    'www.example.com',
    'http://example.com',
    'ftp://example.com',
    'https://',
    'https://localhost',
    'https://exa mple.com',
    '/has space',
    'start',
    'javascript:alert(1)',
    // Protocol-relative and backslash paths open another website: open redirect.
    '//evil.example',
    '/\\evil.example',
  ])('rejects %j', (input) => {
    expect(isValidDestination(input)).toBe(false);
  });

  it('agrees with isBareDomain: a bare domain is never a valid destination', () => {
    for (const input of ['example.com', 'www.example.com/page']) {
      expect(isBareDomain(input)).toBe(true);
      expect(isValidDestination(input)).toBe(false);
    }
  });
});
