import { foldText, matchScreens, relatedQueries, screenScore } from '../screenMatch';

const SCREENS = [
  { title: 'Overview', keywords: ['home', 'dashboard', 'kpi'] },
  { title: 'Inbox', keywords: ['notifications', 'alerts'] },
  { title: 'Clients', keywords: ['customers', 'accounts', 'onboarding'] },
  { title: 'New client', keywords: ['add client', 'create client'] },
  { title: 'Subscriptions', keywords: ['orders', 'billing', 'stripe', 'payments'] },
  { title: 'Pricing', keywords: ['plans', 'prices', 'tax', 'stripe'] },
  { title: 'Coupons', keywords: ['discounts', 'codes', 'deals'] },
  { title: 'Loader', keywords: ['black hole', 'spinner', 'animation'] },
  { title: 'App settings', keywords: ['theme', 'dark mode', 'appearance'] },
  { title: 'Notification settings', keywords: ['push', 'quiet', 'App settings'] },
];

const titles = (query: string, limit?: number) => matchScreens(SCREENS, query, limit).map((s) => s.title);

describe('foldText', () => {
  it('lowercases, drops accents and punctuation, and collapses spaces', () => {
    expect(foldText('  Café   Déjà-vu! ')).toBe('cafe deja vu');
    expect(foldText("Shajeed's")).toBe('shajeeds');
    expect(foldText('')).toBe('');
  });
});

describe('matchScreens', () => {
  it('finds the brief examples by title', () => {
    expect(titles('Pricing')[0]).toBe('Pricing');
    expect(titles('loader')[0]).toBe('Loader');
    expect(titles('LOAD')[0]).toBe('Loader');
  });

  it('ranks title matches above keyword matches', () => {
    // "client" starts two titles; "create client" is only a keyword.
    expect(titles('client')).toEqual(['Clients', 'New client']);
    expect(titles('settings')).toEqual(['App settings', 'Notification settings']);
  });

  it('matches keywords', () => {
    expect(titles('stripe')).toEqual(['Subscriptions', 'Pricing']);
    expect(titles('dark mode')).toEqual(['App settings']);
    expect(titles('black hole')).toEqual(['Loader']);
  });

  it('matches every word in any order', () => {
    expect(titles('settings notification')).toEqual(['Notification settings']);
  });

  it('forgives missing letters in order', () => {
    expect(titles('prcng')).toEqual(['Pricing']);
    expect(titles('cpns')).toEqual(['Coupons']);
  });

  it('does not match letters out of order or tiny fragments', () => {
    expect(titles('gnicirp')).toEqual([]);
    expect(titles('zz')).toEqual([]);
    expect(screenScore({ title: 'Pricing' }, 'ic')).toBe(0);
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(titles('   ')).toEqual([]);
    expect(titles('s', 2)).toHaveLength(2);
  });

  it('keeps the input order for ties', () => {
    expect(titles('stripe')).toEqual(['Subscriptions', 'Pricing']);
  });
});

describe('relatedQueries', () => {
  it('is true while typing or deleting the same word', () => {
    expect(relatedQueries('acm', 'acme')).toBe(true);
    expect(relatedQueries('acme', 'acm')).toBe(true);
    expect(relatedQueries('Acme', 'acme plumbing')).toBe(true);
  });

  it('is false for a different word or an empty side', () => {
    expect(relatedQueries('acme', 'bolt')).toBe(false);
    expect(relatedQueries('', 'acme')).toBe(false);
  });
});
