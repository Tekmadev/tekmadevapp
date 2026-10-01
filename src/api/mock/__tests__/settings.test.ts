import { api, setAuthBridge } from '@/api/client';
import { getMe } from '@/api/endpoints/session';
import { getLoaderSettings, resetLoaderSettings, saveLoaderSettings } from '@/api/endpoints/settings';
import { ApiError } from '@/api/errors';
import { LOADER_DB_FAIL_BEAT_MS, LOADER_DEFAULTS_SERVER } from '@/api/mock/fixtures/settings';
import { zLoaderSettings, type LoaderSettings } from '@/api/schemas/settings';

/**
 * Loader settings routes through the real mock transport: read, save (clamped,
 * and visible in GET /me), the deliberate `db` failure, reset, the 400 for a
 * partial body, and owner-only 403s. Nothing here is paged.
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
beforeEach(asOwner);

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

const tuned: LoaderSettings = {
  beatMs: 1900,
  buttonBeatMs: 950,
  innerPull: 0.6,
  outerPull: 0.85,
  innerFade: 0.45,
  showAfterMs: 450,
};

describe('GET /settings/loader', () => {
  it('returns the six settings, the same values GET /me sends', async () => {
    const settings = await getLoaderSettings();
    expect(zLoaderSettings.safeParse(settings).success).toBe(true);
    expect(settings).toEqual(LOADER_DEFAULTS_SERVER);
    expect((await getMe()).loader).toEqual(settings);
  });

  it('is owner only', async () => {
    asManager();
    for (const call of [getLoaderSettings(), saveLoaderSettings(tuned), resetLoaderSettings()]) {
      const e = await apiError(call);
      expect([e.status, e.code]).toEqual([403, 'owner_only']);
    }
    asOwner();
    expect(await getLoaderSettings()).toEqual(LOADER_DEFAULTS_SERVER);
  });
});

describe('PUT /settings/loader', () => {
  it('saves for the whole site: the next read and GET /me both see it', async () => {
    const saved = await saveLoaderSettings(tuned);
    expect(zLoaderSettings.safeParse(saved).success).toBe(true);
    expect(saved).toEqual(tuned);
    expect(await getLoaderSettings()).toEqual(tuned);
    expect((await getMe()).loader).toEqual(tuned);
  });

  it('clamps to the ranges and stores whole milliseconds and two-decimal ratios', async () => {
    const saved = await saveLoaderSettings({
      beatMs: 5000,
      buttonBeatMs: 412.6,
      innerPull: 0.333,
      outerPull: 2,
      innerFade: 0.05,
      showAfterMs: -40,
    });
    expect(saved).toEqual({ beatMs: 3000, buttonBeatMs: 600, innerPull: 0.5, outerPull: 1, innerFade: 0.2, showAfterMs: 0 });

    const precise = await saveLoaderSettings({ ...tuned, buttonBeatMs: 1234.4, innerPull: 0.777 });
    expect([precise.buttonBeatMs, precise.innerPull]).toEqual([1234, 0.78]);
  });

  it('fails with code db on the trigger value and changes nothing', async () => {
    const before = await saveLoaderSettings(tuned);
    const e = await apiError(saveLoaderSettings({ ...tuned, beatMs: LOADER_DB_FAIL_BEAT_MS, innerFade: 0.9 }));
    expect([e.status, e.code, e.message]).toEqual([500, 'db', 'Could not save. Nothing changed on the site. Try again.']);
    expect(await getLoaderSettings()).toEqual(before);
    expect((await getMe()).loader).toEqual(before);
  });

  it('wants all six values as numbers', async () => {
    const e = await apiError(api.put('/settings/loader', { beatMs: 1600, innerPull: 'hard' }));
    expect([e.status, e.code]).toEqual([400, 'loader']);
    expect(Object.keys(e.fields ?? {}).sort()).toEqual(['buttonBeatMs', 'innerFade', 'innerPull', 'outerPull', 'showAfterMs']);
  });

  it('resets to the original settings on every page', async () => {
    await saveLoaderSettings(tuned);
    const reset = await resetLoaderSettings();
    expect(zLoaderSettings.safeParse(reset).success).toBe(true);
    expect(reset).toEqual(LOADER_DEFAULTS_SERVER);
    expect(await getLoaderSettings()).toEqual(LOADER_DEFAULTS_SERVER);
    expect((await getMe()).loader).toEqual(LOADER_DEFAULTS_SERVER);
  });
});
