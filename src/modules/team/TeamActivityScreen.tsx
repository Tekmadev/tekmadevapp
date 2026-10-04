import { RequireCapability } from '@/auth/RequireCapability';

import { ActivityBoard } from './ActivityBoard';

/**
 * Team activity (`team.activity`, owners and managers): one card per team
 * member with leads found, touches, follow-ups, calls booked, clients won and
 * clients helped for 7 days, 30 days or all time. Opened from Team.
 */
export function TeamActivityScreen() {
  return (
    <RequireCapability cap="team.activity">
      <ActivityBoard mode="team" />
    </RequireCapability>
  );
}
