import { queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import { zTeam, zTeamMember, zTeamRemoveResult, type Team, type TeamMember, type TeamRemoveResult } from '../schemas/team';
import type { Role } from '../types';

/**
 * Typed endpoints and query keys for the "team" domain (owner only).
 * Adding someone creates their sign-in account, so wait for the server
 * (no optimistic rows), then share the temporary password.
 */

export const teamKeys = {
  all: ['team'] as const,
  list: () => ['team', 'list'] as const,
};

export type NewTeamMemberInput = {
  name?: string | null;
  email: string;
  /** 8 characters or more. They change it after signing in. */
  tempPassword: string;
  role: Role;
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function getTeam(signal?: AbortSignal) {
  return api.get<Team>('/team', { schema: zTeam, signal });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Create once per intent: reuse the same idempotency key when retrying. */
export function addTeamMember(input: NewTeamMemberInput, idempotencyKey: string) {
  return api.post<TeamMember>('/team', input, { schema: zTeamMember, idempotencyKey });
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
