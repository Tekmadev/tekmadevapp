import { env } from '@/lib/env';

import type { ActivityRange, StaffActivity, Team, TeamMember, TeamRemoveResult } from '../../schemas/team';
import type { Role } from '../../types';
import { recordNotificationEvent } from '../fixtures/notifications';
import { MOCK_ACCOUNTS, type MockAccount } from '../fixtures/staff';
import { ACTIVITY_RANGES, RANGE_MESSAGE, staffActivity } from '../fixtures/staffActivity';
import { ENV_OWNER_ADDED_AT, SEEDED_SIGN_INS } from '../fixtures/team';
import { forbidden, mockCan, requireAnyCap, requireCap } from '../permissions';
import { fail, isEmail, mockId, notFound, nowIso, ok, str, type MockContext, type MockResult, type MockRoute } from '../router';
import { staffName } from './session';

/**
 * Mock routes for the "team" domain (owner decision 2026-10-03): the list
 * needs `team.view` and adding `team.write` (owners and managers); making an
 * owner also needs `team.owners` and removing needs `team.remove` (owners
 * only: a manager gets 403 `owner_only`). Env owners are never removed (422
 * `owner`, like the server). The team is the mock staff list itself, so a
 * member added here can sign in with the temporary password, and a removed
 * member's next request answers 401.
 *
 * Staff management (the website's docs/admin-api/staff.md): PATCH
 * /team/:email changes a role (`team.role`) or pauses and resumes access
 * (`team.pause`) by the server's rules, in the server's order; a paused
 * member's every request answers 403 `paused` (src/api/mock/index.ts). GET
 * /team/activity (`team.activity`) and GET /me/activity (`activity.own`) are
 * the activity board (fixtures/staffActivity.ts).
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
  const paused = !!account.pausedAt;
  const pausedBy = paused && account.pausedBy ? MOCK_ACCOUNTS.find((a) => a.email === account.pausedBy) : undefined;
  return {
    email: account.email,
    name: account.name,
    role: account.role,
    lastSignInAt: account.lastSignInAt ?? SEEDED_SIGN_INS[account.id] ?? null,
    addedAt: account.addedAt,
    envOwner: isEnvOwner(account),
    paused,
    pausedAt: paused ? (account.pausedAt ?? null) : null,
    pausedBy: paused && account.pausedBy ? { email: account.pausedBy, name: pausedBy?.name ?? null } : null,
  };
}

/** Env owners who are not fixture accounts (real Supabase owners in mock API mode). */
function extraEnvOwners(): TeamMember[] {
  return env.mockOwnerEmails
    .filter((email) => !MOCK_ACCOUNTS.some((a) => a.email === email))
    .map((email) => ({
      email,
      name: null,
      role: 'owner',
      lastSignInAt: null,
      addedAt: ENV_OWNER_ADDED_AT,
      envOwner: true,
      paused: false,
      pausedAt: null,
      pausedBy: null,
    }));
}

/** Env owners, then other owners, managers, then staff; oldest first inside each group. */
function teamList(): Team {
  const rank = (m: TeamMember) => (m.envOwner ? 0 : RANK[m.role]);
  return [...extraEnvOwners(), ...MOCK_ACCOUNTS.map(present)].sort(
    (a, b) => rank(a) - rank(b) || a.addedAt.localeCompare(b.addedAt),
  );
}

type FieldError = { code: string; message: string; field: string };

/** The server's copy for PATCH /team/:email (lib/admin-users.ts TEAM_MESSAGES and the route). */
const PATCH_MESSAGES = {
  role: 'Pick Owner, Manager or Staff.',
  paused: 'Send paused as true or false.',
  locked: 'This owner is locked. Nobody can change their role or pause them.',
  selfRole: 'You cannot change your own role.',
  selfPause: 'You cannot pause yourself.',
  ownerOnly: 'That section is owner only.',
} as const;

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', staff: 'Staff' };

/**
 * PATCH /team/:email, first match wins (docs/admin-api/staff.md section 2):
 * the body, the caller's capabilities, making an owner, a locked env owner,
 * not on the team, yourself, then an owner target without `team.owners`.
 */
function patchMember(ctx: MockContext): MockResult {
  const { body, params, user } = ctx;
  const sendsRole = body.role !== undefined;
  const sendsPaused = body.paused !== undefined;
  if (sendsRole && !isRole(body.role)) return fail(400, 'role', PATCH_MESSAGES.role, { role: PATCH_MESSAGES.role });
  if (sendsPaused && typeof body.paused !== 'boolean') return fail(400, 'paused', PATCH_MESSAGES.paused, { paused: PATCH_MESSAGES.paused });
  const role = isRole(body.role) ? body.role : undefined;
  const paused = typeof body.paused === 'boolean' ? body.paused : undefined;

  const email = params.email.trim().toLowerCase();
  const account = MOCK_ACCOUNTS.find((a) => a.email === email);
  const missing = () => notFound('That team member');
  // A body with neither key changes nothing and answers the member.
  if (role === undefined && paused === undefined) {
    if (env.mockOwnerEmails.includes(email) && !account) return ok<TeamMember>(teamList().find((m) => m.email === email) as TeamMember);
    return account ? ok<TeamMember>(present(account)) : missing();
  }

  if (role !== undefined && !mockCan(user, 'team.role')) return forbidden('team.role');
  if (paused !== undefined && !mockCan(user, 'team.pause')) return forbidden('team.pause');
  if (role === 'owner' && !mockCan(user, 'team.owners')) return fail(403, 'owner_only', PATCH_MESSAGES.ownerOnly);
  if (env.mockOwnerEmails.includes(email) || (account && isEnvOwner(account))) return fail(422, 'locked', PATCH_MESSAGES.locked);
  if (!account) return missing();
  if (account.id === user.id || email === user.email.toLowerCase()) {
    return fail(422, 'self', role !== undefined ? PATCH_MESSAGES.selfRole : PATCH_MESSAGES.selfPause);
  }
  if (account.role === 'owner' && !mockCan(user, 'team.owners')) return fail(403, 'owner_only', PATCH_MESSAGES.ownerOnly);

  const actor = staffName(user) ?? user.email;
  const target = account.email;
  if (role !== undefined && role !== account.role) {
    const from = account.role;
    account.role = role;
    recordNotificationEvent({
      event_key: 'team.admin_role_changed',
      title: `${target} is now ${ROLE_LABEL[role]}`,
      body: `Was ${ROLE_LABEL[from]}. Changed by ${user.email}`,
      action_url: '/admin/team',
      entity_type: 'admin',
      entity_id: `${target}:role:${nowIso()}`,
      actor_type: 'staff',
      actor_label: actor,
      data: { email: target, from, to: role },
    });
  }
  // Pausing again keeps the first pausedAt; resuming someone not paused changes nothing.
  if (paused === true && !account.pausedAt) {
    account.pausedAt = nowIso();
    account.pausedBy = user.email.toLowerCase();
  } else if (paused === false && account.pausedAt) {
    account.pausedAt = null;
    account.pausedBy = null;
  } else {
    return ok<TeamMember>(present(account));
  }
  recordNotificationEvent({
    event_key: account.pausedAt ? 'team.admin_paused' : 'team.admin_resumed',
    title: account.pausedAt ? `${target}'s access is paused` : `${target}'s access is back`,
    body: account.pausedAt ? `Paused by ${user.email}` : `Resumed by ${user.email}`,
    action_url: '/admin/team',
    entity_type: 'admin',
    entity_id: `${target}:pause:${nowIso()}`,
    actor_type: 'staff',
    actor_label: actor,
    data: { email: target, paused: !!account.pausedAt },
  });
  return ok<TeamMember>(present(account));
}

/** `?range=7d|30d|all`, 7d when absent or empty; 400 `range` otherwise. */
function rangeOf(query: Record<string, string>): ActivityRange | MockResult {
  const raw = query.range === undefined || query.range === '' ? '7d' : query.range;
  const range = ACTIVITY_RANGES.find((r) => r === raw);
  return range ?? fail(400, 'range', RANGE_MESSAGE, { range: RANGE_MESSAGE });
}

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
    // Before /team/:email: the first matching pattern wins.
    method: 'GET',
    path: '/team/activity',
    latency: 'normal',
    handler: ({ query, user }) => {
      const denied = requireCap(user, 'team.activity');
      if (denied) return denied;
      const range = rangeOf(query);
      if (typeof range !== 'string') return range;
      const people = teamList().map((m) => ({ email: m.email, name: m.name, role: m.role, paused: m.paused ?? false }));
      return ok<StaffActivity>(staffActivity(people, range));
    },
  },
  {
    method: 'GET',
    path: '/me/activity',
    latency: 'normal',
    handler: ({ query, user }) => {
      const denied = requireCap(user, 'activity.own');
      if (denied) return denied;
      const range = rangeOf(query);
      if (typeof range !== 'string') return range;
      return ok<StaffActivity>(staffActivity([{ email: user.email, name: staffName(user), role: user.role, paused: false }], range));
    },
  },
  {
    method: 'PATCH',
    path: '/team/:email',
    latency: 'normal',
    handler: (ctx) => {
      // Staff hold neither: 403 `forbidden`.
      const denied = requireAnyCap(ctx.user, 'team.role', 'team.pause');
      if (denied) return denied;
      return patchMember(ctx);
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
