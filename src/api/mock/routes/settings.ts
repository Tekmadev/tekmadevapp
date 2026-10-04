import type { CommissionSplit, LoaderSettings } from '../../schemas/settings';
import { commissionState, shareHundredths } from '../fixtures/credits';
import { recordNotificationEvent } from '../fixtures/notifications';
import {
  LOADER_DB_FAIL_BEAT_MS,
  LOADER_DEFAULTS_SERVER,
  LOADER_KEYS_SERVER,
  LOADER_RANGES_SERVER,
  loaderState,
  type ServerLoaderSettings,
} from '../fixtures/settings';
import { requireCap } from '../permissions';
import { fail, ok, type MockRoute } from '../router';

/**
 * Mock routes for the "settings" domain: the loader settings tuned in Admin,
 * Loader (`loader.view` to read, `loader.write` to save or reset: owners and
 * managers). They are the same values GET /me sends as `loader`, so a save
 * here reaches every page of the site and this app.
 */

const DB_MESSAGE = 'Could not save. Nothing changed on the site. Try again.';

/** The server's copy for the commission split (lib/admin-api/staff/commission.ts). */
const COMMISSION_MESSAGES = {
  share: 'Enter a number from 0 to 100, with at most two decimals.',
  split: 'Finder and booker must add up to 100.',
} as const;

/** Clamp to the section 5 range and store at the field's precision (whole ms, two decimals for ratios). */
function normalise(key: keyof ServerLoaderSettings, value: number): number {
  const { min, max, decimals } = LOADER_RANGES_SERVER[key];
  const clamped = Math.min(max, Math.max(min, value));
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

export const routes: MockRoute[] = [
  /*
   * The default commission split (docs/admin-api/staff.md section 6): read
   * with `clients.credits.view`, written by owners only (`commission.settings`).
   */
  {
    method: 'GET',
    path: '/settings/commission',
    latency: 'fast',
    handler: ({ user }) => requireCap(user, 'clients.credits.view') ?? ok<CommissionSplit>({ ...commissionState.current }),
  },
  {
    method: 'PUT',
    path: '/settings/commission',
    latency: 'normal',
    handler: ({ body, user }) => {
      const denied = requireCap(user, 'commission.settings');
      if (denied) return denied;
      const finder = shareHundredths(body.finder);
      const booker = shareHundredths(body.booker);
      if (finder === null || booker === null) {
        const fields: Record<string, string> = {};
        if (finder === null) fields.finder = COMMISSION_MESSAGES.share;
        if (booker === null) fields.booker = COMMISSION_MESSAGES.share;
        return fail(400, finder === null ? 'finder' : 'booker', COMMISSION_MESSAGES.share, fields);
      }
      if (finder + booker !== 10_000) {
        return fail(400, 'split', COMMISSION_MESSAGES.split, { finder: COMMISSION_MESSAGES.split, booker: COMMISSION_MESSAGES.split });
      }
      const before = commissionState.current;
      const next: CommissionSplit = { finder: finder / 100, booker: booker / 100 };
      if (before.finder === next.finder && before.booker === next.booker) return ok<CommissionSplit>(next);
      commissionState.current = next;
      recordNotificationEvent({
        event_key: 'settings.commission_changed',
        title: `Credit split is now finder ${next.finder} / booker ${next.booker}`,
        body: `Was finder ${before.finder} / booker ${before.booker}. Changed by ${user.email}`,
        action_url: '/admin',
        actor_type: 'staff',
        actor_label: user.email,
        data: { before, after: next },
      });
      return ok<CommissionSplit>({ ...next });
    },
  },
  {
    method: 'GET',
    path: '/settings/loader',
    latency: 'fast',
    handler: ({ user }) => requireCap(user, 'loader.view') ?? ok<LoaderSettings>({ ...loaderState.current }),
  },
  {
    method: 'PUT',
    path: '/settings/loader',
    latency: 'normal',
    handler: ({ body, user }) => {
      const denied = requireCap(user, 'loader.write');
      if (denied) return denied;
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
