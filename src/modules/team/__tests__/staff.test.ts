import type { StaffActivityRow, TeamMember } from '@/api/schemas/team';

import {
  accessLock,
  canPauseMember,
  clientsWonText,
  followUpText,
  followUpTone,
  pausedLine,
  rangeChips,
  replaceMember,
  roleChoices,
  shareText,
  sortScoreboard,
  STAFF_COPY,
  touchBreakdown,
  type TeamPowers,
} from '../staff';

const NOW = new Date('2026-10-03T16:00:00Z');
const ME = 'maya@tekmadev.test';

const member = (over: Partial<TeamMember>): TeamMember => ({
  email: 'noah@tekmadev.test',
  name: 'Noah Lavoie',
  role: 'staff',
  lastSignInAt: null,
  addedAt: '2026-08-11T13:05:51Z',
  envOwner: false,
  ...over,
});

const OWNER: TeamPowers = { role: true, pause: true, owners: true };
const MANAGER: TeamPowers = { role: true, pause: true, owners: false };
const STAFF: TeamPowers = { role: false, pause: false, owners: false };

describe('who may change whose role', () => {
  it('lets an owner give any role, owner included, to anyone not locked', () => {
    expect(roleChoices(member({}), ME, OWNER)).toEqual(['staff', 'manager', 'owner']);
    // Owners may demote another owner.
    expect(roleChoices(member({ role: 'owner' }), ME, OWNER)).toEqual(['staff', 'manager', 'owner']);
  });

  it('lets a manager switch people between manager and staff, never touching an owner', () => {
    expect(roleChoices(member({ role: 'staff' }), ME, MANAGER)).toEqual(['staff', 'manager']);
    expect(roleChoices(member({ role: 'manager', email: 'alexandra@tekmadev.test' }), ME, MANAGER)).toEqual(['staff', 'manager']);
    expect(roleChoices(member({ role: 'owner' }), ME, MANAGER)).toEqual([]);
  });

  it('never offers a role change on an env owner, on yourself, or without team.role', () => {
    expect(roleChoices(member({ role: 'owner', envOwner: true }), ME, OWNER)).toEqual([]);
    expect(roleChoices(member({ email: 'Maya@Tekmadev.test' }), ME, OWNER)).toEqual([]);
    expect(roleChoices(member({}), ME, STAFF)).toEqual([]);
    expect(roleChoices(member({}), ME, { ...OWNER, role: false })).toEqual([]);
  });
});

describe('who may pause whom', () => {
  it('lets owners pause anyone but env owners and themselves', () => {
    expect(canPauseMember(member({}), ME, OWNER)).toBe(true);
    expect(canPauseMember(member({ role: 'owner' }), ME, OWNER)).toBe(true);
    expect(canPauseMember(member({ role: 'owner', envOwner: true }), ME, OWNER)).toBe(false);
    expect(canPauseMember(member({ email: ME }), ME, OWNER)).toBe(false);
  });

  it('lets managers pause managers and staff, never owners', () => {
    expect(canPauseMember(member({ role: 'staff' }), ME, MANAGER)).toBe(true);
    expect(canPauseMember(member({ role: 'manager', email: 'alexandra@tekmadev.test' }), ME, MANAGER)).toBe(true);
    expect(canPauseMember(member({ role: 'owner' }), ME, MANAGER)).toBe(false);
  });

  it('never lets staff pause anyone', () => {
    expect(canPauseMember(member({}), ME, STAFF)).toBe(false);
    expect(canPauseMember(member({}), ME, { ...MANAGER, pause: false })).toBe(false);
  });

  it('says why something is locked: env owner first, then yourself, then an owner for a manager', () => {
    expect(accessLock(member({ role: 'owner', envOwner: true, email: ME }), ME, OWNER)).toBe(STAFF_COPY.lockedEnv);
    expect(accessLock(member({ email: ME }), ME, OWNER)).toBe(STAFF_COPY.selfLocked);
    expect(accessLock(member({ role: 'owner' }), ME, MANAGER)).toBe(STAFF_COPY.ownerLocked);
    expect(accessLock(member({ role: 'owner' }), ME, OWNER)).toBeNull();
    expect(accessLock(member({}), null, MANAGER)).toBeNull();
  });
});

describe('paused people', () => {
  it('says when and by whom', () => {
    const paused = member({ paused: true, pausedAt: '2026-10-02T15:00:00.123456Z', pausedBy: { email: ME, name: 'Maya Chen' } });
    expect(pausedLine(paused, NOW)).toBe('Paused Oct 2 by Maya Chen');
    expect(pausedLine(member({ paused: true, pausedAt: null, pausedBy: { email: ME, name: null } }), NOW)).toBe(`Paused by ${ME}`);
    expect(pausedLine(member({ paused: true }), NOW)).toBe('Paused');
  });

  it('replaces the member the server answered, in place', () => {
    const list = [member({ email: 'a@x.test' }), member({}), member({ email: 'z@x.test' })];
    const next = replaceMember(list, member({ paused: true }));
    expect(next.map((m) => m.email)).toEqual(['a@x.test', 'noah@tekmadev.test', 'z@x.test']);
    expect(next[1].paused).toBe(true);
  });
});

const row = (over: Partial<StaffActivityRow>): StaffActivityRow => ({
  email: 'noah@tekmadev.test',
  name: 'Noah Lavoie',
  role: 'staff',
  paused: false,
  leadsFound: 0,
  touches: { call: 0, email: 0, dm: 0, meeting: 0, other: 0, total: 0 },
  followUps: { dueToday: 0, overdue: 0 },
  callsBooked: 0,
  clientsWon: 0,
  clientsHelped: 0,
  credits: [],
  ...over,
});
const touches = (total: number) => ({ call: total, email: 0, dm: 0, meeting: 0, other: 0, total });

describe('the scoreboard', () => {
  it('sorts by clients won, then touches, then calls booked, leads found and name', () => {
    const rows = [
      row({ email: 'a', name: 'Ann', clientsWon: 1, touches: touches(2) }),
      row({ email: 'b', name: 'Ben', clientsWon: 1.5, touches: touches(0) }),
      row({ email: 'c', name: 'Cal', clientsWon: 1, touches: touches(9) }),
      row({ email: 'd', name: 'Dee', clientsWon: 0, touches: touches(9), callsBooked: 2 }),
      row({ email: 'e', name: 'Eve', clientsWon: 0, touches: touches(9), callsBooked: 2, leadsFound: 4 }),
      row({ email: 'f', name: 'abe', clientsWon: 0, touches: touches(0) }),
      row({ email: 'g', name: null, clientsWon: 0, touches: touches(0) }),
    ];
    expect(sortScoreboard(rows).map((r) => r.email)).toEqual(['b', 'c', 'a', 'e', 'd', 'f', 'g']);
    // The input is left alone.
    expect(rows[0].email).toBe('a');
  });

  it('shows clients won with their halves, and shares as percents', () => {
    expect(clientsWonText(0)).toBe('0');
    expect(clientsWonText(1.5)).toBe('1.5');
    expect(clientsWonText(0.5 + 1 + 0.6)).toBe('2.1');
    expect(clientsWonText(1 / 3)).toBe('0.33');
    expect(shareText(50)).toBe('50%');
    expect(shareText(33.33)).toBe('33.33%');
  });

  it('breaks touches down by kind, leaving out kinds with none', () => {
    expect(touchBreakdown({ call: 3, email: 1, dm: 2, meeting: 0, other: 0, total: 6 })).toBe('3 calls · 1 email · 2 DMs');
    expect(touchBreakdown({ call: 0, email: 0, dm: 0, meeting: 1, other: 1, total: 2 })).toBe('1 meeting · 1 other');
    expect(touchBreakdown(touches(0))).toBe('No touches');
  });

  it('flags follow-ups: overdue in signal, today in gold', () => {
    expect(followUpText({ dueToday: 1, overdue: 2 })).toBe('2 overdue · 1 today');
    expect(followUpText({ dueToday: 0, overdue: 0 })).toBe('None due');
    expect(followUpTone({ dueToday: 1, overdue: 2 })).toBe('signal');
    expect(followUpTone({ dueToday: 1, overdue: 0 })).toBe('gold');
    expect(followUpTone({ dueToday: 0, overdue: 0 })).toBe('muted');
  });

  it('labels the range chips from meta, with "All" on the chip', () => {
    expect(rangeChips(undefined)).toEqual([
      { value: '7d', label: '7 days' },
      { value: '30d', label: '30 days' },
      { value: 'all', label: 'All' },
    ]);
    expect(rangeChips({ activityRanges: [{ value: '7d', label: 'This week' }] })).toEqual([{ value: '7d', label: 'This week' }]);
  });
});
