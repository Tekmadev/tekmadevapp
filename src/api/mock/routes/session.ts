import type { Capability } from '@/auth/capabilities';

import type { Me, SearchResultType } from '../../schemas/session';
import { useMockControls } from '../controls';
import { metaFixture } from '../fixtures/meta';
import { inboxStateFor, mockDevices } from '../fixtures/notifications';
import { searchFixtures } from '../fixtures/overview';
import { loaderState } from '../fixtures/settings';
import { MOCK_ACCOUNTS } from '../fixtures/staff';
import { capabilitiesFor, mockCan } from '../permissions';
import { fail, mockId, notFound, nowIso, ok, str, type MockRoute, type MockStaff } from '../router';
import { compareVersions } from '@/auth/appVersion';
import { env } from '@/lib/env';

/**
 * Mock routes for the "session" domain: who am I, the enums and labels, global
 * search, push device registration and the display name. Search itself is a
 * cross-domain read model in fixtures/overview.ts.
 */

/**
 * Display names set with PATCH /profile for staff who are not fixture accounts
 * (owners signing in with a real Supabase account in mock API mode).
 */
const nameOverrides = new Map<string, string | null>();

/** The caller's current display name (fixture accounts are edited in place). */
export function staffName(user: MockStaff): string | null {
  if (nameOverrides.has(user.id)) return nameOverrides.get(user.id) ?? null;
  return MOCK_ACCOUNTS.find((a) => a.id === user.id)?.name ?? user.name;
}

/** How other staff see this person (e.g. "Resolved by Maya Chen"). */
export function staffLabel(user: MockStaff): string {
  return staffName(user) ?? user.email;
}

const NAME_MAX = 80;

/** What each search result type needs (the server filters results with the same `*.view` rows). */
const SEARCH_CAPABILITY: Record<SearchResultType, Capability> = {
  client: 'clients.view',
  lead: 'leads.view',
  subscriber: 'email.subscribers.view',
  post: 'blog.view',
  coupon: 'coupons.view',
  link: 'links.view',
};

/**
 * GET /search for this caller: only the result types their capabilities open,
 * and test clients only for people who may see test data. The scope applies
 * before the top 20 are cut, so staff get their own best matches.
 */
function searchFor(q: string, user: MockStaff) {
  const types = new Set((Object.keys(SEARCH_CAPABILITY) as SearchResultType[]).filter((t) => mockCan(user, SEARCH_CAPABILITY[t])));
  return searchFixtures(q, { types, includeTest: mockCan(user, 'testdata.view') });
}
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\]\s]{1,4096}\]$/;

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/me',
    latency: 'fast',
    handler: ({ user }) => {
      // Like the server: the first /me sets up this user's inbox read state.
      inboxStateFor(user.id, user.role);
      // The dev panel's minimum version shows here too (GET /me passes the gate), and latest is never below it.
      const minVersion = useMockControls.getState().minVersion ?? '0.1.0';
      const current = env.appVersion === '0.0.0' ? '0.1.0' : env.appVersion;
      const latestVersion = compareVersions(current, minVersion) < 0 ? minVersion : current;
      const me: Me = {
        user: { id: user.id, email: user.email, name: staffName(user) },
        role: user.role,
        // What this person may do: the app shows and hides everything from this list.
        capabilities: capabilitiesFor(user),
        // Server feature flags. The 'assistant' module stays hidden until listed here.
        features: [],
        timezone: 'America/Toronto',
        loader: { ...loaderState.current },
        testModeConfigured: true,
        app: { latestVersion, minVersion, apkUrl: null },
      };
      return ok(me);
    },
  },
  {
    method: 'GET',
    path: '/meta',
    latency: 'normal',
    // The live API answers with an ETag; the mock transport has no headers, so it always sends the full body.
    handler: () => ok(metaFixture),
  },
  {
    method: 'GET',
    path: '/search',
    latency: 'fast',
    // Any staff. Each result type needs its `*.view` capability; test clients need testdata.view.
    handler: ({ query, user }) => ok({ results: searchFor(query.q ?? '', user) }),
  },
  {
    method: 'POST',
    path: '/devices',
    latency: 'normal',
    handler: ({ body, user }) => {
      const token = str(body.token)?.trim();
      const platform = body.platform;
      const appVersion = str(body.appVersion)?.trim();
      const deviceName = str(body.deviceName)?.trim();

      if (!token || !EXPO_PUSH_TOKEN.test(token)) {
        return fail(400, 'token', 'That push token is not valid.', { token: 'Send the Expo push token for this phone.' });
      }
      if (platform !== 'android' && platform !== 'ios') {
        return fail(400, 'platform', 'Only Android phones and iPhones can register for notifications.', { platform: 'Use "android" or "ios".' });
      }
      if (!appVersion) {
        return fail(400, 'app_version', 'Send the app version.', { appVersion: 'Send the app version, e.g. 0.1.0.' });
      }

      const now = nowIso();
      // One row per token: signing in again (or as someone else) on the same phone reuses it.
      const existing = mockDevices.find((d) => d.token === token);
      if (existing) {
        existing.userId = user.id;
        existing.appVersion = appVersion;
        existing.deviceName = deviceName || existing.deviceName;
        existing.lastSeenAt = now;
        return ok({ id: existing.id });
      }
      const device = {
        id: mockId('dev'),
        userId: user.id,
        token,
        platform: platform as 'android' | 'ios',
        appVersion,
        // The server's own default name per platform (lib/admin-devices.ts on the website).
        deviceName: deviceName || (platform === 'ios' ? 'iPhone' : 'Android phone'),
        createdAt: now,
        lastSeenAt: now,
      };
      mockDevices.push(device);
      return ok({ id: device.id }, 201);
    },
  },
  {
    method: 'DELETE',
    path: '/devices/:id',
    latency: 'fast',
    handler: ({ params, user }) => {
      const index = mockDevices.findIndex((d) => d.id === params.id && d.userId === user.id);
      if (index < 0) return notFound('That device');
      mockDevices.splice(index, 1);
      return ok(null);
    },
  },
  {
    method: 'PATCH',
    path: '/profile',
    latency: 'normal',
    handler: ({ body, user }) => {
      // PATCH is partial: without `name` nothing changes.
      if (!('name' in body)) return ok({ name: staffName(user) });
      const raw = body.name;
      if (raw !== null && typeof raw !== 'string') {
        return fail(400, 'name', 'Enter a display name.', { name: 'Enter a display name.' });
      }
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      if (trimmed.length > NAME_MAX) {
        return fail(400, 'name', `Keep the name to ${NAME_MAX} characters or fewer.`, {
          name: `Keep it to ${NAME_MAX} characters or fewer.`,
        });
      }
      // An empty name clears it (the app then shows the email).
      const name = trimmed || null;
      const account = MOCK_ACCOUNTS.find((a) => a.id === user.id);
      if (account) account.name = name;
      else nameOverrides.set(user.id, name);
      return ok({ name });
    },
  },
];
