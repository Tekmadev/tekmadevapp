import { useQuery, useQueryClient } from '@tanstack/react-query';

import { removeTeamMember, teamKeys } from '@/api/endpoints/team';
import { ApiError } from '@/api/errors';
import type { Team, TeamMember } from '@/api/schemas/team';
import { notice } from '@/lib/notice';
import { metaQuery } from '@/modules/overview/hooks';

import { removedMessage, teamRoles, withoutMember } from './logic';

/** Role labels, tones and help lines from GET /meta (cached app-wide), with the brief's words as a fallback. */
export function useTeamRoles() {
  const { data } = useQuery(metaQuery());
  return teamRoles(data?.teamRoles);
}

/**
 * DELETE /team/:email, then drop the row from the cached list and refetch it
 * (what the web admin's Team page does). Not optimistic: removing someone
 * takes away their sign-in, so the row stays until the server confirms.
 * Someone already removed elsewhere (404) just disappears from the list.
 */
export function useRemoveMember() {
  const queryClient = useQueryClient();

  const drop = (email: string) => {
    queryClient.setQueryData<Team>(teamKeys.list(), (old) => (old ? withoutMember(old, email) : old));
    void queryClient.invalidateQueries({ queryKey: teamKeys.all });
  };

  return async (member: TeamMember) => {
    try {
      await removeTeamMember(member.email);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        drop(member.email);
        notice.err(error.message);
        return;
      }
      // Refused (the env owner, yourself): the list may be out of date, so check it again.
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      throw error;
    }
    drop(member.email);
    notice.ok(removedMessage(member));
  };
}
