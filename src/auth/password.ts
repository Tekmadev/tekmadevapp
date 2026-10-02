import { MESSAGES } from '@/api/errors';
import { mockControls } from '@/api/mock/controls';
import { MOCK_ACCOUNTS } from '@/api/mock/fixtures/staff';
import { connectivity } from '@/lib/connectivity';
import { env } from '@/lib/env';

import { mockAuth } from './mockAuth';
import { getSupabase, isSupabaseConfigured } from './supabase';

/**
 * Changing your own password (brief 8.17). With Supabase sign-in this is
 * `supabase.auth.updateUser({ password })` on the signed-in user's own session;
 * with mock sign-in it changes the fixture account's password, so the next mock
 * sign-in needs the new one. The session stays valid either way.
 *
 * Passwords are never trimmed: spaces count as characters.
 */

export const PASSWORD_MIN = 8;

export const PASSWORD_COPY = {
  tooShort: 'New password must be at least 8 characters.',
  mismatch: 'The two passwords do not match.',
  changed: 'Password changed. Use the new one next time you sign in.',
  failed: 'Could not change your password. Try again.',
  same: 'That is already your password. Pick a new one.',
  weak: 'That password is too easy to guess. Pick a longer one.',
  leaked: 'That password has shown up in a data leak. Pick a different one.',
  characters: 'Use a mix of lowercase and uppercase letters, numbers and symbols.',
  reauth: 'For your security, sign out and sign in again, then change your password.',
} as const;

/** Inline errors for the change password form, keyed by field. */
export type PasswordErrors = { password?: string; confirm?: string };

/** Characters as people count them (an emoji is one), not UTF-16 units. */
export function passwordLength(value: string): number {
  return Array.from(value).length;
}

/** The form check before anything is sent: 8 or more characters, and both fields the same. */
export function validateNewPassword(password: string, confirm: string): PasswordErrors {
  const errors: PasswordErrors = {};
  if (passwordLength(password) < PASSWORD_MIN) errors.password = PASSWORD_COPY.tooShort;
  if (confirm !== password) errors.confirm = PASSWORD_COPY.mismatch;
  return errors;
}

export function hasPasswordErrors(errors: PasswordErrors): boolean {
  return errors.password !== undefined || errors.confirm !== undefined;
}

/** The parts of a Supabase AuthError this screen reads. */
export type AuthErrorLike = {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
  /** AuthWeakPasswordError: why the password was refused. */
  reasons?: readonly string[];
};

/** Plain words for a refused password change. Supabase's own messages are not shown. */
export function passwordErrorMessage(error: AuthErrorLike): string {
  const { code, name, status } = error;
  if (code === 'same_password') return PASSWORD_COPY.same;
  if (code === 'weak_password' || name === 'AuthWeakPasswordError') {
    const reasons = error.reasons ?? [];
    if (reasons.includes('pwned')) return PASSWORD_COPY.leaked;
    if (reasons.includes('characters')) return PASSWORD_COPY.characters;
    return PASSWORD_COPY.weak;
  }
  if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid') return PASSWORD_COPY.reauth;
  if (code === 'session_not_found' || code === 'session_expired' || name === 'AuthSessionMissingError') {
    return MESSAGES.sessionEnded;
  }
  if (code === 'over_request_rate_limit' || status === 429) return MESSAGES.rateLimited;
  if (name === 'AuthRetryableFetchError' || status === 0) return MESSAGES.network;
  return PASSWORD_COPY.failed;
}

export type ChangePasswordResult = { ok: true } | { ok: false; message: string };

const isSupabaseAuth = () => env.authMode === 'supabase' && isSupabaseConfigured();

/** Change the signed-in user's own password. Never throws: a refusal comes back as `message`. */
export async function changePassword(password: string): Promise<ChangePasswordResult> {
  if (passwordLength(password) < PASSWORD_MIN) return { ok: false, message: PASSWORD_COPY.tooShort };
  if (!connectivity.isOnline()) return { ok: false, message: MESSAGES.network };

  if (isSupabaseAuth()) {
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) return { ok: false, message: passwordErrorMessage(error) };
      return { ok: true };
    } catch {
      return { ok: false, message: MESSAGES.network };
    }
  }
  return changeMockPassword(password);
}

/** Mock sign-in: the password lives on the fixture account, like a real auth server's user. */
async function changeMockPassword(password: string): Promise<ChangePasswordResult> {
  const latency = 600 * mockControls.state.latencyScale;
  if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
  if (mockControls.state.offline) return { ok: false, message: MESSAGES.network };

  const session = mockAuth.getSession();
  if (!session) return { ok: false, message: MESSAGES.sessionEnded };
  const account = MOCK_ACCOUNTS.find((a) => a.id === session.userId);
  if (account) {
    if (account.password === password) return { ok: false, message: PASSWORD_COPY.same };
    account.password = password;
  }
  return { ok: true };
}
