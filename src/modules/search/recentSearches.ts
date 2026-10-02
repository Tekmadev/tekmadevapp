import { readJSON, storage, StorageKeys, writeJSON } from '@/lib/storage';

/**
 * Recent searches, remembered on this phone (encrypted MMKV). They belong to
 * the person who made them: a different account signing in on the same phone
 * starts with none, and signing out forgets them.
 */

export const RECENT_MAX = 8;
/** Longer queries are cut before they are stored. */
const QUERY_MAX = 100;

type Stored = { userId: string; items: string[] };

/** Newest first, case-insensitive duplicates folded into the newest, at most RECENT_MAX. */
export function addRecent(list: readonly string[], query: string): string[] {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, QUERY_MAX).trim();
  if (!q) return list.slice(0, RECENT_MAX);
  const key = q.toLowerCase();
  return [q, ...list.filter((item) => item.toLowerCase() !== key)].slice(0, RECENT_MAX);
}

export function loadRecents(userId: string | null): string[] {
  if (!userId) return [];
  const stored = readJSON<Stored>(storage, StorageKeys.recentSearches);
  if (!stored || stored.userId !== userId || !Array.isArray(stored.items)) return [];
  return stored.items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, RECENT_MAX);
}

export function saveRecents(userId: string, items: readonly string[]) {
  writeJSON(storage, StorageKeys.recentSearches, { userId, items: items.slice(0, RECENT_MAX) } satisfies Stored);
}

export function forgetRecents() {
  storage.remove(StorageKeys.recentSearches);
}
