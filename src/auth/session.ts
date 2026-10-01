import { create } from 'zustand';

import { setAuthBridge } from '@/api/client';
import { getMe } from '@/api/endpoints/session';
import { ApiError, MESSAGES } from '@/api/errors';
import { clearQueryCache, queryClient } from '@/api/query';
import type { Me } from '@/api/schemas/session';
import type { Role } from '@/api/types';
import { env } from '@/lib/env';
import { notice } from '@/lib/notice';
import { readJSON, storage, StorageKeys, writeJSON } from '@/lib/storage';
import { useLoaderStore } from '@/loader/settings';

import { isBelowMinVersion } from './appVersion';
import { mockAuth } from './mockAuth';
import { getSupabase, isSupabaseConfigured } from './supabase';

/**
 * Who is signed in. A valid Supabase session is not enough: the same user pool
 * holds client portal users, so the app is only "signed in" once GET /me says
 * this account is staff.
 */

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

type SessionState = {
  status: SessionStatus;
  me: Me | null;
  /** Shown once on the sign-in screen after a forced sign-out. */
  signOutMessage: string | null;
  /** The app is too old for the API (426 or below `app.minVersion`). */
  updateRequired: boolean;
  /** True right after the first successful sign-in (offer biometric unlock). */
  justSignedIn: boolean;
};

export const useSession = create<SessionState>()(() => ({
  status: 'restoring',
  me: readJSON<Me>(storage, StorageKeys.lastMe) ?? null,
  signOutMessage: null,
  updateRequired: false,
  justSignedIn: false,
}));

const isSupabaseAuth = () => env.authMode === 'supabase' && isSupabaseConfigured();

async function currentAccessToken(): Promise<string | null> {
  if (isSupabaseAuth()) {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  }
  return mockAuth.getAccessToken();
}

async function refreshAccessToken(): Promise<string | null> {
  if (isSupabaseAuth()) {
    const { data, error } = await getSupabase().auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  }
  return mockAuth.refresh();
}

/**
 * Below `app.minVersion` blocks the app with the update screen (brief section 10),
 * the same as a 426. An unknown build version (no native module) never blocks.
 */
function applyVersionGate(me: Me) {
  if (env.appVersion !== '0.0.0' && isBelowMinVersion(me.app)) useSession.setState({ updateRequired: true });
}

function setMe(me: Me) {
  writeJSON(storage, StorageKeys.lastMe, me);
  useLoaderStore.getState().apply(me.loader);
  queryClient.setQueryData(['me'], me);
  useSession.setState({ me });
  applyVersionGate(me);
}

async function clearAuthSession() {
  if (isSupabaseAuth()) {
    await getSupabase()
      .auth.signOut({ scope: 'local' })
      .catch(() => undefined);
  }
  mockAuth.signOut();
}

export type SignInResult = { ok: true } | { ok: false; message: string };

export const SIGN_IN_MESSAGES = {
  wrong: 'Wrong email or password.',
  network: 'Could not sign in. Check your connection.',
  generic: 'Could not sign in.',
  notAllowed: 'That account is not allowed here.',
} as const;

export const session = {
  /** Boot: restore the stored session and show cached data at once, then confirm with /me. */
  async restore(): Promise<void> {
    const token = await currentAccessToken().catch(() => null);
    if (!token) {
      useSession.setState({ status: 'signedOut' });
      return;
    }
    const cached = useSession.getState().me;
    if (cached) {
      useLoaderStore.getState().apply(cached.loader);
      applyVersionGate(cached);
      useSession.setState({ status: 'signedIn' });
      // Confirm in the background; a 401 after refresh signs out through the bridge.
      session.refreshMe().catch(() => undefined);
      return;
    }
    try {
      setMe(await getMe());
      useSession.setState({ status: 'signedIn' });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        await clearAuthSession();
        useSession.setState({ status: 'signedOut' });
        return;
      }
      // Offline with no cached profile: we cannot show anything useful yet.
      useSession.setState({ status: 'signedOut', signOutMessage: SIGN_IN_MESSAGES.network });
    }
  },

  async refreshMe(): Promise<Me | null> {
    const me = await getMe();
    setMe(me);
    return me;
  },

  async signIn(email: string, password: string): Promise<SignInResult> {
    const trimmed = email.trim();
    if (isSupabaseAuth()) {
      const { error } = await getSupabase().auth.signInWithPassword({ email: trimmed, password });
      if (error) {
        const status = (error as { status?: number }).status ?? 0;
        const code = (error as { code?: string }).code;
        if (code === 'invalid_credentials' || status === 400) return { ok: false, message: SIGN_IN_MESSAGES.wrong };
        if (status === 0 || error.name === 'AuthRetryableFetchError') return { ok: false, message: SIGN_IN_MESSAGES.network };
        return { ok: false, message: SIGN_IN_MESSAGES.generic };
      }
    } else {
      const result = await mockAuth.signIn(trimmed, password);
      if (!result.ok) {
        return { ok: false, message: result.reason === 'network' ? SIGN_IN_MESSAGES.network : SIGN_IN_MESSAGES.wrong };
      }
    }

    try {
      const me = await getMe({ rawAuthErrors: true });
      setMe(me);
      useSession.setState({ status: 'signedIn', signOutMessage: null, justSignedIn: true });
      return { ok: true };
    } catch (e) {
      await clearAuthSession();
      if (e instanceof ApiError) {
        if (e.status === 401 || e.status === 403) return { ok: false, message: SIGN_IN_MESSAGES.notAllowed };
        if (e.isNetwork) return { ok: false, message: SIGN_IN_MESSAGES.network };
      }
      return { ok: false, message: SIGN_IN_MESSAGES.generic };
    }
  },

  async sendPasswordReset(email: string): Promise<void> {
    if (isSupabaseAuth()) {
      await getSupabase()
        .auth.resetPasswordForEmail(email.trim(), { redirectTo: env.resetRedirectUrl })
        .catch(() => undefined);
    } else {
      await new Promise((r) => setTimeout(r, 600));
    }
  },

  async updatePassword(password: string): Promise<{ ok: true } | { ok: false; message: string }> {
    if (isSupabaseAuth()) {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) return { ok: false, message: error.message || 'Could not change the password.' };
      return { ok: true };
    }
    await new Promise((r) => setTimeout(r, 700));
    return { ok: true };
  },

  /**
   * Sign out: clears the session and the server-state cache. Drafts are cleared by
   * the caller after confirming (a forced sign-out keeps them so no work is lost).
   */
  async signOut(message?: string): Promise<void> {
    await clearAuthSession();
    storage.remove(StorageKeys.lastMe);
    await clearQueryCache();
    useSession.setState({ status: 'signedOut', me: null, signOutMessage: message ?? null, justSignedIn: false });
  },

  acknowledgeSignIn() {
    useSession.setState({ justSignedIn: false });
  },
};

let sessionEnding = false;

/** Install the API client bridge (once, at startup). */
export function installAuthBridge(handlers: { onOwnerOnly: () => void }) {
  setAuthBridge({
    getAccessToken: () => currentAccessToken().catch(() => null),
    refresh: () => refreshAccessToken().catch(() => null),
    sessionEnded: (message) => {
      if (sessionEnding || useSession.getState().status !== 'signedIn') return;
      sessionEnding = true;
      session.signOut(message).finally(() => {
        sessionEnding = false;
      });
    },
    ownerOnly: () => {
      notice.err(MESSAGES.ownerOnly);
      handlers.onOwnerOnly();
    },
    upgradeRequired: () => useSession.setState({ updateRequired: true }),
  });
}

/* ---------- hooks ---------- */

export const useMe = () => useSession((s) => s.me);
export const useRole = (): Role | null => useSession((s) => s.me?.role ?? null);
export const useIsOwner = () => useSession((s) => s.me?.role === 'owner');
export const useFeatures = () => useSession((s) => s.me?.features);

/** First name for greetings ("Good morning, Shajeed"). Falls back to the email's local part. */
export function firstName(me: Me | null): string | null {
  if (!me) return null;
  const name = me.user.name?.trim();
  if (name) return name.split(/\s+/)[0] ?? null;
  return null;
}
