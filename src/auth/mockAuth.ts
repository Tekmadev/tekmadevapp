import { mockControls } from '@/api/mock/controls';
import { MOCK_ACCOUNTS, MOCK_PORTAL_USER } from '@/api/mock/fixtures/staff';
import { readJSON, secureStorage, writeJSON } from '@/lib/storage';

/**
 * Mock sign-in (EXPO_PUBLIC_AUTH_MODE=mock): the same contract as Supabase
 * (password sign-in, short-lived access tokens, refresh) against the fixture
 * staff accounts in src/api/mock/fixtures/staff.ts.
 */

const KEY = 'mock.session.v1';
const TOKEN_TTL_MS = 60 * 60 * 1000;

type MockSession = { userId: string; email: string; accessToken: string; expiresAt: number };

export type MockSignInResult =
  | { ok: true; session: MockSession }
  | { ok: false; reason: 'invalid_credentials' | 'network' };

function issue(userId: string, email: string): MockSession {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  return { userId, email, accessToken: `mock.${userId}.${expiresAt}`, expiresAt };
}

export const mockAuth = {
  async signIn(email: string, password: string): Promise<MockSignInResult> {
    await new Promise((r) => setTimeout(r, 450));
    if (mockControls.state.offline) return { ok: false, reason: 'network' };
    const needle = email.trim().toLowerCase();
    const account =
      MOCK_ACCOUNTS.find((a) => a.email === needle && a.password === password) ??
      (MOCK_PORTAL_USER.email === needle && MOCK_PORTAL_USER.password === password
        ? { id: MOCK_PORTAL_USER.id, email: MOCK_PORTAL_USER.email }
        : undefined);
    if (!account) return { ok: false, reason: 'invalid_credentials' };
    const session = issue(account.id, account.email);
    writeJSON(secureStorage, KEY, session);
    return { ok: true, session };
  },

  getSession(): MockSession | null {
    return readJSON<MockSession>(secureStorage, KEY) ?? null;
  },

  /** Valid token, refreshing first when it is about to expire. */
  async getAccessToken(): Promise<string | null> {
    const session = mockAuth.getSession();
    if (!session) return null;
    if (session.expiresAt - Date.now() < 60_000) return mockAuth.refresh();
    return session.accessToken;
  },

  async refresh(): Promise<string | null> {
    const session = mockAuth.getSession();
    if (!session) return null;
    if (mockControls.state.expireTokens) return null;
    const next = issue(session.userId, session.email);
    writeJSON(secureStorage, KEY, next);
    return next.accessToken;
  },

  signOut() {
    secureStorage.remove(KEY);
  },
};
