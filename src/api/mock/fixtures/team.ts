import type { TeamMeta } from '../../schemas/team';
import { hoursAgo, minutesAgo } from '../router';

/**
 * Fixtures for the "team" domain. The team IS the mock staff list
 * (MOCK_ACCOUNTS in staff.ts, which also seeds the second manager), so adding
 * someone here lets them sign in with their temporary password, and removing
 * them signs them out for good.
 */

/**
 * Last sign-ins for the seeded accounts. staff.ts leaves `lastSignInAt` null
 * and mock sign-in does not record it, so the Team list reads these instead.
 */
export const SEEDED_SIGN_INS: Record<string, string> = {
  usr_owner01: minutesAgo(14),
  usr_mgr01: hoursAgo(26),
};

/** When an env owner who is not a fixture account (EXPO_PUBLIC_MOCK_OWNER_EMAILS) was "added". */
export const ENV_OWNER_ADDED_AT = '2025-11-03T15:12:44.513220Z';

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture: TeamMeta = {
  teamRoles: [
    {
      value: 'manager',
      label: 'Manager',
      help: 'Works on Overview, Inbox, Analytics, Leads, Free tools, Clients and Subscriptions',
      tone: 'neutral',
    },
    { value: 'owner', label: 'Owner', help: 'Full access, can manage the team', tone: 'gold' },
  ],
};
