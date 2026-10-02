import type { QueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';

import { sessionKeys } from '@/api/endpoints/session';
import { queryClient as appQueryClient, queryPersister } from '@/api/query';
import { useSession } from '@/auth/session';
import { storage, StorageKeys } from '@/lib/storage';

/**
 * "Clear cached data" (brief 8.18): drops every cached server read, in memory
 * and on disk, plus expo-image's image cache. Keeps the session (and the
 * signed-in profile), preferences, drafts and recent searches.
 *
 * Screens that are mounted (the tabs under App settings) are reset rather than
 * removed, so they show their loading state and fetch again instead of holding
 * on to queries the cache no longer knows.
 */
export async function clearCachedData(qc: QueryClient = appQueryClient): Promise<void> {
  const me = useSession.getState().me;
  await qc.cancelQueries();
  qc.removeQueries({ predicate: (query) => query.getObserversCount() === 0 });
  await queryPersister.removeClient();
  storage.remove(StorageKeys.metaEtag);
  await Promise.all([Image.clearDiskCache().catch(() => false), Image.clearMemoryCache().catch(() => false)]);
  // The session keeps its profile; the offline banner and the More tab read its time from here.
  if (me) qc.setQueryData(sessionKeys.me, me);
  // Mounted screens go back to loading and fetch fresh; the persister saves only what comes back.
  void qc.resetQueries({ type: 'active' });
}
