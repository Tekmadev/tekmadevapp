import type { TeamMember } from '@/api/schemas/team';

import {
  canRemove,
  FALLBACK_ROLES,
  generateTempPassword,
  insertMember,
  lastSignInText,
  memberMeta,
  memberName,
  newMemberInput,
  passwordFromBytes,
  removeMessage,
  roleBadge,
  shareCredentialsText,
  TEAM_COPY,
  teamRoles,
  validateNewMember,
  withoutMember,
} from '../logic';

const NOW = new Date('2026-10-02T16:00:00Z');

const member = (over: Partial<TeamMember>): TeamMember => ({
  email: 'maya@tekmadev.test',
  name: 'Maya Chen',
  role: 'manager',
  lastSignInAt: null,
  addedAt: '2026-02-17T14:40:09Z',
  envOwner: false,
  ...over,
});

describe('roles', () => {
  it('uses the brief when /meta has not loaded', () => {
    expect(teamRoles(undefined)).toBe(FALLBACK_ROLES);
    expect(teamRoles([])).toBe(FALLBACK_ROLES);
    expect(roleBadge(teamRoles(undefined), 'owner')).toEqual({ label: 'Owner', tone: 'gold' });
    expect(roleBadge(teamRoles(undefined), 'manager')).toEqual({ label: 'Manager', tone: 'neutral' });
  });

  it('prefers the server labels', () => {
    const roles = [{ value: 'owner' as const, label: 'Owner', help: 'x', tone: 'gold' as const }];
    expect(roleBadge(roles, 'owner')).toEqual({ label: 'Owner', tone: 'gold' });
    // A role missing from /meta still gets the brief's badge.
    expect(roleBadge(roles, 'manager')).toEqual({ label: 'Manager', tone: 'neutral' });
  });
});

describe('row text', () => {
  it('falls back to the email', () => {
    expect(memberName(member({ name: null }))).toBe('maya@tekmadev.test');
    expect(memberName(member({ name: '  ' }))).toBe('maya@tekmadev.test');
  });

  it('says never for someone who has not signed in', () => {
    expect(lastSignInText(null, NOW)).toBe('never');
    expect(memberMeta(member({}), NOW)).toBe('Last sign in: never · Added Feb 17');
    expect(memberMeta(member({ lastSignInAt: '2026-10-02T15:46:00Z' }), NOW)).toBe('Last sign in: 14 min ago · Added Feb 17');
  });

  it('warns that portal access goes too', () => {
    expect(removeMessage(member({}))).toBe(`Maya Chen loses access to the admin. ${TEAM_COPY.removeWarning}`);
    expect(TEAM_COPY.removeWarning).toBe('This also removes their client portal access if they have any.');
  });
});

describe('canRemove', () => {
  it('never offers to remove an env owner or yourself', () => {
    expect(canRemove(member({ envOwner: true, role: 'owner' }), 'someone@else.test')).toBe(false);
    expect(canRemove(member({}), 'MAYA@tekmadev.test')).toBe(false);
    expect(canRemove(member({}), 'owner@tekmadev.test')).toBe(true);
    expect(canRemove(member({ role: 'owner' }), null)).toBe(true);
  });
});

describe('cached list', () => {
  const envOwner = member({ email: 'owner@t.test', role: 'owner', envOwner: true, addedAt: '2025-11-03T00:00:00Z' });
  const manager = member({ email: 'a@t.test', addedAt: '2026-01-01T00:00:00Z' });

  it('places a new owner before the managers and a new manager last', () => {
    const owner = member({ email: 'new-owner@t.test', role: 'owner', addedAt: '2026-10-02T00:00:00Z' });
    expect(insertMember([envOwner, manager], owner).map((m) => m.email)).toEqual(['owner@t.test', 'new-owner@t.test', 'a@t.test']);
    const late = member({ email: 'b@t.test', addedAt: '2026-10-02T00:00:00Z' });
    expect(insertMember([envOwner, manager], late).map((m) => m.email)).toEqual(['owner@t.test', 'a@t.test', 'b@t.test']);
  });

  it('never lists someone twice and removes by email', () => {
    expect(insertMember([envOwner, manager], manager)).toHaveLength(2);
    expect(withoutMember([envOwner, manager], 'a@t.test')).toEqual([envOwner]);
  });
});

describe('add form', () => {
  it('checks email, password length and name length like the server', () => {
    expect(validateNewMember({ name: '', email: 'maya@x.co', password: '12345678', role: 'manager' })).toEqual({});
    expect(validateNewMember({ name: 'x'.repeat(81), email: 'nope', password: '1234567', role: 'manager' })).toEqual({
      name: TEAM_COPY.nameLong,
      email: TEAM_COPY.emailInvalid,
      tempPassword: TEAM_COPY.passwordShort,
    });
  });

  it('sends a trimmed lowercase email, null for no name, and the password as typed', () => {
    expect(newMemberInput({ name: '  ', email: ' Maya@X.co ', password: ' pass word ', role: 'owner' })).toEqual({
      name: null,
      email: 'maya@x.co',
      tempPassword: ' pass word ',
      role: 'owner',
    });
  });
});

describe('temporary passwords', () => {
  const seq = (values: number[]) => Uint8Array.from(values);

  it('makes three readable groups of four with every character class', () => {
    // Indices into the 56-character alphabet: 0 = a, 24 = A, 48 = 2.
    const bytes = seq([0, 24, 48, 1, 25, 49, 2, 26, 50, 3, 27, 51]);
    expect(passwordFromBytes(bytes)).toBe('aA2b-B3cC-4dD5');
  });

  it('skips biased bytes and refuses a password missing a class', () => {
    expect(passwordFromBytes(seq([255, 0, 24, 48, 1, 25, 49, 2, 26, 50, 3, 27, 51]))).toBe('aA2b-B3cC-4dD5');
    expect(passwordFromBytes(seq(new Array(12).fill(0)))).toBeNull();
    expect(passwordFromBytes(seq([0, 24, 48]))).toBeNull();
  });

  it('draws again until it has a good one, and never uses a fixed fallback', () => {
    let calls = 0;
    const source = (n: number) => {
      calls += 1;
      return calls === 1 ? new Uint8Array(n) : Uint8Array.from({ length: n }, (_, i) => [0, 24, 48][i % 3] + Math.floor(i / 3));
    };
    const password = generateTempPassword(source);
    expect(calls).toBe(2);
    expect(password).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    // A broken source (all zeros) still ends with a random valid password.
    expect(generateTempPassword((n) => new Uint8Array(n))).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
  });

  it('shares the email, the password and where to sign in', () => {
    const text = shareCredentialsText({ email: 'maya@x.co', password: 'aA2b-B3cC-4dD5', roleLabel: 'Manager' });
    expect(text).toContain('as a Manager.');
    expect(text).toContain('Email: maya@x.co');
    expect(text).toContain('Temporary password: aA2b-B3cC-4dD5');
    expect(text).toContain('https://www.tekmadev.com/admin');
    expect(shareCredentialsText({ email: 'a@b.co', password: 'p', roleLabel: 'Owner' })).toContain('as an Owner.');
  });
});
