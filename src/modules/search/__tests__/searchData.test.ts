import { ROLE_CAPABILITIES } from '@/auth/capabilities';

import type { Visibility } from '../../types';
import { adminHref, RESULT_TYPES, searchScreensFor, suggestedScreens } from '../searchData';

// Icons are opaque here (the ESM build is not transformed by Jest): each name stands in for its icon.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : String(name)) }));

const OWNER: Visibility = { role: 'owner', features: [] };
const MANAGER: Visibility = { role: 'manager', features: [] };
const STAFF: Visibility = { role: 'staff', features: [] };

const titlesFor = (v: Visibility) => searchScreensFor(v).map((s) => s.title);

/** Every screen search can jump to (hidden modules excluded). */
const EVERY_SCREEN = [
  'Overview',
  'Inbox',
  'Clients',
  'New client',
  'Leads',
  'Free tools',
  'Subscriptions',
  'One-time orders',
  'Blog',
  'Blog categories',
  'Email',
  'Email templates',
  'Subscribers',
  'Links',
  'CRM sync',
  'Contact inspector',
  'Analytics',
  'Ads',
  'Pricing',
  'Coupons',
  'Loader',
  'Test mode',
  'Team',
  'Team activity',
  'Profile',
  'My activity',
  'App settings',
  'Notification settings',
];

/** Screens staff never see, not even in search (owner decision 2026-10-03). */
const NOT_FOR_STAFF = [
  'New client',
  'Subscriptions',
  'One-time orders',
  'Subscribers',
  'CRM sync',
  'Contact inspector',
  'Ads',
  'Loader',
  'Test mode',
  'Team',
  'Team activity',
];

describe('searchScreensFor', () => {
  it('gives owners every screen, including the brief examples', () => {
    expect([...titlesFor(OWNER)].sort()).toEqual([...EVERY_SCREEN].sort());
  });

  it('gives managers the same screens as owners', () => {
    expect(titlesFor(MANAGER)).toEqual(titlesFor(OWNER));
  });

  it('gives staff leads, clients, analytics and view-only marketing and sales, nothing else', () => {
    const titles = titlesFor(STAFF);
    for (const t of NOT_FOR_STAFF) expect(titles).not.toContain(t);
    expect([...titles].sort()).toEqual(EVERY_SCREEN.filter((t) => !NOT_FOR_STAFF.includes(t)).sort());
  });

  it("follows the server's capability list over the role", () => {
    const titles = titlesFor({ role: 'staff', features: [], capabilities: ['leads.view', 'team.view'] });
    expect(titles).toEqual(expect.arrayContaining(['Leads', 'Team', 'Profile', 'App settings']));
    expect(titles).not.toContain('Clients');
    expect(titles).not.toContain('Pricing');
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
    expect(suggestedScreens(searchScreensFor(MANAGER)).map((s) => s.title)).toEqual(['Inbox', 'New client', 'Pricing', 'Coupons']);
    expect(suggestedScreens(searchScreensFor(STAFF)).map((s) => s.title)).toEqual(['Inbox', 'Pricing', 'Coupons', 'Leads']);
  });
});

describe('adminHref', () => {
  const staff = ROLE_CAPABILITIES.staff;

  it('maps record urls to app routes', () => {
    expect(adminHref('/admin/clients/cl_123', staff)).toBe('/clients/cl_123');
    expect(adminHref('/admin/clients/cl_123#calls', ROLE_CAPABILITIES.owner)).toBe('/clients/cl_123?section=calls');
    expect(adminHref('/admin/leads/ld_9', staff)).toBe('/leads/ld_9');
    expect(adminHref('/admin/blog/post_1', staff)).toBe('/blog/post_1');
    expect(adminHref('/admin/coupons', { role: 'manager' })).toBe('/coupons');
  });

  it('sends what this person may not open, and unknown urls, to the Inbox', () => {
    expect(adminHref('/admin/email/subscribers/es_1', staff)).toBe('/inbox');
    expect(adminHref('/admin/coupons', ['leads.view'])).toBe('/inbox');
    expect(adminHref('/admin/somewhere-new', ROLE_CAPABILITIES.owner)).toBe('/inbox');
    expect(adminHref('not a url', ROLE_CAPABILITIES.owner)).toBe('/inbox');
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
