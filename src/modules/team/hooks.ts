import { useQueryClient } from '@tanstack/react-query';

import { removeTeamMember, teamKeys, updateTeamMember, type TeamMemberPatch } from '@/api/endpoints/team';
import { ApiError } from '@/api/errors';
import type { Team, TeamMember } from '@/api/schemas/team';
import { notice } from '@/lib/notice';

import { removedMessage, withoutMember } from './logic';
import { replaceMember } from './staff';

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
      // Refused (the env owner, yourself, a role change): the list may be out of date, so check it again.
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      throw error;
    }
    drop(member.email);
    notice.ok(removedMessage(member));
  };
}

/**
 * PATCH /team/:email (change a role, pause or resume), then put the member
 * the server answers into the cached list and refetch it. Not optimistic:
 * a role or a pause changes what someone can get into. Someone already gone
 * (404) drops out of the list. A refusal refreshes the list, since it is
 * likely out of date; "Your role cannot do that." is shown here because
 * buttons leave 403s to the caller.
 */
export function useUpdateMember() {
  const queryClient = useQueryClient();

  return async (member: TeamMember, patch: TeamMemberPatch): Promise<TeamMember | null> => {
    let updated: TeamMember;
    try {
      updated = await updateTeamMember(member.email, patch);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        queryClient.setQueryData<Team>(teamKeys.list(), (old) => (old ? withoutMember(old, member.email) : old));
        void queryClient.invalidateQueries({ queryKey: teamKeys.all });
        notice.err(error.message);
        return null;
      }
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      if (error instanceof ApiError && error.status === 403 && error.code === 'forbidden') notice.err(error.message);
      throw error;
    }
    queryClient.setQueryData<Team>(teamKeys.list(), (old) => (old ? replaceMember(old, updated) : old));
    // The activity board shows roles and paused people too.
    void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    return updated;
  };
}
