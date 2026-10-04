import { setAuthBridge } from '@/api/client';
import { getMe } from '@/api/endpoints/session';
import { MOCK_ACCOUNTS } from '@/api/mock/fixtures/staff';
import {
  capabilitiesFor,
  forbidden,
  inboxCategories,
  isOwnerOnly,
  mockCan,
  PERMISSIONS,
  requireAnyCap,
  requireCap,
  requireCaps,
} from '@/api/mock/permissions';
import { zMe } from '@/api/schemas/session';
import { CAPABILITIES, CAPABILITY_ROLES, ROLE_CAPABILITIES, ROLES, type Capability } from '@/auth/capabilities';
import { mockAuth } from '@/auth/mockAuth';

/**
 * The mock plays the server: its permission table must say exactly what the
 * app's fallback table says, GET /me must send each person's list, and a
 * missing capability must answer the server's 403.
 */

let token: string | null = null;
const as = (userId: string) => {
  token = `mock.${userId}.${Date.now() + 3_600_000}`;
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token, refresh: async () => null });
});

describe('the mock table', () => {
  it('names exactly the capabilities the app knows', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...CAPABILITIES].sort());
  });

  it.each(CAPABILITIES)('%s: same roles as the app', (cap) => {
    expect([...PERMISSIONS[cap]].sort()).toEqual([...CAPABILITY_ROLES[cap]].sort());
  });

  it.each(ROLES)("gives %s the app's fallback row, in the same order", (role) => {
    expect(capabilitiesFor(role)).toEqual(ROLE_CAPABILITIES[role]);
    expect(capabilitiesFor({ role })).toEqual(ROLE_CAPABILITIES[role]);
  });

  it('lets staff read only the leads and clients inbox categories', () => {
    expect(inboxCategories('owner')).toEqual(['leads', 'sales', 'billing', 'clients', 'audience', 'team', 'system']);
    expect(inboxCategories('manager')).toEqual(inboxCategories('owner'));
    expect(inboxCategories('staff')).toEqual(['leads', 'clients']);
  });
});

describe('requireCap and the 403', () => {
  const body = (cap: Capability) => forbidden(cap).body;

  it('answers null when the caller may go ahead', () => {
    expect(requireCap('staff', 'leads.outreach')).toBeNull();
    expect(requireCap({ role: 'manager' }, 'team.write')).toBeNull();
    expect(requireCaps('owner', 'team.remove', 'team.owners')).toBeNull();
    expect(requireAnyCap('staff', 'billing.view', 'leads.view')).toBeNull();
    expect(requireAnyCap('staff')).toBeNull();
  });

  it('answers owner_only "That section is owner only." when only owners may', () => {
    expect(isOwnerOnly('team.remove')).toBe(true);
    expect(requireCap('manager', 'team.remove')).toEqual({
      status: 403,
      body: { ok: false, error: { code: 'owner_only', message: 'That section is owner only.' } },
    });
    expect(body('team.owners')).toEqual(body('team.remove'));
  });

  it('answers forbidden "Your role cannot do that." for anything else', () => {
    expect(requireCap('staff', 'billing.view')).toEqual({
      status: 403,
      body: { ok: false, error: { code: 'forbidden', message: 'Your role cannot do that.' } },
    });
    expect(requireCaps('staff', 'leads.view', 'leads.delete')).toEqual(forbidden('leads.delete'));
    expect(requireAnyCap('staff', 'billing.view', 'clients.billing')).toEqual(forbidden('billing.view'));
  });

  it('checks a caller by its role', () => {
    const staff = MOCK_ACCOUNTS.find((a) => a.role === 'staff');
    expect(staff).toBeDefined();
    expect(mockCan(staff!, 'coupons.share')).toBe(true);
    expect(mockCan(staff!, 'coupons.write')).toBe(false);
  });
});

describe('GET /me capabilities', () => {
  it.each([
    ['usr_owner01', 'owner'],
    ['usr_mgr01', 'manager'],
    ['usr_staff01', 'staff'],
  ] as const)('%s (%s) gets the list for their role', async (userId, role) => {
    as(userId);
    const me = await getMe();
    expect(zMe.safeParse(me).success).toBe(true);
    expect(me.role).toBe(role);
    expect(me.capabilities).toEqual(ROLE_CAPABILITIES[role]);
  });

  it('has a staff account to sign in with', async () => {
    const result = await mockAuth.signIn('staff@tekmadev.test', 'tekmadev-staff');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    token = result.session.accessToken;
    const me = await getMe();
    expect(me.user).toEqual({ id: 'usr_staff01', email: 'staff@tekmadev.test', name: 'Noah Lavoie' });
    expect(me.role).toBe('staff');
    mockAuth.signOut();
  });
});
