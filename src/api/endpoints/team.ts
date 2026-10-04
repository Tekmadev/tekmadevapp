import { queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import {
  zStaffActivity,
  zTeam,
  zTeamMember,
  zTeamRemoveResult,
  type ActivityRange,
  type StaffActivity,
  type Team,
  type TeamMember,
  type TeamRemoveResult,
} from '../schemas/team';
import type { Role } from '../types';

/**
 * Typed endpoints and query keys for the "team" domain (owners and managers),
 * plus staff management (the website's docs/admin-api/staff.md): changing a
 * role, pausing access, and the activity board. Adding someone creates their
 * sign-in account, so wait for the server (no optimistic rows), then share
 * the temporary password. Role and pause changes wait for the server too.
 */

export const teamKeys = {
  all: ['team'] as const,
  list: () => ['team', 'list'] as const,
  /** Everyone's scoreboard (`team.activity`). */
  activity: (range: ActivityRange) => ['team', 'activity', range] as const,
  /** "My activity" (`activity.own`): the caller's own row. */
  myActivity: (range: ActivityRange) => ['team', 'mine', range] as const,
};

export type NewTeamMemberInput = {
  name?: string | null;
  email: string;
  /** 8 characters or more. They change it after signing in. */
  tempPassword: string;
  role: Role;
};

/** PATCH /team/:email: only what is sent changes. */
export type TeamMemberPatch = {
  /** `team.role`; "owner" also needs `team.owners`. */
  role?: Role;
  /** `team.pause`: true pauses, false resumes. */
  paused?: boolean;
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function getTeam(signal?: AbortSignal) {
  return api.get<Team>('/team', { schema: zTeam, signal });
}

/** GET /team/activity: one row per team member (paused people too). Needs `team.activity`. */
export function getTeamActivity(range: ActivityRange, signal?: AbortSignal) {
  return api.get<StaffActivity>('/team/activity', { query: { range }, schema: zStaffActivity, signal });
}

/** GET /me/activity: exactly one row, the caller's. Needs `activity.own`. */
export function getMyActivity(range: ActivityRange, signal?: AbortSignal) {
  return api.get<StaffActivity>('/me/activity', { query: { range }, schema: zStaffActivity, signal });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Create once per intent: reuse the same idempotency key when retrying. */
export function addTeamMember(input: NewTeamMemberInput, idempotencyKey: string) {
  return api.post<TeamMember>('/team', input, { schema: zTeamMember, idempotencyKey });
}

/**
 * PATCH /team/:email { role?, paused? } -> the member as GET /team shows them.
 * 422 `locked` (an env owner), 422 `self` (your own role, pausing yourself),
 * 403 `owner_only` (an owner, or making one, without `team.owners`), 404 when
 * they left the team, 503 `not_configured` before the server's migration.
 */
export function updateTeamMember(email: string, patch: TeamMemberPatch) {
  return api.patch<TeamMember>(`/team/${seg(email)}`, patch, { schema: zTeamMember });
}

/** Also removes their client portal access, if any. Env owners answer 422 `owner`. */
export function removeTeamMember(email: string) {
  return api.delete<TeamRemoveResult>(`/team/${seg(email)}`, { schema: zTeamRemoveResult });
}

/* ------------------------------------------------------------------ */
/* Query options                                                       */
/* ------------------------------------------------------------------ */

export function teamQuery() {
  return queryOptions({
    queryKey: teamKeys.list(),
    queryFn: ({ signal }) => getTeam(signal),
  });
}

export function teamActivityQuery(range: ActivityRange) {
  return queryOptions({
    queryKey: teamKeys.activity(range),
    queryFn: ({ signal }) => getTeamActivity(range, signal),
  });
}

export function myActivityQuery(range: ActivityRange) {
  return queryOptions({
    queryKey: teamKeys.myActivity(range),
    queryFn: ({ signal }) => getMyActivity(range, signal),
  });
}

/** Either board, for a screen that shows one or the other: "team" (`team.activity`) or "mine" (`activity.own`). */
export function staffActivityQuery(scope: 'team' | 'mine', range: ActivityRange) {
  return queryOptions({
    queryKey: scope === 'team' ? teamKeys.activity(range) : teamKeys.myActivity(range),
    queryFn: ({ signal }) => (scope === 'team' ? getTeamActivity(range, signal) : getMyActivity(range, signal)),
  });
}
