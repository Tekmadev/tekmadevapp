import { queryOptions } from '@tanstack/react-query';

import { api } from '../client';
import { zCommissionSplit, zLoaderSettings, type CommissionSplit, type LoaderSettings } from '../schemas/settings';

/**
 * Typed endpoints and query keys for the "settings" domain: the loader settings
 * (owner only) and the default commission split (read with
 * `clients.credits.view`, written with `commission.settings`). They are the same values GET /me sends as `loader`, so after a
 * save or reset also apply the result to the loader store
 * (`useLoaderStore.getState().apply(result)`) and invalidate `['me']`.
 */

export const settingsKeys = {
  all: ['settings'] as const,
  loader: () => ['settings', 'loader'] as const,
  commission: () => ['settings', 'commission'] as const,
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function getLoaderSettings(signal?: AbortSignal) {
  return api.get<LoaderSettings>('/settings/loader', { schema: zLoaderSettings, signal });
}

/** GET /settings/commission: the default finder / booker split. */
export function getCommissionSplit(signal?: AbortSignal) {
  return api.get<CommissionSplit>('/settings/commission', { schema: zCommissionSplit, signal });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/**
 * PUT /settings/commission (owners): the saved split. It applies to clients
 * created from then on; existing credits never change. 400 `finder` /
 * `booker` (range) or `split` (not 100 together) with field errors.
 */
export function saveCommissionSplit(split: CommissionSplit) {
  return api.put<CommissionSplit>('/settings/commission', split, { schema: zCommissionSplit });
}

/** "Save for the whole site": all six values. The server clamps them to the section 5 ranges. */
export function saveLoaderSettings(settings: LoaderSettings) {
  return api.put<LoaderSettings>('/settings/loader', settings, { schema: zLoaderSettings });
}

/** "Reset to original": the server puts back its defaults and returns them. */
export function resetLoaderSettings() {
  return api.put<LoaderSettings>('/settings/loader', { reset: true }, { schema: zLoaderSettings });
}

/* ------------------------------------------------------------------ */
/* Query options                                                       */
/* ------------------------------------------------------------------ */

export function loaderSettingsQuery() {
  return queryOptions({
    queryKey: settingsKeys.loader(),
    queryFn: ({ signal }) => getLoaderSettings(signal),
  });
}

export function commissionSplitQuery() {
  return queryOptions({
    queryKey: settingsKeys.commission(),
    queryFn: ({ signal }) => getCommissionSplit(signal),
  });
}
