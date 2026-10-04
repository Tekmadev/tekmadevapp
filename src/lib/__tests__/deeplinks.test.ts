/// <reference types="node" />
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import type { Role } from '@/api/types';
import { capabilitiesOf, ROLE_CAPABILITIES, type Capability, type CapabilitySource } from '@/auth/capabilities';
import {
  CLIENT_SECTIONS,
  INBOX,
  mapAdminUrl,
  parseAdminUrl,
  toHref,
  type AppLink,
} from '@/lib/deeplinks';

const HOME: AppLink = { pathname: '/' };
const segment = (pathname: string, value: string): AppLink => ({ pathname, params: { segment: value } });

/** A GET /me profile as the server sends it: the role with its capability list. */
const me = (role: Role, capabilities: readonly string[] = ROLE_CAPABILITIES[role]): CapabilitySource => ({ role, capabilities });
const OWNER = me('owner');
const MANAGER = me('manager');
const STAFF = me('staff');

/** Brief section 7, row by row: web path, app route, the capability it needs. */
const TABLE: [path: string, link: AppLink, capability: Capability | null][] = [
  ['/admin', HOME, 'overview.view'],
  ['/admin/notifications', INBOX, 'notifications.view'],
  ['/admin/notifications?filter=action', { pathname: '/inbox', params: { filter: 'action' } }, 'notifications.view'],
  ['/admin/notifications?filter=bogus', INBOX, 'notifications.view'],
  ['/admin/analytics?range=7d', { pathname: '/analytics', params: { range: '7d' } }, 'analytics.view'],
  ['/admin/leads', segment('/customers', 'leads'), 'leads.view'],
  ['/admin/tools', segment('/customers', 'tools'), 'tools.view'],
  ['/admin/subscriptions', segment('/customers', 'subscriptions'), 'billing.view'],
  ['/admin/clients', segment('/customers', 'clients'), 'clients.view'],
  ['/admin/clients/new', { pathname: '/clients/new' }, 'clients.create'],
  ['/admin/clients/cl_8f3a2c', { pathname: '/clients/[id]', params: { id: 'cl_8f3a2c' } }, 'clients.view'],
  ['/admin/analytics', { pathname: '/analytics' }, 'analytics.view'],
  ['/admin/ads', { pathname: '/ads' }, 'ads.view'],
  ['/admin/email', segment('/marketing', 'email'), 'email.view'],
  ['/admin/crm', segment('/marketing', 'crm'), 'crm.view'],
  ['/admin/blog', segment('/marketing', 'blog'), 'blog.view'],
  ['/admin/links', segment('/marketing', 'links'), 'links.view'],
  ['/admin/blog/post_42', { pathname: '/blog/[id]', params: { id: 'post_42' } }, 'blog.view'],
  ['/admin/pricing', { pathname: '/pricing' }, 'pricing.view'],
  ['/admin/coupons', { pathname: '/coupons' }, 'coupons.view'],
  ['/admin/loader', { pathname: '/loader' }, 'loader.view'],
  ['/admin/test-mode', { pathname: '/test-mode' }, 'testmode.view'],
  ['/admin/team', { pathname: '/team' }, 'team.view'],
  ['/admin/profile', { pathname: '/profile' }, null],
];

/** Detail paths beyond the table that notifications also carry. */
const DETAILS: [path: string, link: AppLink, capability: Capability | null][] = [
  ['/admin/leads/ld_1', { pathname: '/leads/[id]', params: { id: 'ld_1' } }, 'leads.view'],
  ['/admin/tools/sub_1', { pathname: '/tools/[id]', params: { id: 'sub_1' } }, 'tools.view'],
  ['/admin/email/subscribers/es_1', { pathname: '/email/subscriber/[id]', params: { id: 'es_1' } }, 'email.subscribers.view'],
  ['/admin/links/ln_1', { pathname: '/links/[id]', params: { id: 'ln_1' } }, 'links.view'],
  // Web admin pages below a section (app/admin/(dashboard) on the website).
  ['/admin/blog/new', { pathname: '/blog/[id]', params: { id: 'new' } }, 'blog.write'],
  ['/admin/blog/post_42/preview', { pathname: '/blog/[id]', params: { id: 'post_42' } }, 'blog.view'],
  ['/admin/clients/templates', { pathname: '/clients/templates' }, 'clients.templates'],
  ['/admin/email/templates', { pathname: '/email/templates' }, 'email.view'],
];

const ALL = [...TABLE, ...DETAILS];

/** What staff may not open (owner decision 2026-10-03: no money, no settings, view-only marketing). */
const STAFF_BLOCKED = [
  '/admin/subscriptions',
  '/admin/clients/new',
  '/admin/ads',
  '/admin/crm',
  '/admin/loader',
  '/admin/test-mode',
  '/admin/team',
  '/admin/email/subscribers/es_1',
  '/admin/blog/new',
  '/admin/clients/templates',
];

describe('mapAdminUrl: the brief table', () => {
  it.each(ALL)('%s for the owner', (path, link) => {
    expect(mapAdminUrl(path, OWNER)).toEqual(link);
  });

  it.each(ALL)('%s for a manager (everything but team removal and owners)', (path, link) => {
    expect(mapAdminUrl(path, MANAGER)).toEqual(link);
  });

  it.each(ALL.filter(([path]) => !STAFF_BLOCKED.includes(path)))('%s for staff', (path, link) => {
    expect(mapAdminUrl(path, STAFF)).toEqual(link);
  });

  it.each(STAFF_BLOCKED)('%s is not for staff: they land in the Inbox', (path) => {
    expect(mapAdminUrl(path, STAFF)).toEqual(INBOX);
  });

  it.each(ALL.filter(([, , capability]) => capability !== null))('%s needs its capability: without it, the Inbox', (path, _link, capability) => {
    const without = capabilitiesOf(OWNER).filter((c) => c !== capability);
    expect(mapAdminUrl(path, without)).toEqual(INBOX);
    expect(mapAdminUrl(path, me('owner', without))).toEqual(INBOX);
  });

  it('opens Profile for anyone signed in, whatever they hold', () => {
    expect(mapAdminUrl('/admin/profile', me('staff', []))).toEqual({ pathname: '/profile' });
  });
});

describe('mapAdminUrl: who is following the link', () => {
  it("follows the server's list over the role", () => {
    const narrowOwner = me('owner', ['leads.view', 'notifications.view']);
    expect(mapAdminUrl('/admin/leads', narrowOwner)).toEqual(segment('/customers', 'leads'));
    expect(mapAdminUrl('/admin/pricing', narrowOwner)).toEqual(INBOX);
    expect(mapAdminUrl('/admin', narrowOwner)).toEqual(INBOX);
    const wideStaff = me('staff', [...ROLE_CAPABILITIES.staff, 'team.view']);
    expect(mapAdminUrl('/admin/team', wideStaff)).toEqual({ pathname: '/team' });
  });

  it("uses the role's fallback row when /me has no list", () => {
    expect(mapAdminUrl('/admin/team', { role: 'manager' })).toEqual({ pathname: '/team' });
    expect(mapAdminUrl('/admin/team', { role: 'staff' })).toEqual(INBOX);
    expect(mapAdminUrl('/admin/team', { role: 'staff', capabilities: null })).toEqual(INBOX);
    expect(mapAdminUrl('/admin/leads', { role: 'staff' })).toEqual(segment('/customers', 'leads'));
  });

  it('takes a bare capability list', () => {
    expect(mapAdminUrl('/admin/coupons', ['coupons.view'])).toEqual({ pathname: '/coupons' });
    expect(mapAdminUrl('/admin/coupons', ['coupons.write'])).toEqual(INBOX);
    expect(mapAdminUrl('/admin/coupons', [])).toEqual(INBOX);
  });

  it('still takes a bare role (its fallback row)', () => {
    expect(mapAdminUrl('/admin/team', 'owner')).toEqual({ pathname: '/team' });
    expect(mapAdminUrl('/admin/team', 'manager')).toEqual({ pathname: '/team' });
    expect(mapAdminUrl('/admin/team', 'staff')).toEqual(INBOX);
  });

  it('ignores capability names it does not know', () => {
    expect(mapAdminUrl('/admin/team', me('staff', ['team.view.everything', 'TEAM.VIEW']))).toEqual(INBOX);
  });

  it('opens only what every role may when nobody is known yet (no /me)', () => {
    expect(mapAdminUrl('/admin/leads', null)).toEqual(segment('/customers', 'leads'));
    expect(mapAdminUrl('/admin/pricing', undefined)).toEqual({ pathname: '/pricing' });
    expect(mapAdminUrl('/admin/subscriptions', null)).toEqual(INBOX);
    expect(mapAdminUrl('/admin/team', null)).toEqual(INBOX);
  });
});

describe('mapAdminUrl: client sections', () => {
  it('knows the 11 sections from the brief', () => {
    expect([...CLIENT_SECTIONS].sort()).toEqual(
      ['calls', 'onboarding', 'intake', 'access', 'files', 'approvals', 'agreements', 'crm', 'team', 'account', 'activity'].sort(),
    );
  });

  it.each([...CLIENT_SECTIONS])('#%s scrolls to that section', (section) => {
    const expected: AppLink = { pathname: '/clients/[id]', params: { id: 'cl_1', section } };
    expect(mapAdminUrl(`/admin/clients/cl_1#${section}`, OWNER)).toEqual(expected);
    expect(mapAdminUrl(`/admin/clients/cl_1#${section}`, MANAGER)).toEqual(expected);
  });

  it.each(CLIENT_SECTIONS.filter((s) => s !== 'crm'))('#%s scrolls there for staff too', (section) => {
    expect(mapAdminUrl(`/admin/clients/cl_1#${section}`, STAFF)).toEqual({ pathname: '/clients/[id]', params: { id: 'cl_1', section } });
  });

  it('opens the client at the top when the section is one this person cannot see (CRM for staff)', () => {
    expect(mapAdminUrl('/admin/clients/cl_1#crm', STAFF)).toEqual({ pathname: '/clients/[id]', params: { id: 'cl_1' } });
  });

  it('ignores an unknown or empty hash and still opens the client', () => {
    const plain: AppLink = { pathname: '/clients/[id]', params: { id: 'cl_1' } };
    expect(mapAdminUrl('/admin/clients/cl_1#billing', 'owner')).toEqual(plain);
    expect(mapAdminUrl('/admin/clients/cl_1#CALLS', 'owner')).toEqual(plain);
    expect(mapAdminUrl('/admin/clients/cl_1#', 'owner')).toEqual(plain);
  });
});

describe('mapAdminUrl: URL shapes', () => {
  const client: AppLink = { pathname: '/clients/[id]', params: { id: 'cl_1', section: 'calls' } };

  it('accepts the app scheme', () => {
    expect(mapAdminUrl('tekmadev-admin://admin/clients/cl_1#calls', 'owner')).toEqual(client);
    expect(mapAdminUrl('tekmadev-admin://admin', 'owner')).toEqual(HOME);
    expect(mapAdminUrl('TEKMADEV-ADMIN://admin/leads', 'owner')).toEqual(segment('/customers', 'leads'));
  });

  it('accepts website URLs, with or without www', () => {
    expect(mapAdminUrl('https://www.tekmadev.com/admin/clients/cl_1#calls', 'owner')).toEqual(client);
    expect(mapAdminUrl('https://tekmadev.com/admin/leads', 'owner')).toEqual(segment('/customers', 'leads'));
    expect(mapAdminUrl('http://www.tekmadev.com/admin', 'owner')).toEqual(HOME);
  });

  it('ignores trailing slashes', () => {
    expect(mapAdminUrl('/admin/', 'owner')).toEqual(HOME);
    expect(mapAdminUrl('/admin/clients/', 'owner')).toEqual(segment('/customers', 'clients'));
    expect(mapAdminUrl('/admin/clients/cl_1/#calls', 'owner')).toEqual(client);
    expect(mapAdminUrl('https://www.tekmadev.com/admin/pricing//', 'owner')).toEqual({ pathname: '/pricing' });
  });

  it('ignores query strings (before a hash too)', () => {
    expect(mapAdminUrl('/admin/leads?source=google&status=new', 'owner')).toEqual(segment('/customers', 'leads'));
    expect(mapAdminUrl('/admin/clients/cl_1?tab=x#calls', 'owner')).toEqual(client);
    expect(mapAdminUrl('/admin?from=push', 'owner')).toEqual(HOME);
  });

  it('decodes encoded ids', () => {
    expect(mapAdminUrl('/admin/clients/a%20b', 'owner')).toEqual({ pathname: '/clients/[id]', params: { id: 'a b' } });
  });

  it('accepts a path without its leading slash', () => {
    expect(mapAdminUrl('admin/clients', 'owner')).toEqual(segment('/customers', 'clients'));
  });

  it('trims surrounding whitespace', () => {
    expect(mapAdminUrl('  /admin/analytics \n', 'manager')).toEqual({ pathname: '/analytics' });
  });
});

describe('mapAdminUrl: unknown and garbage input never throws', () => {
  it.each([
    '/admin/nope',
    '/admin/clients/cl_1/extra',
    '/admin/blog/post_1/revisions',
    '/administrator',
    '/admin-panel',
    '/clients/cl_1',
    '/',
    'https://account.tekmadev.com/admin/clients',
    'https://evil.example/admin/pricing',
    'https://www.tekmadev.com.evil.example/admin/pricing',
    'javascript:alert(1)',
    '',
    '   ',
    '#calls',
    '?x=1',
    '/admin/clients/%E0%A4%A',
    '/ADMIN/clients',
  ])('%j goes to the Inbox', (input) => {
    expect(mapAdminUrl(input, 'owner')).toEqual(INBOX);
  });

  it('survives values that are not strings', () => {
    for (const value of [null, undefined, 42, {}, [], true]) {
      expect(() => mapAdminUrl(value as unknown as string, 'owner')).not.toThrow();
      expect(mapAdminUrl(value as unknown as string, 'owner')).toEqual(INBOX);
    }
  });
});

describe('parseAdminUrl', () => {
  it('splits path, hash and query', () => {
    const parsed = parseAdminUrl('https://www.tekmadev.com/admin/clients/cl_1/?tab=calls&x=1#onboarding');
    expect(parsed?.path).toBe('/clients/cl_1');
    expect(parsed?.hash).toBe('onboarding');
    expect(parsed?.search.get('tab')).toBe('calls');
    expect(parsed?.search.get('x')).toBe('1');
  });

  it('gives an empty path for /admin itself and null for non-admin URLs', () => {
    expect(parseAdminUrl('/admin')?.path).toBe('');
    expect(parseAdminUrl('/admin')?.hash).toBeNull();
    expect(parseAdminUrl('/start')).toBeNull();
    expect(parseAdminUrl('')).toBeNull();
  });
});

describe('registerDeepLinks', () => {
  // The extra rules are module state, so this block uses its own copy of the module
  // and the rest of the file keeps seeing only the core table.
  let mapAdminUrl: typeof import('@/lib/deeplinks').mapAdminUrl;
  beforeAll(() => {
    let isolated: typeof import('@/lib/deeplinks') | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a synchronous require to get a fresh module copy
      isolated = require('@/lib/deeplinks') as typeof import('@/lib/deeplinks');
    });
    if (!isolated) throw new Error('deeplinks did not load');
    mapAdminUrl = isolated.mapAdminUrl;
    isolated.registerDeepLinks([
      { pattern: '/approvals', to: () => ({ pathname: '/approvals' }) },
      {
        pattern: '/approvals/:id',
        capability: 'team.owners',
        to: ({ id }, hash) => {
          const params: Record<string, string> = { id };
          if (hash) params.step = hash;
          return { pathname: '/approvals/[id]', params };
        },
      },
      {
        pattern: '/jobs/:id',
        to: ({ id }, _hash, search, allowed) => ({
          pathname: '/jobs/[id]',
          params: { id, run: search.get('run') ?? '', ...(allowed('ads.refresh') ? { retry: '1' } : {}) },
        }),
      },
      // Checked before the core table, so a module can take over a path.
      { pattern: '/team', to: () => ({ pathname: '/team-v2' }) },
      {
        pattern: '/broken',
        to: () => {
          throw new Error('bad rule');
        },
      },
    ]);
  });

  it('maps paths that future modules add', () => {
    expect(mapAdminUrl('/admin/approvals', 'staff')).toEqual({ pathname: '/approvals' });
    expect(mapAdminUrl('/admin/approvals/ap_1#review', 'owner')).toEqual({ pathname: '/approvals/[id]', params: { id: 'ap_1', step: 'review' } });
    expect(mapAdminUrl('/admin/jobs/j_9?run=r2', 'staff')).toEqual({ pathname: '/jobs/[id]', params: { id: 'j_9', run: 'r2' } });
  });

  it('honours the capability on added rules', () => {
    expect(mapAdminUrl('/admin/approvals/ap_1', 'manager')).toEqual(INBOX);
    expect(mapAdminUrl('/admin/approvals/ap_1', ['team.owners'])).toEqual({ pathname: '/approvals/[id]', params: { id: 'ap_1' } });
  });

  it('lets a rule ask what the viewer holds', () => {
    expect(mapAdminUrl('/admin/jobs/j_9', 'manager')).toEqual({ pathname: '/jobs/[id]', params: { id: 'j_9', run: '', retry: '1' } });
  });

  it('checks added rules before the core table', () => {
    expect(mapAdminUrl('/admin/team', 'staff')).toEqual({ pathname: '/team-v2' });
  });

  it('falls back to the Inbox when a rule throws', () => {
    expect(mapAdminUrl('/admin/broken', 'owner')).toEqual(INBOX);
  });

  it('leaves the core table working', () => {
    expect(mapAdminUrl('/admin/clients/cl_1#calls', 'owner')).toEqual({ pathname: '/clients/[id]', params: { id: 'cl_1', section: 'calls' } });
    expect(mapAdminUrl('/admin/whatever', 'owner')).toEqual(INBOX);
  });
});

describe('toHref', () => {
  it('serializes plain routes', () => {
    expect(toHref(HOME)).toBe('/');
    expect(toHref(INBOX)).toBe('/inbox');
    expect(toHref({ pathname: '/analytics', params: {} })).toBe('/analytics');
  });

  it('fills dynamic segments and puts the rest in the query', () => {
    expect(toHref({ pathname: '/clients/[id]', params: { id: 'cl_1' } })).toBe('/clients/cl_1');
    expect(toHref({ pathname: '/clients/[id]', params: { id: 'cl_1', section: 'calls' } })).toBe('/clients/cl_1?section=calls');
    expect(toHref(segment('/customers', 'leads'))).toBe('/customers?segment=leads');
  });

  it('encodes values', () => {
    expect(toHref({ pathname: '/clients/[id]', params: { id: 'a b/c' } })).toBe('/clients/a%20b%2Fc');
    expect(toHref({ pathname: '/search', params: { q: 'a&b=c' } })).toBe('/search?q=a%26b%3Dc');
  });

  it('does not change the link it was given', () => {
    const link: AppLink = { pathname: '/clients/[id]', params: { id: 'cl_1', section: 'calls' } };
    toHref(link);
    expect(link.params).toEqual({ id: 'cl_1', section: 'calls' });
  });

  it('round trips a notification URL into an app href', () => {
    expect(toHref(mapAdminUrl('https://www.tekmadev.com/admin/clients/a%20b#files', 'owner'))).toBe('/clients/a%20b?section=files');
    expect(toHref(mapAdminUrl('/admin/subscriptions', STAFF))).toBe('/inbox');
  });
});

describe('every mapped route exists in app/', () => {
  /** Route paths from the files in app/: groups "(x)" dropped, "index" is the folder itself. */
  function routeFiles(): Set<string> {
    const root = join(__dirname, '..', '..', '..', 'app');
    const routes = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(name) || name.startsWith('_') || name.startsWith('+')) continue;
        const segments = relative(root, full)
          .replace(/\.tsx?$/, '')
          .split(sep)
          .filter((s) => !/^\(.*\)$/.test(s));
        if (segments[segments.length - 1] === 'index') segments.pop();
        routes.add(`/${segments.join('/')}`);
      }
    };
    walk(root);
    return routes;
  }

  it('has a screen for every pathname the mapper can produce', () => {
    const routes = routeFiles();
    const produced = new Set(ALL.map(([path]) => mapAdminUrl(path, OWNER).pathname));
    for (const pathname of produced) {
      expect({ pathname, exists: routes.has(pathname) }).toEqual({ pathname, exists: true });
    }
  });
});
