import { api, setAuthBridge } from '@/api/client';
import { getMe } from '@/api/endpoints/session';
import { addTeamMember, getTeam, removeTeamMember, type NewTeamMemberInput } from '@/api/endpoints/team';
import { ApiError } from '@/api/errors';
import { MOCK_ACCOUNTS } from '@/api/mock/fixtures/staff';
import { metaFragment, zTeam, zTeamMember, zTeamRemoveResult } from '@/api/schemas/team';

/**
 * Team routes through the real mock transport: the list (owners first, env
 * owners locked), adding a member who can then sign in, validation, removing
 * (never the env owner, never yourself), and owner-only 403s. Not paged.
 */

let token: string | null = null;
const tokenFor = (userId: string) => `mock.${userId}.${Date.now() + 3_600_000}`;
const asOwner = () => {
  token = tokenFor('usr_owner01');
};
const asManager = () => {
  token = tokenFor('usr_mgr01');
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token, refresh: async () => null });
});
beforeEach(asOwner);

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

/** Our own keys: under jest the native UUID is mocked and newIdempotencyKey() returns undefined. */
let keyCount = 0;
const testKey = () => `team-test-${++keyCount}`;
const add = (input: NewTeamMemberInput) => addTeamMember(input, testKey());

const accountFor = (email: string) => {
  const account = MOCK_ACCOUNTS.find((a) => a.email === email);
  if (!account) throw new Error(`No account ${email}`);
  return account;
};

describe('GET /team', () => {
  it('lists owners first, with the env owner locked', async () => {
    const team = await getTeam();
    expect(zTeam.safeParse(team).success).toBe(true);
    expect(team.map((m) => [m.email, m.role, m.envOwner])).toEqual([
      ['owner@tekmadev.test', 'owner', true],
      ['manager@tekmadev.test', 'manager', false],
      ['alexandra@tekmadev.test', 'manager', false],
    ]);
    expect(team[0].name).toBe('Shajeed I.');
    expect(team[0].lastSignInAt).not.toBeNull();
    // Invited but never signed in.
    expect(team[2].lastSignInAt).toBeNull();
  });

  it('adds the role picker copy to GET /meta', async () => {
    // Raw read: only this domain's slice is checked here.
    const parsed = metaFragment.safeParse(await api.get<unknown>('/meta'));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.teamRoles).toEqual([
      {
        value: 'manager',
        label: 'Manager',
        help: 'Works on Overview, Inbox, Analytics, Leads, Free tools, Clients and Subscriptions',
        tone: 'neutral',
      },
      { value: 'owner', label: 'Owner', help: 'Full access, can manage the team', tone: 'gold' },
    ]);
  });

  it('is owner only', async () => {
    asManager();
    for (const call of [
      getTeam(),
      add({ email: 'sneaky@tekmadev.test', tempPassword: 'longenough', role: 'owner' }),
      removeTeamMember('alexandra@tekmadev.test'),
    ]) {
      const e = await apiError(call);
      expect([e.status, e.code]).toEqual([403, 'owner_only']);
    }
    asOwner();
    expect((await getTeam()).map((m) => m.email)).not.toContain('sneaky@tekmadev.test');
  });
});

describe('POST /team', () => {
  it('validates email, password and role, reporting every field', async () => {
    const all = await apiError(api.post('/team', { email: 'nope', tempPassword: 'short', role: 'admin' }, { idempotencyKey: testKey() }));
    expect([all.status, all.code, all.message]).toEqual([400, 'email', 'Enter a valid email.']);
    expect(Object.keys(all.fields ?? {}).sort()).toEqual(['email', 'role', 'tempPassword']);

    const password = await apiError(add({ email: 'new.person@tekmadev.test', tempPassword: '1234567', role: 'manager' }));
    expect([password.status, password.code, password.message]).toEqual([
      400,
      'password',
      'The temporary password must be at least 8 characters.',
    ]);

    const name = await apiError(add({ name: 'x'.repeat(81), email: 'new.person@tekmadev.test', tempPassword: '12345678', role: 'manager' }));
    expect([name.code, Object.keys(name.fields ?? {})]).toEqual(['name', ['name']]);
  });

  it('refuses someone already on the team', async () => {
    const e = await apiError(add({ email: 'Manager@Tekmadev.test', tempPassword: 'longenough', role: 'manager' }));
    expect([e.status, e.code, e.fields?.email]).toEqual([409, 'dupe', 'That email is already on the team.']);
  });

  it('adds a member who can then sign in with the temporary password', async () => {
    const member = await add({ name: '  Ravi Shah ', email: ' Ravi.Shah@Tekmadev.test ', tempPassword: 'Hamilton-2026', role: 'manager' });
    expect(zTeamMember.safeParse(member).success).toBe(true);
    expect(member).toMatchObject({ email: 'ravi.shah@tekmadev.test', name: 'Ravi Shah', role: 'manager', lastSignInAt: null, envOwner: false });
    expect((await getTeam()).map((m) => m.email)).toContain('ravi.shah@tekmadev.test');

    // Mock sign-in checks MOCK_ACCOUNTS: the password works, and their token is a manager's.
    const account = accountFor('ravi.shah@tekmadev.test');
    expect(account.password).toBe('Hamilton-2026');
    token = tokenFor(account.id);
    const me = await getMe();
    expect([me.user.email, me.role]).toEqual(['ravi.shah@tekmadev.test', 'manager']);
  });

  it('creates once per idempotency key', async () => {
    const key = testKey();
    const input: NewTeamMemberInput = { email: 'once@tekmadev.test', tempPassword: 'longenough', role: 'manager' };
    const first = await addTeamMember(input, key);
    const retry = await addTeamMember(input, key);
    expect(retry).toEqual(first);
    expect((await getTeam()).filter((m) => m.email === 'once@tekmadev.test')).toHaveLength(1);
  });
});

describe('DELETE /team/:email', () => {
  it('never removes the env owner', async () => {
    const e = await apiError(removeTeamMember('owner@tekmadev.test'));
    expect([e.status, e.code, e.message]).toEqual([422, 'owner', 'The owner cannot be removed.']);
    expect((await getTeam())[0].email).toBe('owner@tekmadev.test');
  });

  it('answers 404 for someone not on the team', async () => {
    const e = await apiError(removeTeamMember('stranger@tekmadev.test'));
    expect([e.status, e.code]).toEqual([404, 'not_found']);
  });

  it('removes a member (email with a plus), who is then signed out for good', async () => {
    await add({ email: 'temp+ottawa@tekmadev.test', tempPassword: 'longenough', role: 'manager' });
    const id = accountFor('temp+ottawa@tekmadev.test').id;

    const result = await removeTeamMember('temp+ottawa@tekmadev.test');
    expect(zTeamRemoveResult.safeParse(result).success).toBe(true);
    expect(result).toEqual({ email: 'temp+ottawa@tekmadev.test', deleted: true });
    expect((await getTeam()).map((m) => m.email)).not.toContain('temp+ottawa@tekmadev.test');

    token = tokenFor(id);
    const gone = await apiError(getMe({ rawAuthErrors: true }));
    expect(gone.status).toBe(401);
  });

  it('does not let an added owner remove themselves', async () => {
    await add({ name: 'Second Owner', email: 'second.owner@tekmadev.test', tempPassword: 'longenough', role: 'owner' });
    token = tokenFor(accountFor('second.owner@tekmadev.test').id);
    const e = await apiError(removeTeamMember('second.owner@tekmadev.test'));
    expect([e.status, e.code]).toEqual([422, 'self']);

    // Another owner can remove them.
    asOwner();
    expect((await removeTeamMember('second.owner@tekmadev.test')).deleted).toBe(true);
  });
});
