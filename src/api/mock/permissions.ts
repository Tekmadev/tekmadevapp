import type { Capability } from '@/auth/capabilities';

import type { NotificationCategory } from '../schemas/notifications';
import type { Role } from '../types';
import { fail, type MockResult, type MockStaff } from './router';

/**
 * Who may do what, as the server decides it (its lib/admin-api/permissions.ts,
 * owner decision 2026-10-03). Written out separately from the app's table in
 * src/auth/capabilities.ts on purpose: the mock plays the server, and a test
 * checks the two tables agree. `satisfies` makes the compiler insist on every
 * capability name, and nothing else.
 *
 * Mock route handlers check a capability with `requireCap`:
 *
 *   const denied = requireCap(user, 'blog.write');
 *   if (denied) return denied;
 */

const O: readonly Role[] = ['owner'];
const OM: readonly Role[] = ['owner', 'manager'];
const OMS: readonly Role[] = ['owner', 'manager', 'staff'];

export const PERMISSIONS = {
  /* Home */
  'overview.view': OMS,
  'overview.revenue': OM,

  /* Inbox */
  'notifications.view': OMS,
  'inbox.leads': OMS,
  'inbox.clients': OMS,
  'inbox.sales': OM,
  'inbox.billing': OM,
  'inbox.system': OM,
  'inbox.audience': OM,
  'inbox.team': OM,

  /* Analytics and Ads */
  'analytics.view': OMS,
  'ads.view': OM,
  'ads.refresh': OM,

  /* Leads */
  'leads.view': OMS,
  'leads.create': OMS,
  'leads.update': OMS,
  'leads.outreach': OMS,
  'leads.convert': OMS,
  'leads.delete': OM,

  /* Free tools and Subscriptions */
  'tools.view': OMS,
  'billing.view': OM,

  /* Clients */
  'clients.view': OMS,
  'clients.billing': OM,
  'clients.create': OMS,
  'clients.edit': OM,
  'clients.go_live': OM,
  'clients.trash': OM,
  'clients.crm': OM,
  'clients.members': OM,
  'clients.onboarding': OM,
  'clients.tasks.create': OMS,
  'clients.tasks.status': OMS,
  'clients.intake.review': OM,
  'clients.access.request': OMS,
  'clients.access.update': OM,
  'clients.approvals.request': OMS,
  'clients.calls.log': OMS,
  'clients.calls.review': OM,
  'clients.activity.write': OMS,
  'clients.templates': OM,

  /* Demo requests */
  'demos.view': OMS,
  'demos.request': OMS,
  'demos.manage': OM,

  /* Test data */
  'testdata.view': OM,

  /* Marketing */
  'blog.view': OMS,
  'blog.write': OM,
  'blog.trash': OM,
  'email.view': OMS,
  'email.campaigns.write': OM,
  'email.subscribers.view': OM,
  'email.subscribers.write': OM,
  'links.view': OMS,
  'links.write': OM,
  'crm.view': OM,
  'crm.write': OM,

  /* Sales */
  'pricing.view': OMS,
  'pricing.write': OM,
  'coupons.view': OMS,
  'coupons.share': OMS,
  'coupons.write': OM,

  /* Settings */
  'loader.view': OM,
  'loader.write': OM,
  'testmode.view': OM,
  'testmode.write': OM,
  'team.view': OM,
  'team.write': OM,
  'team.remove': O,
  'team.owners': O,
  'team.role': OM,
  'team.pause': OM,
  'team.activity': OM,
  'activity.own': OMS,
  'clients.credits.view': OM,
  'clients.credits.edit': OM,
  'commission.settings': O,
} as const satisfies Record<Capability, readonly Role[]>;

type Who = Pick<MockStaff, 'role'> | Role;
const roleOf = (who: Who): Role => (typeof who === 'string' ? who : who.role);

/** Whether a caller (or a role) holds a capability. */
export function mockCan(who: Who, cap: Capability): boolean {
  const roles: readonly Role[] = PERMISSIONS[cap];
  return roles.includes(roleOf(who));
}

/** Every capability a caller holds, in table order (GET /me `capabilities`). */
export function capabilitiesFor(who: Who): Capability[] {
  return (Object.keys(PERMISSIONS) as Capability[]).filter((cap) => mockCan(who, cap));
}

/** Whether only owners hold a capability (decides the 403 copy). */
export function isOwnerOnly(cap: Capability): boolean {
  const roles: readonly Role[] = PERMISSIONS[cap];
  return roles.length === 1 && roles[0] === 'owner';
}

/**
 * The server's 403 for a capability the caller lacks: owner-only ones answer
 * `owner_only` "That section is owner only.", anything else `forbidden`
 * "Your role cannot do that.".
 */
export function forbidden(cap: Capability): MockResult {
  return isOwnerOnly(cap)
    ? fail(403, 'owner_only', 'That section is owner only.')
    : fail(403, 'forbidden', 'Your role cannot do that.');
}

/** The 403 when the caller lacks the capability, else null (go ahead). */
export function requireCap(who: Who, cap: Capability): MockResult | null {
  return mockCan(who, cap) ? null : forbidden(cap);
}

/** The 403 unless the caller holds every one of the capabilities, else null. */
export function requireCaps(who: Who, ...caps: Capability[]): MockResult | null {
  const missing = caps.find((cap) => !mockCan(who, cap));
  return missing ? forbidden(missing) : null;
}

/** The 403 unless the caller holds at least one of the capabilities, else null. */
export function requireAnyCap(who: Who, ...caps: Capability[]): MockResult | null {
  if (caps.length === 0 || caps.some((cap) => mockCan(who, cap))) return null;
  return forbidden(caps[0]);
}

const INBOX_CATEGORIES: readonly NotificationCategory[] = ['leads', 'sales', 'billing', 'clients', 'audience', 'team', 'system'];

/** The notification categories a caller may read (`inbox.<category>`; owners and managers: all seven). */
export function inboxCategories(who: Who): NotificationCategory[] {
  return INBOX_CATEGORIES.filter((category) => mockCan(who, `inbox.${category}`));
}
