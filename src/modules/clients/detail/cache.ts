import type { QueryClient } from '@tanstack/react-query';

import { clientKeys } from '@/api/endpoints/clients';
import { overviewKeys } from '@/api/endpoints/overview';
import type { ClientBundle } from '@/api/schemas/clients';

/**
 * Cache plumbing for writes on a client's detail screen. A write puts the
 * entity the server returned into the bundle at once, then refreshes what the
 * web admin would revalidate: this client's page, the Clients list and Home
 * (its "Needs you" counts read blocked runs, intakes to review and pace).
 */

/** Every write on one client shares this key, so the last one in flight decides when the page refetches. */
export const clientWriteKey = (clientId: string) => ['clients', 'write', clientId] as const;

/** Patch the cached bundle in place (no-op when it is not cached). */
export function setBundle(queryClient: QueryClient, clientId: string, update: (bundle: ClientBundle) => ClientBundle) {
  queryClient.setQueryData<ClientBundle>(clientKeys.detail(clientId), (old) => (old ? update(old) : old));
}

/**
 * Call from a mutation's own `onSettled` (it still counts as running there).
 * The page refetches only when no other write on this client is in flight, so
 * an earlier answer never overwrites a newer optimistic change (task undo).
 */
export function settleClientWrite(queryClient: QueryClient, clientId: string) {
  if (queryClient.isMutating({ mutationKey: clientWriteKey(clientId) }) <= 1) {
    void queryClient.invalidateQueries({ queryKey: clientKeys.detail(clientId) });
  }
  void queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
}
