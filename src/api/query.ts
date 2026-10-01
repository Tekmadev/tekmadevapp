import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient, type Query } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { useConnectivity } from '@/lib/connectivity';
import { storage, StorageKeys } from '@/lib/storage';

import { ApiError } from './errors';

/**
 * Server state. The cache is persisted to (encrypted) MMKV so the app opens on
 * cached data instantly, then refreshes. Queries refetch on screen focus (see
 * useRefreshOnFocus) and when the app comes back to the foreground.
 */

const DAY = 24 * 60 * 60 * 1000;

function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError) {
    // Business answers are final; only flaky transport and 5xx get one more try.
    if (error.status >= 400 && error.status < 500) return false;
    if (error.kind === 'aborted') return false;
  }
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * DAY,
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: false,
      networkMode: 'online',
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  key: StorageKeys.queryCache,
  throttleTime: 1500,
  storage: {
    getItem: (key) => storage.getString(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => {
      storage.remove(key);
    },
  },
});

/** Bump to drop every persisted cache after a breaking schema change. */
export const CACHE_BUSTER = 'v1';
export const CACHE_MAX_AGE = 7 * DAY;

/** Only successful, non-sensitive reads are persisted (long jobs and lookups are not). */
export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  const meta = query.meta as { persist?: boolean } | undefined;
  return meta?.persist !== false;
}

let wired = false;
/** Connect TanStack's focus and online managers to the app (call once at startup). */
export function wireQueryManagers() {
  if (wired) return;
  wired = true;
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
  onlineManager.setEventListener((setOnline) => {
    const apply = (s: ReturnType<typeof useConnectivity.getState>) => setOnline(s.online && !s.simulatedOffline);
    apply(useConnectivity.getState());
    return useConnectivity.subscribe(apply);
  });
}

/** Wipe server state (sign-out, "Clear cached data"). */
export async function clearQueryCache() {
  queryClient.clear();
  await queryPersister.removeClient();
}
