import { env } from '@/lib/env';

import type { Team, TeamMember, TeamRemoveResult } from '../../schemas/team';
import type { Role } from '../../types';
import { MOCK_ACCOUNTS, type MockAccount } from '../fixtures/staff';
import { ENV_OWNER_ADDED_AT, SEEDED_SIGN_INS } from '../fixtures/team';
import { requireCap } from '../permissions';
import { fail, isEmail, mockId, notFound, nowIso, ok, str, type MockRoute } from '../router';

/**
 * Mock routes for the "team" domain (owner decision 2026-10-03): the list
 * needs `team.view` and adding `team.write` (owners and managers); making an
 * owner also needs `team.owners` and removing needs `team.remove` (owners
 * only: a manager gets 403 `owner_only`). Env owners are never removed (422
 * `owner`, like the server). The team is the mock staff list itself, so a
 * member added here can sign in with the temporary password, and a removed
 * member's next request answers 401.
 */

const NAME_MAX = 80;
const PASSWORD_MIN = 8;
const ROLES: readonly Role[] = ['owner', 'manager', 'staff'];
const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);
/** The server's order: env owners first, then owners, managers and staff. */
const RANK: Record<Role, number> = { owner: 1, manager: 2, staff: 3 };

/** Owners set by the server environment: the fixture owner, plus EXPO_PUBLIC_MOCK_OWNER_EMAILS. */
const isEnvOwner = (account: MockAccount) => account.role === 'owner' && account.locked;

function present(account: MockAccount): TeamMember {
  return {
    email: account.email,
    name: account.name,
    role: account.role,
    lastSignInAt: account.lastSignInAt ?? SEEDED_SIGN_INS[account.id] ?? null,
    addedAt: account.addedAt,
    envOwner: isEnvOwner(account),
  };
}

/** Env owners who are not fixture accounts (real Supabase owners in mock API mode). */
function extraEnvOwners(): TeamMember[] {
  return env.mockOwnerEmails
    .filter((email) => !MOCK_ACCOUNTS.some((a) => a.email === email))
    .map((email) => ({ email, name: null, role: 'owner', lastSignInAt: null, addedAt: ENV_OWNER_ADDED_AT, envOwner: true }));
}

/** Env owners, then other owners, managers, then staff; oldest first inside each group. */
function teamList(): Team {
  const rank = (m: TeamMember) => (m.envOwner ? 0 : RANK[m.role]);
  return [...extraEnvOwners(), ...MOCK_ACCOUNTS.map(present)].sort(
    (a, b) => rank(a) - rank(b) || a.addedAt.localeCompare(b.addedAt),
  );
}

type FieldError = { code: string; message: string; field: string };

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/team',
    latency: 'fast',
    handler: ({ user }) => requireCap(user, 'team.view') ?? ok<Team>(teamList()),
  },
  {
    method: 'POST',
    path: '/team',
    // Creates a sign-in account on the auth server.
    latency: 'slow',
    handler: ({ body, user }) => {
      const denied = requireCap(user, 'team.write');
      if (denied) return denied;
      // Managers add managers and staff; only an owner makes an owner.
      if (body.role === 'owner') {
        const notOwner = requireCap(user, 'team.owners');
        if (notOwner) return notOwner;
      }

      const errors: FieldError[] = [];

      let name: string | null = null;
      if (body.name !== undefined && body.name !== null) {
        const raw = str(body.name)?.trim();
        if (raw === undefined || raw.length > NAME_MAX) {
          errors.push({ code: 'name', message: `Keep the name to ${NAME_MAX} characters or fewer.`, field: 'name' });
        } else name = raw || null;
      }

      const email = str(body.email)?.trim().toLowerCase() ?? '';
      if (!isEmail(email)) errors.push({ code: 'email', message: 'Enter a valid email.', field: 'email' });

      const password = str(body.tempPassword) ?? '';
      if (password.length < PASSWORD_MIN) {
        errors.push({
          code: 'password',
          message: `The temporary password must be at least ${PASSWORD_MIN} characters.`,
          field: 'tempPassword',
        });
      }

      const role = body.role;
      if (!isRole(role)) errors.push({ code: 'role', message: 'Pick Owner, Manager or Staff.', field: 'role' });

      if (errors.length > 0 || !isRole(role)) {
        const fields: Record<string, string> = {};
        for (const e of errors) fields[e.field] = e.message;
        const first = errors[0];
        return fail(400, first.code, first.message, fields);
      }

      const taken =
        MOCK_ACCOUNTS.some((a) => a.email === email) || env.mockOwnerEmails.includes(email);
      if (taken) {
        const message = 'That email is already on the team.';
        return fail(409, 'dupe', message, { email: message });
      }

      const account: MockAccount = {
        id: mockId('usr'),
        email,
        name,
        role,
        locked: false,
        password,
        lastSignInAt: null,
        addedAt: nowIso(),
      };
      MOCK_ACCOUNTS.push(account);
      return ok<TeamMember>(present(account), 201);
    },
  },
  {
    method: 'DELETE',
    path: '/team/:email',
    latency: 'normal',
    handler: ({ params, user }) => {
      // Owners only: a manager gets 403 `owner_only`, even for an env owner.
      const denied = requireCap(user, 'team.remove');
      if (denied) return denied;
      const email = params.email.trim().toLowerCase();
      if (env.mockOwnerEmails.includes(email)) return fail(422, 'owner', 'The owner cannot be removed.');
      const index = MOCK_ACCOUNTS.findIndex((a) => a.email === email);
      if (index < 0) return notFound('That team member');
      const account = MOCK_ACCOUNTS[index];
      if (isEnvOwner(account)) return fail(422, 'owner', 'The owner cannot be removed.');
      if (account.id === user.id) return fail(422, 'self', 'You cannot remove yourself. Ask another owner.');
      // The server also removes their client portal access, if any. The mock has none to remove.
      MOCK_ACCOUNTS.splice(index, 1);
      return ok<TeamRemoveResult>({ email, deleted: true });
    },
  },
];
