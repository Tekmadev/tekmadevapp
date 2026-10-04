import { RequireCapability } from '@/auth/RequireCapability';

import { ActivityBoard } from './ActivityBoard';

/**
 * My activity (`activity.own`): the signed-in person's own scoreboard and
 * every credit row they hold on clients won in the range. Nobody else's
 * numbers, and never money. Opened from More (under the profile card) and Profile.
 */
export function MyActivityScreen() {
  return (
    <RequireCapability cap="activity.own">
      <ActivityBoard mode="mine" />
    </RequireCapability>
  );
}
