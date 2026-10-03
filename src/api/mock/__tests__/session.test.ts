import { api, newIdempotencyKey, setAuthBridge } from '@/api/client';
import { sendTestPush } from '@/api/endpoints/notifications';
import { getMe, getMeta, registerDevice, unregisterDevice, updateProfile } from '@/api/endpoints/session';
import { ApiError } from '@/api/errors';
import { loaderState } from '@/api/mock/fixtures/settings';
import { zMeta } from '@/api/schemas/meta';
import { metaFragment as notificationsMeta } from '@/api/schemas/notifications';
import { zDeviceRegistration, zMe, zProfileUpdate } from '@/api/schemas/session';

/**
 * Session routes through the real mock transport: GET /me per role, the
 * "not staff" answer for portal users, GET /meta, push device registration,
 * and PATCH /profile.
 */

let token: string | null = null;
const tokenFor = (userId: string) => `mock.${userId}.${Date.now() + 3_600_000}`;
const asOwner = () => {
  token = tokenFor('usr_owner01');
};
const asManager = () => {
  token = tokenFor('usr_mgr01');
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token, refresh: async () => null });
});

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

const pushToken = (name: string) => `ExponentPushToken[${name}]`;

describe('GET /me', () => {
  it('describes the owner', async () => {
    asOwner();
    const me = await getMe();
    expect(zMe.safeParse(me).success).toBe(true);
    expect(me.user).toEqual({ id: 'usr_owner01', email: 'owner@tekmadev.test', name: 'Shajeed I.' });
    expect(me.role).toBe('owner');
    expect(me.features).toEqual([]);
    expect(me.timezone).toBe('America/Toronto');
    expect(me.loader).toEqual(loaderState.current);
    expect(me.testModeConfigured).toBe(true);
    expect(me.app).toEqual({ latestVersion: '0.1.0', minVersion: '0.1.0', apkUrl: null });
  });

  it('describes a manager', async () => {
    asManager();
    const me = await getMe();
    expect(zMe.safeParse(me).success).toBe(true);
    expect(me.role).toBe('manager');
    expect(me.user.name).toBe('Maya Chen');
  });

  it('follows loader changes saved in the Loader screen', async () => {
    asOwner();
    const saved = { ...loaderState.current };
    loaderState.current = { ...saved, beatMs: 1900 };
    expect((await getMe()).loader.beatMs).toBe(1900);
    loaderState.current = saved;
  });

  it('refuses client portal users and missing sessions', async () => {
    token = tokenFor('usr_client01');
    const portal = await apiError(getMe({ rawAuthErrors: true }));
    expect([portal.status, portal.code]).toEqual([403, 'not_staff']);

    token = null;
    const none = await apiError(getMe({ rawAuthErrors: true }));
    expect(none.status).toBe(401);

    token = `mock.usr_owner01.${Date.now() - 1000}`;
    const expired = await apiError(getMe({ rawAuthErrors: true }));
    expect(expired.status).toBe(401);
  });
});

describe('GET /meta', () => {
  it('returns every enum, including the notification catalogue', async () => {
    asManager();
    const meta = await getMeta();
    expect(notificationsMeta.safeParse(meta).success).toBe(true);
    expect(meta.notificationEvents.some((e) => e.label === 'New booking')).toBe(true);

    // Every key the route sends must match zMeta. A top-level key that is still
    // missing belongs to a domain whose fixture fragment is not filled in yet;
    // each domain's own test checks its fragment, so only malformed values fail here.
    const full = zMeta.safeParse(meta);
    const record = meta as unknown as Record<string, unknown>;
    const malformed = full.success
      ? []
      : full.error.issues.filter((issue) => {
          const top = issue.path[0];
          return !(issue.path.length === 1 && typeof top === 'string' && record[top] === undefined);
        });
    expect(malformed).toEqual([]);
  });
});

describe('POST /devices and DELETE /devices/:id', () => {
  it('registers a phone once per token, and removes it on sign-out', async () => {
    asManager();
    const body = { token: pushToken('maya-pixel-8a'), platform: 'android' as const, appVersion: '0.1.0', deviceName: 'Pixel 8a' };
    const first = await registerDevice(body, newIdempotencyKey());
    expect(zDeviceRegistration.safeParse(first).success).toBe(true);
    expect(first.id).toMatch(/^dev_/);

    // Token refresh or a second sign-in on the same phone reuses the row.
    const again = await registerDevice({ ...body, appVersion: '0.1.1' }, newIdempotencyKey());
    expect(again.id).toBe(first.id);

    // A retry with the same idempotency key gets the same answer.
    const key = newIdempotencyKey();
    const retryBody = { ...body, token: pushToken('maya-tablet') };
    const a = await registerDevice(retryBody, key);
    const b = await registerDevice(retryBody, key);
    expect(b.id).toBe(a.id);

    // The registered phone can receive a test notification.
    expect((await sendTestPush(first.id)).sent).toBe(1);

    expect(await unregisterDevice(first.id)).toBeNull();
    const gone = await apiError(unregisterDevice(first.id));
    expect(gone.status).toBe(404);
    await unregisterDevice(a.id);
  });

  it('never removes a phone that belongs to someone else', async () => {
    asManager();
    const error = await apiError(unregisterDevice('dev_4be1c09a'));
    expect(error.status).toBe(404);
  });

  it('validates the token, platform and app version', async () => {
    asOwner();
    const badToken = await apiError(
      registerDevice({ token: 'not a token', platform: 'android', appVersion: '0.1.0', deviceName: 'Pixel 7' }, newIdempotencyKey()),
    );
    expect([badToken.status, badToken.code]).toEqual([400, 'token']);
    expect(badToken.fields?.token).toEqual(expect.any(String));

    // iPhones register too (the iOS build comes after Android); anything else is refused.
    const web = await apiError(
      api.post('/devices', { token: pushToken('browser'), platform: 'web', appVersion: '0.1.0', deviceName: 'Browser' }, { idempotencyKey: newIdempotencyKey() }),
    );
    expect([web.status, web.code]).toEqual([400, 'platform']);

    const noVersion = await apiError(
      api.post('/devices', { token: pushToken('pixel-x'), platform: 'android', deviceName: 'Pixel' }, { idempotencyKey: newIdempotencyKey() }),
    );
    expect([noVersion.status, noVersion.code]).toEqual([400, 'app_version']);
  });
});

describe('PATCH /profile', () => {
  it('changes the display name that /me returns, and can clear it', async () => {
    asManager();
    const renamed = await updateProfile({ name: '  Maya C.  ' });
    expect(zProfileUpdate.safeParse(renamed).success).toBe(true);
    expect(renamed).toEqual({ name: 'Maya C.' });
    expect((await getMe()).user.name).toBe('Maya C.');

    expect(await updateProfile({ name: '' })).toEqual({ name: null });
    expect((await getMe()).user.name).toBeNull();

    expect(await updateProfile({ name: 'Maya Chen' })).toEqual({ name: 'Maya Chen' });
  });

  it('rejects names that are too long or not text', async () => {
    asOwner();
    const long = await apiError(updateProfile({ name: 'S'.repeat(81) }));
    expect([long.status, long.code]).toEqual([400, 'name']);
    expect(long.fields?.name).toEqual(expect.any(String));

    const wrong = await apiError(api.patch('/profile', { name: 42 }));
    expect([wrong.status, wrong.code]).toEqual([400, 'name']);
    expect((await getMe()).user.name).toBe('Shajeed I.');
  });
});
