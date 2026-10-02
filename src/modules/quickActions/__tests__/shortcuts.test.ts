import type { Href } from 'expo-router';

import type { Me } from '@/api/schemas/session';
import { useSession } from '@/auth/session';

import { moreMenu, plusSheetActions } from '../../registry';
import type { Visibility } from '../../types';
import { hrefToPath, onQuickAction, shortcutItems } from '../shortcuts';

// Icons are opaque here (the ESM build is not transformed by Jest): each name stands in for its icon.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : String(name)) }));

const OWNER: Visibility = { role: 'owner', features: [] };
const MANAGER: Visibility = { role: 'manager', features: [] };

function signInAs(role: 'owner' | 'manager') {
  const me: Me = {
    user: { id: `usr_${role}`, email: `${role}@example.com`, name: null },
    role,
    features: [],
    timezone: 'America/Toronto',
    loader: {},
    testModeConfigured: true,
    app: { latestVersion: '0.1.0', minVersion: '0.1.0', apkUrl: null },
  };
  useSession.setState({ me, status: 'signedIn' });
}

describe('hrefToPath', () => {
  it('keeps string hrefs', () => {
    expect(hrefToPath('/inbox')).toBe('/inbox');
  });

  it('fills dynamic segments and turns the rest into a query', () => {
    expect(hrefToPath({ pathname: '/blog/[id]', params: { id: 'new' } })).toBe('/blog/new');
    expect(hrefToPath({ pathname: '/customers', params: { segment: 'clients', action: 'log-call' } })).toBe(
      '/customers?segment=clients&action=log-call',
    );
    expect(hrefToPath({ pathname: '/clients/[id]', params: { id: 'a b/c' } } as Href)).toBe('/clients/a%20b%2Fc');
  });
});

describe('shortcutItems', () => {
  it('gives owners Inbox, New client, Write a post and Analytics, with their icons', () => {
    expect(shortcutItems(OWNER, undefined)).toEqual([
      { id: 'inbox', title: 'Inbox', icon: 'shortcut_inbox', params: { href: '/inbox' } },
      { id: 'new-client', title: 'New client', icon: 'shortcut_client', params: { href: '/clients/new' } },
      { id: 'write-post', title: 'Write a post', icon: 'shortcut_post', params: { href: '/blog/new' } },
      { id: 'analytics', title: 'Analytics', icon: 'shortcut_analytics', params: { href: '/analytics' } },
    ]);
  });

  it('never gives managers an owner-only shortcut', () => {
    expect(shortcutItems(MANAGER, undefined).map((i) => i.id)).toEqual(['inbox', 'new-client', 'analytics']);
  });

  it('gives nothing when signed out, and respects the launcher limit', () => {
    expect(shortcutItems({ role: null, features: undefined }, undefined)).toEqual([]);
    expect(shortcutItems(OWNER, 2)).toHaveLength(2);
  });
});

describe('onQuickAction', () => {
  afterEach(() => useSession.setState({ me: null, status: 'signedOut' }));

  it('lets the router open a shortcut this person may use', () => {
    signInAs('owner');
    expect(onQuickAction({ id: 'write-post', title: 'Write a post', params: { href: '/blog/new' } })).toBe(false);
  });

  it('stops an owner shortcut for a manager, and anything unknown', () => {
    signInAs('manager');
    expect(onQuickAction({ id: 'write-post', title: 'Write a post', params: { href: '/blog/new' } })).toBe(true);
    expect(onQuickAction({ id: 'nope', title: 'Nope', params: { href: '/team' } })).toBe(true);
    expect(onQuickAction({ id: 'inbox', title: 'Inbox', params: { href: '/inbox' } })).toBe(false);
  });
});

describe('plusSheetActions', () => {
  it('gives owners all five actions in order', () => {
    expect(plusSheetActions(OWNER).map((a) => a.title)).toEqual([
      'New client',
      'Log a booked call',
      'Write a post',
      'New coupon',
      'New link',
    ]);
  });

  it('gives managers only New client and Log a booked call', () => {
    expect(plusSheetActions(MANAGER).map((a) => a.title)).toEqual(['New client', 'Log a booked call']);
  });
});

describe('moreMenu', () => {
  const shape = (v: Visibility) => moreMenu(v).map((s) => [s.title, s.modules.map((m) => m.title)]);

  it('gives owners Insights, Sales, Settings and App', () => {
    expect(shape(OWNER)).toEqual([
      ['Insights', ['Ads']],
      ['Sales', ['Pricing', 'Coupons']],
      ['Settings', ['Loader', 'Test mode', 'Team', 'Profile']],
      ['App', ['App settings']],
    ]);
  });

  it('gives managers only what they may open (no Insights, no Sales)', () => {
    expect(shape(MANAGER)).toEqual([
      ['Settings', ['Profile']],
      ['App', ['App settings']],
    ]);
  });

  it('keeps hidden modules out even when their flag is on', () => {
    const titles = moreMenu({ role: 'owner', features: ['assistant'] }).flatMap((s) => s.modules.map((m) => m.title));
    expect(titles).not.toContain('Assistant');
    expect(titles).not.toContain('Kit');
  });
});
