import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createMMKV, deleteMMKV, existsMMKV, type MMKV } from 'react-native-mmkv';

/**
 * Local storage.
 *
 * - `secureStorage`: the Supabase session. SecureStore (Android Keystore) has a
 *   ~2KB value limit and a session is bigger, so the session lives in an
 *   AES-256 encrypted MMKV instance whose key is generated once and kept in
 *   SecureStore. This is the "encrypted large-value adapter" from the brief.
 * - `storage`: preferences, the persisted query cache and drafts. Encrypted with
 *   the same key, because the cache holds client names, emails and phone numbers.
 *
 * Both are synchronous, so the app can render cached data on the first frame.
 */

const KEY_NAME = 'tekmadev.storage.key.v1';
const STORE_IDS = ['tekmadev.secure', 'tekmadev.app'] as const;

function loadOrCreateKey(): string | undefined {
  try {
    const existing = SecureStore.getItem(KEY_NAME);
    if (existing) return existing;
    // 16 random bytes as 32 hex characters: exactly the 32-byte key AES-256 expects.
    const bytes = getRandomBytes(16);
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    SecureStore.setItem(KEY_NAME, key, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    // A new key with old files on disk means the files can never be read again
    // (e.g. restored from a backup without the Keystore entry): start clean.
    STORE_IDS.forEach((id) => {
      if (existsMMKV(id)) deleteMMKV(id);
    });
    return key;
  } catch {
    // Keystore unavailable (tests, broken device keystore): fall back to an
    // unencrypted store rather than refusing to start.
    return undefined;
  }
}

const encryptionKey = loadOrCreateKey();

export const secureStorage: MMKV = createMMKV({
  id: STORE_IDS[0],
  encryptionKey,
  encryptionType: encryptionKey ? 'AES-256' : undefined,
});

export const storage: MMKV = createMMKV({
  id: STORE_IDS[1],
  encryptionKey,
  encryptionType: encryptionKey ? 'AES-256' : undefined,
});

/** Storage keys in one place so "Clear cached data" and sign-out know what to wipe. */
export const StorageKeys = {
  queryCache: 'rq.cache.v1',
  prefs: 'prefs.v1',
  metaEtag: 'meta.etag',
  recentSearches: 'search.recent.v1',
  loaderSettings: 'loader.settings.v1',
  lastMe: 'me.last.v1',
  draftPrefix: 'draft.',
  biometricOffered: 'auth.biometricOffered',
} as const;

export function readJSON<T>(store: MMKV, key: string): T | undefined {
  const raw = store.getString(key);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    store.remove(key);
    return undefined;
  }
}

export function writeJSON(store: MMKV, key: string, value: unknown) {
  store.set(key, JSON.stringify(value));
}

/** Drafts: blog posts and long text fields autosave here. */
export const drafts = {
  key: (scope: string) => `${StorageKeys.draftPrefix}${scope}`,
  get<T>(scope: string): { value: T; savedAt: number } | undefined {
    return readJSON(storage, drafts.key(scope));
  },
  set<T>(scope: string, value: T) {
    writeJSON(storage, drafts.key(scope), { value, savedAt: Date.now() });
  },
  remove(scope: string) {
    storage.remove(drafts.key(scope));
  },
  list(): string[] {
    return storage
      .getAllKeys()
      .filter((k) => k.startsWith(StorageKeys.draftPrefix))
      .map((k) => k.slice(StorageKeys.draftPrefix.length));
  },
  clearAll() {
    drafts.list().forEach((scope) => drafts.remove(scope));
  },
};

/** Minimal sync storage shape used by zustand persist and the query persister. */
export const mmkvStringStorage = (store: MMKV) => ({
  getItem: (key: string) => store.getString(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => {
    store.remove(key);
  },
});
