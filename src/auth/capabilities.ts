import { MESSAGES } from '@/api/errors';
import type { Role } from '@/api/types';
import type { Tone } from '@/design/tokens';

/**
 * Who may do what (owner decision 2026-10-03). Pure data and functions, safe
 * to import anywhere (deep links, the mock API, tests). React hooks live in
 * src/auth/permissions.ts, which re-exports everything here.
 *
 * The server sends the signed-in person's list in GET /me as `capabilities`.
 * The app shows and hides everything from that list. When /me has no list
 * (an older server, or a profile cached before the list existed), the role's
 * row in this table is used instead. The names match the server's
 * lib/admin-api/permissions.ts exactly; the mock mirrors this table in
 * src/api/mock/permissions.ts and a test keeps the two in step.
 *
 * Owner: everything. Manager: everything except removing team members and
 * creating or promoting owners. Staff: leads and outreach, analytics,
 * onboarding help, view-only marketing, pricing and coupons, never money.
 */

const O: readonly Role[] = ['owner'];
const OM: readonly Role[] = ['owner', 'manager'];
const OMS: readonly Role[] = ['owner', 'manager', 'staff'];

/** Every capability and the roles that hold it by default. */
export const CAPABILITY_ROLES = {
  /* Home */
  'overview.view': OMS,
  /** Revenue, active subscriptions and recent subscriptions on Home. */
  'overview.revenue': OM,

  /* Inbox: which notification categories a role may read */
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

  /* Free tools */
  'tools.view': OMS,

  /* Subscriptions (the Customers segment: orders and Stripe subscriptions) */
  'billing.view': OM,

  /* Clients */
  'clients.view': OMS,
  /** The billing card and amounts on a client. */
  'clients.billing': OM,
  'clients.create': OM,
  /** Account fields and guarantee terms. */
  'clients.edit': OM,
  'clients.go_live': OM,
  'clients.trash': OM,
  'clients.crm': OM,
  'clients.members': OM,
  /** Onboarding run controls: stage, dates, blocked, complete. */
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

  /** Test toggles, "Include test" and test rows. */
  'testdata.view': OM,

  /* Marketing: Blog */
  'blog.view': OMS,
  'blog.write': OM,
  'blog.trash': OM,

  /* Marketing: Email */
  'email.view': OMS,
  'email.campaigns.write': OM,
  'email.subscribers.view': OM,
  'email.subscribers.write': OM,

  /* Marketing: Links (copy, share and QR are part of viewing) */
  'links.view': OMS,
  'links.write': OM,

  /* Marketing: CRM sync */
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
  /** Add members. Managers may only add managers and staff. */
  'team.write': OM,
  /** Remove members. */
  'team.remove': O,
  /** Create or promote owners. */
  'team.owners': O,
  /**
   * Change a member's role. Managers switch people between manager and staff;
   * making or changing an owner also needs `team.owners`. Env owners are
   * locked and nobody changes their own role.
   */
  'team.role': OM,
  /** Pause or resume a member's access. Managers pause managers and staff, never owners. */
  'team.pause': OM,
  /** Everyone's activity scoreboard and credits. */
  'team.activity': OM,
  /** Your own activity and your own credit rows ("My activity"). */
  'activity.own': OMS,
  /** Every credit row on a client, and the default split (read). */
  'clients.credits.view': OM,
  /** Edit a client's credits. */
  'clients.credits.edit': OM,
  /** Set the default finder / booker split. */
  'commission.settings': O,
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITY_ROLES;

/** Every capability name, in table order. */
export const CAPABILITIES = Object.keys(CAPABILITY_ROLES) as Capability[];

export const ROLES: readonly Role[] = ['owner', 'manager', 'staff'];

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CAPABILITY_ROLES, value);
}

/** The fallback table: each role's capabilities when GET /me sends no list. */
export const ROLE_CAPABILITIES: Readonly<Record<Role, readonly Capability[]>> = {
  owner: CAPABILITIES.filter((c) => CAPABILITY_ROLES[c].includes('owner')),
  manager: CAPABILITIES.filter((c) => CAPABILITY_ROLES[c].includes('manager')),
  staff: CAPABILITIES.filter((c) => CAPABILITY_ROLES[c].includes('staff')),
};

/** Whether only owners hold this capability by default (decides the 403 copy). */
export function isOwnerOnlyCapability(cap: Capability): boolean {
  const roles: readonly Role[] = CAPABILITY_ROLES[cap];
  return roles.length === 1 && roles[0] === 'owner';
}

/** The server's 403 copy for a capability someone lacks. */
export const FORBIDDEN_MESSAGE = 'Your role cannot do that.';

/**
 * What to tell someone who lacks these capabilities: "That section is owner
 * only." when only owners hold every one of them, else "Your role cannot do that."
 */
export function deniedMessage(...caps: Capability[]): string {
  return caps.length > 0 && caps.every(isOwnerOnlyCapability) ? MESSAGES.ownerOnly : FORBIDDEN_MESSAGE;
}

/* ---------- who holds what ---------- */

/** GET /me, or the part of it that decides what someone may do. */
export type CapabilitySource = { role: Role; capabilities?: readonly string[] | null };

/**
 * Anything that says what someone may do: a profile from GET /me, a
 * capability list, or a bare role (its fallback row). null: nobody, no rights.
 */
export type CapabilityHolder = CapabilitySource | readonly string[] | Role | null | undefined;

const EMPTY: readonly Capability[] = [];
const listCache = new WeakMap<object, readonly Capability[]>();
const setCache = new WeakMap<readonly Capability[], ReadonlySet<Capability>>();

function known(list: readonly string[]): readonly Capability[] {
  return list.filter(isCapability);
}

function roleRow(role: unknown): readonly Capability[] {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_CAPABILITIES, role)
    ? ROLE_CAPABILITIES[role as Role]
    : EMPTY;
}

/**
 * The capabilities someone holds. The server's list wins (names this app
 * does not know are dropped); without one, the role's fallback row. An
 * unknown role or nobody holds nothing. The result is cached per object, so
 * it is stable for the same profile (safe as a store selector).
 */
export function capabilitiesOf(holder: CapabilityHolder): readonly Capability[] {
  if (holder === null || holder === undefined) return EMPTY;
  if (typeof holder === 'string') return roleRow(holder);
  const cached = listCache.get(holder);
  if (cached) return cached;
  let list: readonly Capability[];
  if (Array.isArray(holder)) list = known(holder as readonly string[]);
  else {
    const source = holder as CapabilitySource;
    list = Array.isArray(source.capabilities) ? known(source.capabilities) : roleRow(source.role);
  }
  listCache.set(holder, list);
  return list;
}

function setOf(holder: CapabilityHolder): ReadonlySet<Capability> {
  const list = capabilitiesOf(holder);
  let set = setCache.get(list);
  if (!set) {
    set = new Set(list);
    setCache.set(list, set);
  }
  return set;
}

/** Whether someone holds a capability. */
export function can(holder: CapabilityHolder, cap: Capability): boolean {
  return setOf(holder).has(cap);
}

/** Whether someone holds at least one of the capabilities (none listed: false). */
export function canAny(holder: CapabilityHolder, ...caps: Capability[]): boolean {
  const set = setOf(holder);
  return caps.some((c) => set.has(c));
}

/** Whether someone holds every one of the capabilities (none listed: true). */
export function canAll(holder: CapabilityHolder, ...caps: Capability[]): boolean {
  const set = setOf(holder);
  return caps.every((c) => set.has(c));
}

/* ---------- role copy ---------- */

/**
 * Role names, badge tones and the Team add-sheet help (owner decision
 * 2026-10-03): Owner gold, Manager neutral, Staff muted. GET /meta
 * `teamRoles` wins where the server sends it; this is the fallback.
 */
export const ROLE_COPY: Readonly<Record<Role, { label: string; tone: Tone; help: string }>> = {
  owner: { label: 'Owner', tone: 'gold', help: 'Full access, can manage the team.' },
  manager: { label: 'Manager', tone: 'neutral', help: 'Everything except removing team members or making owners.' },
  staff: {
    label: 'Staff',
    tone: 'muted',
    help: 'Leads and outreach, analytics and onboarding help. Marketing, pricing and coupons are view only. No money.',
  },
};

/** A role's label, badge tone and help line. An unknown role reads as Staff, the narrowest. */
export function roleCopy(role: Role | null | undefined): { label: string; tone: Tone; help: string } {
  return role && Object.prototype.hasOwnProperty.call(ROLE_COPY, role) ? ROLE_COPY[role] : ROLE_COPY.staff;
}
