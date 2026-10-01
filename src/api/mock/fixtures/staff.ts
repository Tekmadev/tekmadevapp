import { env } from '@/lib/env';

import type { MockStaff } from '../router';

/**
 * Mock staff accounts (test values for the mock adapter only; they do not exist
 * on any real server). Sign in with these when EXPO_PUBLIC_AUTH_MODE=mock.
 *
 *   Owner:   owner@tekmadev.test   / tekmadev-owner
 *   Manager: manager@tekmadev.test / tekmadev-manager
 *   Not staff (portal client): client@acmeplumbing.test / tekmadev-client
 */
export type MockAccount = MockStaff & { password: string; lastSignInAt: string | null; addedAt: string };

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: 'usr_owner01',
    email: 'owner@tekmadev.test',
    name: 'Shajeed I.',
    role: 'owner',
    locked: true,
    password: 'tekmadev-owner',
    lastSignInAt: null,
    addedAt: '2025-11-03T15:12:44.513220Z',
  },
  {
    id: 'usr_mgr01',
    email: 'manager@tekmadev.test',
    name: 'Maya Chen',
    role: 'manager',
    locked: false,
    password: 'tekmadev-manager',
    lastSignInAt: null,
    addedAt: '2026-02-17T14:40:09.002114Z',
  },
];

/** A client portal user: valid credentials, but GET /me answers 403. */
export const MOCK_PORTAL_USER = {
  id: 'usr_client01',
  email: 'client@acmeplumbing.test',
  password: 'tekmadev-client',
};

export function findStaffByEmail(email: string): MockStaff | undefined {
  const needle = email.trim().toLowerCase();
  const account = MOCK_ACCOUNTS.find((a) => a.email === needle);
  if (account) return account;
  if (env.mockOwnerEmails.includes(needle)) {
    return { id: `usr_${needle.replace(/[^a-z0-9]/g, '').slice(0, 10)}`, email: needle, name: null, role: 'owner', locked: false };
  }
  return undefined;
}

export function findStaffById(id: string): MockStaff | undefined {
  return MOCK_ACCOUNTS.find((a) => a.id === id);
}
