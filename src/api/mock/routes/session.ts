import type { Me } from '../../schemas/session';
import { metaFixture } from '../fixtures/meta';
import { inboxStateFor, mockDevices } from '../fixtures/notifications';
import { searchFixtures } from '../fixtures/overview';
import { loaderState } from '../fixtures/settings';
import { MOCK_ACCOUNTS } from '../fixtures/staff';
import { fail, mockId, notFound, nowIso, ok, str, type MockRoute, type MockStaff } from '../router';
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
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\]\s]{1,4096}\]$/;

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/me',
    latency: 'fast',
    handler: ({ user }) => {
      // Like the server: the first /me sets up this user's inbox read state.
      inboxStateFor(user.id, user.role);
      const me: Me = {
        user: { id: user.id, email: user.email, name: staffName(user) },
        role: user.role,
        // Server feature flags. The 'assistant' module stays hidden until listed here.
        features: [],
        timezone: 'America/Toronto',
        loader: { ...loaderState.current },
        testModeConfigured: true,
        app: { latestVersion: env.appVersion === '0.0.0' ? '0.1.0' : env.appVersion, minVersion: '0.1.0', apkUrl: null },
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
    // Any staff. Role filtered inside: managers only ever get clients and leads.
    handler: ({ query, role }) => ok({ results: searchFixtures(query.q ?? '', role) }),
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
        deviceName: deviceName || 'Android phone',
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
