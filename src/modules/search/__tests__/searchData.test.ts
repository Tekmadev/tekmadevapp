import type { Visibility } from '../../types';
import { adminHref, RESULT_TYPES, searchScreensFor, suggestedScreens } from '../searchData';

// Icons are opaque here (the ESM build is not transformed by Jest): each name stands in for its icon.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : String(name)) }));

const OWNER: Visibility = { role: 'owner', features: [] };
const MANAGER: Visibility = { role: 'manager', features: [] };

const titlesFor = (v: Visibility) => searchScreensFor(v).map((s) => s.title);

/** Owner-only modules' screens (brief section 1: managers never see these, not even in search). */
const OWNER_ONLY = [
  'Ads',
  'Blog',
  'Blog categories',
  'Email',
  'Email templates',
  'Subscribers',
  'Links',
  'CRM sync',
  'Contact inspector',
  'Pricing',
  'Coupons',
  'Loader',
  'Test mode',
  'Team',
];

describe('searchScreensFor', () => {
  it('gives owners every screen, including the brief examples', () => {
    const titles = titlesFor(OWNER);
    expect(titles).toEqual(expect.arrayContaining(['Pricing', 'Loader', ...OWNER_ONLY]));
  });

  it('never gives managers an owner-only screen', () => {
    const titles = titlesFor(MANAGER);
    for (const t of OWNER_ONLY) expect(titles).not.toContain(t);
    expect(titles).toEqual(
      expect.arrayContaining(['Overview', 'Inbox', 'Clients', 'New client', 'Leads', 'Free tools', 'Subscriptions', 'Analytics', 'Profile']),
    );
  });

  it('gives nothing when nobody is signed in', () => {
    expect(searchScreensFor({ role: null, features: undefined })).toEqual([]);
  });

  it('leaves out hidden modules (Kit, Assistant) even when their flag is on', () => {
    const titles = titlesFor({ role: 'owner', features: ['assistant'] });
    expect(titles).not.toContain('Kit');
    expect(titles).not.toContain('Assistant');
  });

  it('has unique titles and says where each screen lives', () => {
    const screens = searchScreensFor(OWNER);
    expect(new Set(screens.map((s) => s.title)).size).toBe(screens.length);
    const by = (title: string) => screens.find((s) => s.title === title);
    expect(by('Pricing')?.subtitle).toBe('More · Sales');
    expect(by('Loader')?.subtitle).toBe('More · Settings');
    expect(by('Leads')?.subtitle).toBe('Customers');
    expect(by('Blog categories')?.subtitle).toBe('Marketing');
    // The Analytics tab would read "Analytics": its summary says what it is instead.
    expect(by('Analytics')?.subtitle).toBe('Pageviews, sources, devices');
    // Module titles count as keywords ("blog" finds Blog categories).
    expect(by('Blog categories')?.keywords).toContain('Blog');
  });
});

describe('suggestedScreens', () => {
  it('picks the usual jumps this person can open', () => {
    expect(suggestedScreens(searchScreensFor(OWNER)).map((s) => s.title)).toEqual(['Inbox', 'New client', 'Pricing', 'Coupons']);
    expect(suggestedScreens(searchScreensFor(MANAGER)).map((s) => s.title)).toEqual(['Inbox', 'New client', 'Leads', 'App settings']);
  });
});

describe('adminHref', () => {
  it('maps record urls to app routes', () => {
    expect(adminHref('/admin/clients/cl_123', 'manager')).toBe('/clients/cl_123');
    expect(adminHref('/admin/clients/cl_123#calls', 'owner')).toBe('/clients/cl_123?section=calls');
    expect(adminHref('/admin/leads/ld_9', 'manager')).toBe('/leads/ld_9');
    expect(adminHref('/admin/blog/post_1', 'owner')).toBe('/blog/post_1');
    expect(adminHref('/admin/coupons', 'owner')).toBe('/coupons');
  });

  it('sends owner-only and unknown urls to the Inbox', () => {
    expect(adminHref('/admin/coupons', 'manager')).toBe('/inbox');
    expect(adminHref('/admin/somewhere-new', 'owner')).toBe('/inbox');
    expect(adminHref('not a url', 'owner')).toBe('/inbox');
  });
});

describe('RESULT_TYPES', () => {
  it('has a label and an icon for every result type', () => {
    for (const type of ['client', 'lead', 'subscriber', 'post', 'coupon', 'link'] as const) {
      expect(RESULT_TYPES[type].label).toBeTruthy();
      expect(RESULT_TYPES[type].icon).toBeTruthy();
    }
  });
});
