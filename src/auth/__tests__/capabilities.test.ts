import {
  CAPABILITIES,
  CAPABILITY_ROLES,
  can,
  canAll,
  canAny,
  capabilitiesOf,
  deniedMessage,
  isCapability,
  isOwnerOnlyCapability,
  ROLE_CAPABILITIES,
  roleCopy,
  type Capability,
} from '@/auth/capabilities';

/**
 * The permission table (owner decision 2026-10-03), written out here by hand so
 * a slip in the table shows up as a failing test rather than a hidden screen.
 */

/** Exactly what staff may do: leads and outreach, analytics, onboarding help, view-only marketing and sales. */
const STAFF: Capability[] = [
  'overview.view',
  'notifications.view',
  'inbox.leads',
  'inbox.clients',
  'analytics.view',
  'leads.view',
  'leads.create',
  'leads.update',
  'leads.outreach',
  'leads.convert',
  'tools.view',
  'clients.view',
  'clients.tasks.create',
  'clients.tasks.status',
  'clients.access.request',
  'clients.approvals.request',
  'clients.calls.log',
  'clients.activity.write',
  'blog.view',
  'email.view',
  'links.view',
  'pricing.view',
  'coupons.view',
  'coupons.share',
  'activity.own',
];

/** What only owners may do: remove team members, create or promote owners, set the default commission split. */
const OWNER_ONLY: Capability[] = ['team.remove', 'team.owners', 'commission.settings'];

/** Money never reaches staff. */
const MONEY: Capability[] = ['overview.revenue', 'billing.view', 'clients.billing', 'inbox.billing', 'inbox.sales', 'pricing.write', 'coupons.write'];

describe('the table', () => {
  it('has the 72 capability names the server uses, each once', () => {
    expect(CAPABILITIES).toHaveLength(72);
    expect(new Set(CAPABILITIES).size).toBe(72);
    for (const cap of CAPABILITIES) expect(cap).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
  });

  it('gives owners everything', () => {
    expect(ROLE_CAPABILITIES.owner).toEqual(CAPABILITIES);
  });

  it('gives managers everything except removing members, making owners and setting the commission split', () => {
    expect(ROLE_CAPABILITIES.manager).toEqual(CAPABILITIES.filter((c) => !OWNER_ONLY.includes(c)));
  });

  it('gives staff exactly their list', () => {
    expect([...ROLE_CAPABILITIES.staff].sort()).toEqual([...STAFF].sort());
  });

  it('never gives staff money, writes to marketing or sales, settings, or test data', () => {
    for (const cap of [...MONEY, 'blog.write', 'email.campaigns.write', 'links.write', 'crm.view', 'loader.view', 'testmode.view', 'team.view', 'testdata.view', 'team.role', 'team.pause', 'team.activity', 'clients.credits.view', 'clients.credits.edit'] as Capability[]) {
      expect(can('staff', cap)).toBe(false);
    }
  });

  it('only owners hold the owner-only ones', () => {
    expect(CAPABILITIES.filter(isOwnerOnlyCapability)).toEqual(OWNER_ONLY);
    for (const cap of CAPABILITIES) expect(CAPABILITY_ROLES[cap]).toContain('owner');
  });

  it('nests the roles: staff within manager within owner', () => {
    for (const cap of ROLE_CAPABILITIES.staff) expect(ROLE_CAPABILITIES.manager).toContain(cap);
    for (const cap of ROLE_CAPABILITIES.manager) expect(ROLE_CAPABILITIES.owner).toContain(cap);
  });
});

describe('capabilitiesOf', () => {
  it("uses the server's list when /me sends one", () => {
    expect(capabilitiesOf({ role: 'owner', capabilities: ['leads.view'] })).toEqual(['leads.view']);
    expect(capabilitiesOf({ role: 'staff', capabilities: ['team.view', 'leads.view'] })).toEqual(['team.view', 'leads.view']);
  });

  it('treats an empty list as nothing at all (not as "use the role")', () => {
    expect(capabilitiesOf({ role: 'owner', capabilities: [] })).toEqual([]);
  });

  it("falls back to the role's row when /me has no list", () => {
    expect(capabilitiesOf({ role: 'owner' })).toEqual(ROLE_CAPABILITIES.owner);
    expect(capabilitiesOf({ role: 'manager', capabilities: undefined })).toEqual(ROLE_CAPABILITIES.manager);
    expect(capabilitiesOf({ role: 'staff', capabilities: null })).toEqual(ROLE_CAPABILITIES.staff);
  });

  it('drops names this app does not know', () => {
    expect(capabilitiesOf({ role: 'staff', capabilities: ['leads.view', 'robots.launch', 'LEADS.VIEW', ''] })).toEqual(['leads.view']);
    expect(capabilitiesOf(['coupons.share', 'nope'])).toEqual(['coupons.share']);
  });

  it('takes a bare role or a list', () => {
    expect(capabilitiesOf('staff')).toEqual(ROLE_CAPABILITIES.staff);
    expect(capabilitiesOf(['team.view'])).toEqual(['team.view']);
  });

  it('gives nobody (and an unknown role) nothing', () => {
    expect(capabilitiesOf(null)).toEqual([]);
    expect(capabilitiesOf(undefined)).toEqual([]);
    expect(capabilitiesOf({ role: 'admin' as unknown as 'owner' })).toEqual([]);
    expect(capabilitiesOf('admin' as unknown as 'owner')).toEqual([]);
  });

  it('answers the same array for the same profile (a stable store selector)', () => {
    const me = { role: 'staff' as const, capabilities: ['leads.view', 'tools.view'] };
    expect(capabilitiesOf(me)).toBe(capabilitiesOf(me));
    expect(capabilitiesOf({ role: 'manager' })).toBe(ROLE_CAPABILITIES.manager);
  });
});

describe('can, canAny, canAll', () => {
  const staffMe = { role: 'staff' as const };
  const listed = { role: 'staff' as const, capabilities: ['leads.view', 'team.view'] };

  it('checks one capability', () => {
    expect(can(staffMe, 'leads.view')).toBe(true);
    expect(can(staffMe, 'team.view')).toBe(false);
    expect(can(listed, 'team.view')).toBe(true);
    expect(can(listed, 'tools.view')).toBe(false);
    expect(can(null, 'overview.view')).toBe(false);
    expect(can('manager', 'team.write')).toBe(true);
    expect(can('manager', 'team.remove')).toBe(false);
  });

  it('checks any of several', () => {
    expect(canAny(staffMe, 'billing.view', 'leads.view')).toBe(true);
    expect(canAny(staffMe, 'billing.view', 'clients.billing')).toBe(false);
    expect(canAny(staffMe)).toBe(false);
  });

  it('checks all of several', () => {
    expect(canAll('owner', 'team.remove', 'team.owners')).toBe(true);
    expect(canAll('manager', 'team.write', 'team.remove')).toBe(false);
    expect(canAll(staffMe)).toBe(true);
  });
});

describe('copy', () => {
  it('uses the owner-only line only when only owners could', () => {
    expect(deniedMessage('team.remove')).toBe('That section is owner only.');
    expect(deniedMessage('team.remove', 'team.owners')).toBe('That section is owner only.');
    expect(deniedMessage('billing.view')).toBe('Your role cannot do that.');
    expect(deniedMessage('team.remove', 'billing.view')).toBe('Your role cannot do that.');
    expect(deniedMessage()).toBe('Your role cannot do that.');
  });

  it('labels and tones each role: Owner gold, Manager neutral, Staff muted', () => {
    expect(roleCopy('owner')).toMatchObject({ label: 'Owner', tone: 'gold', help: 'Full access, can manage the team.' });
    expect(roleCopy('manager')).toMatchObject({
      label: 'Manager',
      tone: 'neutral',
      help: 'Everything except removing team members or making owners.',
    });
    expect(roleCopy('staff')).toMatchObject({
      label: 'Staff',
      tone: 'muted',
      help: 'Leads and outreach, analytics and onboarding help. Marketing, pricing and coupons are view only. No money.',
    });
    expect(roleCopy(null).label).toBe('Staff');
  });

  it('recognises capability names', () => {
    expect(isCapability('coupons.share')).toBe(true);
    expect(isCapability('coupons')).toBe(false);
    expect(isCapability(42)).toBe(false);
  });
});
