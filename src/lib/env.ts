import * as Application from 'expo-application';

/**
 * Build-time configuration. Only EXPO_PUBLIC_* values exist in the bundle, and the
 * only keys allowed in the APK are the Supabase URL and publishable key (sign-in only).
 */

const apiMode = process.env.EXPO_PUBLIC_API_MODE === 'live' ? 'live' : 'mock';
const authMode = process.env.EXPO_PUBLIC_AUTH_MODE === 'supabase' ? 'supabase' : 'mock';

export const env = {
  /** "mock" until the owner says the API is live. */
  apiMode: apiMode as 'mock' | 'live',
  apiBase: (process.env.EXPO_PUBLIC_API_BASE ?? 'https://www.tekmadev.com/api/admin/v1').replace(/\/+$/, ''),
  /** "mock" signs in against fixture staff accounts; "supabase" uses the real project. */
  authMode: authMode as 'mock' | 'supabase',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  /**
   * Emails treated as owners by the mock API when signing in with real Supabase
   * accounts (comma separated). Lets the owner sign in for real and see fixtures.
   */
  mockOwnerEmails: (process.env.EXPO_PUBLIC_MOCK_OWNER_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  isDev: __DEV__,
  appVersion: Application.nativeApplicationVersion ?? '0.0.0',
  buildNumber: Application.nativeBuildVersion ?? '0',
  websiteUrl: 'https://www.tekmadev.com',
  portalUrl: 'https://account.tekmadev.com',
  resetRedirectUrl: 'https://www.tekmadev.com/admin/reset/confirm',
  scheme: 'tekmadev-admin',
} as const;

export const isMockApi = env.apiMode === 'mock';
