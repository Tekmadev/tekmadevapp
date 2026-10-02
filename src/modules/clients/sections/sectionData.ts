import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { newIdempotencyKey } from '@/api/client';
import { clientKeys } from '@/api/endpoints/clients';
import { overviewKeys } from '@/api/endpoints/overview';
import { getMeta, sessionKeys } from '@/api/endpoints/session';
import { fieldErrors } from '@/api/errors';
import type { CallResult, ClientBundle } from '@/api/schemas/clients';
import { reportSubmitError } from '@/components/SubmitGroup';
import { haptics } from '@/design/haptics';

import { resolveLabels, type ClientLabels } from './labels';

/**
 * Data helpers shared by the Calls, CRM, Team, Account and Activity sections:
 * labels from GET /meta, patching the cached bundle with the entity a write
 * returned, and refreshing what the web admin would refresh after that write.
 */

const META_STALE_MS = 60 * 60_000;

/** Labels and tones from GET /meta (cached app-wide), with the brief's words as a fallback. */
export function useClientLabels(): ClientLabels {
  const { data } = useQuery({
    queryKey: sessionKeys.meta,
    queryFn: ({ signal }) => getMeta(signal),
    staleTime: META_STALE_MS,
  });
  return resolveLabels(data);
}

/** Apply a change to the cached GET /clients/:id bundle (no-op when it is not cached). */
export function updateBundle(queryClient: QueryClient, clientId: string, change: (bundle: ClientBundle) => ClientBundle) {
  queryClient.setQueryData<ClientBundle>(clientKeys.detail(clientId), (old) => (old ? change(old) : old));
}

/** Replace the item with the same id, or add it at the end. */
export function upsertById<T extends { id: string }>(list: readonly T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index < 0) return [...list, item];
  const next = list.slice();
  next[index] = item;
  return next;
}

/**
 * A call write returns the call and the guarantee it moved. Calls stay sorted
 * newest booking first, like the server sends them.
 */
export function applyCallResult(queryClient: QueryClient, clientId: string, result: CallResult) {
  updateBundle(queryClient, clientId, (bundle) => ({
    ...bundle,
    calls: upsertById(bundle.calls, result.call).sort((a, b) => Date.parse(b.bookedAt) - Date.parse(a.bookedAt)),
    guarantee: result.guarantee,
  }));
}

export type RefreshScope = {
  /** The Clients list rows (status, plan, guarantee pace, strategist). */
  lists?: boolean;
  /** Home: calls to review, behind pace, booked calls. */
  overview?: boolean;
};

/**
 * What the web admin refreshes after a write on this client: always the client
 * page (its activity log gains an entry), plus the list and Home when the write
 * changes what they show. The cache already holds the returned entity, so these
 * refetch in the background without a visible jump.
 */
export function refreshClient(queryClient: QueryClient, clientId: string, scope: RefreshScope = {}) {
  void queryClient.invalidateQueries({ queryKey: clientKeys.detail(clientId) });
  if (scope.lists) void queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
  if (scope.overview) void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
}

/**
 * A failed save in a section form: the API's field errors go inline, and the
 * message shows as a notice when no field explains it (or `always`, for forms
 * whose brief says API errors are notices). 401, 403, 426 and cancelled
 * requests are already handled globally, so they never show twice.
 */
export function showSaveError(error: unknown, setErrors: (errors: Record<string, string>) => void, always = false) {
  const fields = fieldErrors(error);
  setErrors(fields);
  haptics.error();
  if (always || Object.keys(fields).length === 0) reportSubmitError(error);
}

/**
 * One Idempotency-Key per intent. The same payload sent again (a retry after a
 * timeout or a lost connection) reuses the key, so the server answers with the
 * first result instead of creating a duplicate; a changed payload is a new
 * intent and gets a new key. Call `done()` after a success when the form stays
 * open, so sending the same text again on purpose is a new intent too.
 */
export function useIntentKey(): { keyFor: (payload: unknown) => string; done: () => void } {
  const [intent, setIntent] = useState<{ payload: string; key: string } | null>(null);
  return {
    keyFor: (payload: unknown) => {
      const text = JSON.stringify(payload);
      const key = intent && intent.payload === text ? intent.key : newIdempotencyKey();
      setIntent({ payload: text, key });
      return key;
    },
    done: () => setIntent(null),
  };
}
