import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env } from '@/lib/env';
import { secureStorage } from '@/lib/storage';

/**
 * Supabase is used for sign-in and token refresh only. The app never reads
 * tables: every table is locked to the server and all data goes through the
 * admin API. The session lives in the encrypted MMKV store (key in the Keystore).
 */

const sessionStorage: SupportedStorage = {
  getItem: (key) => secureStorage.getString(key) ?? null,
  setItem: (key, value) => {
    secureStorage.set(key, value);
  },
  removeItem: (key) => {
    secureStorage.remove(key);
  },
};

let client: SupabaseClient | null = null;
let appStateWired = false;

export function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseKey);
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }
  client = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: {
      storage: sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  if (!appStateWired) {
    appStateWired = true;
    // Refresh tokens only while the app is in the foreground.
    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    AppState.addEventListener('change', (state) => {
      if (!client) return;
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }
  return client;
}
