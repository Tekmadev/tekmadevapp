import type { LoaderSettings } from '../../schemas/settings';
import {
  LOADER_DB_FAIL_BEAT_MS,
  LOADER_DEFAULTS_SERVER,
  LOADER_KEYS_SERVER,
  LOADER_RANGES_SERVER,
  loaderState,
  type ServerLoaderSettings,
} from '../fixtures/settings';
import { fail, ok, type MockRoute } from '../router';

/**
 * Mock routes for the "settings" domain: the loader settings the owner tunes in
 * Admin, Loader (owner only). They are the same values GET /me sends as
 * `loader`, so a save here reaches every page of the site and this app.
 */

const DB_MESSAGE = 'Could not save. Nothing changed on the site. Try again.';

/** Clamp to the section 5 range and store at the field's precision (whole ms, two decimals for ratios). */
function normalise(key: keyof ServerLoaderSettings, value: number): number {
  const { min, max, decimals } = LOADER_RANGES_SERVER[key];
  const clamped = Math.min(max, Math.max(min, value));
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/settings/loader',
    ownerOnly: true,
    latency: 'fast',
    handler: () => ok<LoaderSettings>({ ...loaderState.current }),
  },
  {
    method: 'PUT',
    path: '/settings/loader',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ body }) => {
      if (body.reset === true) {
        loaderState.current = { ...LOADER_DEFAULTS_SERVER };
        return ok<LoaderSettings>({ ...loaderState.current });
      }

      // PUT replaces the whole object: all six values, as numbers.
      const fields: Record<string, string> = {};
      for (const key of LOADER_KEYS_SERVER) {
        const value = body[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) fields[key] = 'Send a number.';
      }
      if (Object.keys(fields).length > 0) return fail(400, 'loader', 'Send all six loader settings as numbers.', fields);

      // Deliberate failure so the screen's error state can be seen: nothing is saved.
      if (body.beatMs === LOADER_DB_FAIL_BEAT_MS) return fail(500, 'db', DB_MESSAGE);

      const next = { ...loaderState.current };
      for (const key of LOADER_KEYS_SERVER) next[key] = normalise(key, body[key] as number);
      loaderState.current = next;
      return ok<LoaderSettings>({ ...next });
    },
  },
];
