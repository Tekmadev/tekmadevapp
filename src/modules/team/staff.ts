import type { ActivityRange, StaffActivityRow, TeamMember, TeamMeta } from '@/api/schemas/team';
import type { Role } from '@/api/types';
import { roleCopy } from '@/auth/capabilities';
import type { Tone } from '@/design/tokens';
import { formatShortDate } from '@/lib/dates';
import { countLabel } from '@/lib/format';

import { isSelf, memberName } from './logic';

/**
 * Staff management (owner decisions 2026-10-03, the website's
 * docs/admin-api/staff.md): who may change whose role, who may pause whom,
 * and the activity board. Pure rules and copy, no React, so they are unit
 * tested. The server enforces every rule again; these only decide what to offer.
 */

export const STAFF_COPY = {
  changeRole: 'Change role',
  roleTitle: 'Role',
  saveRole: 'Save role',
  pause: 'Pause access',
  pauseTitle: 'Pause access?',
  pauseHold: 'Hold to pause',
  pausing: 'Pausing',
  resume: 'Resume access',
  resuming: 'Resuming',
  paused: 'Paused',
  active: 'Active',
  lockedEnv: "Set by the server environment. Nobody can change this owner's role, pause or remove them.",
  selfLocked: 'This is you. Nobody changes their own role or pauses themselves.',
  ownerLocked: "Only an owner can change another owner's role or pause them.",
  teamActivity: 'Team activity',
  teamActivityHint: 'Leads found, outreach, calls booked and clients won',
  myActivity: 'My activity',
  myActivityHint: 'Your leads, outreach, calls booked and credit',
  activityEmpty: 'No one is on the team yet.',
  creditsEmpty: 'No credit on clients won in this range.',
  privateNote: 'Only you, owners and managers see your activity and credit.',
} as const;

/** What the signed-in person may do on the Team screen (their capabilities). */
export type TeamPowers = {
  /** `team.role` */
  role: boolean;
  /** `team.pause` */
  pause: boolean;
  /** `team.owners`: make owners and touch other owners. */
  owners: boolean;
};

type Target = Pick<TeamMember, 'email' | 'role' | 'envOwner'>;

/**
 * Why nobody here may change this member's role or pause them, or null when
 * the rules allow it: env owners are locked for everyone, nobody touches
 * themselves, and without `team.owners` nobody touches an owner.
 */
export function accessLock(member: Target, myEmail: string | null | undefined, powers: Pick<TeamPowers, 'owners'>): string | null {
  if (member.envOwner) return STAFF_COPY.lockedEnv;
  if (isSelf(member, myEmail)) return STAFF_COPY.selfLocked;
  if (member.role === 'owner' && !powers.owners) return STAFF_COPY.ownerLocked;
  return null;
}

/**
 * The roles this person may give this member (narrowest first), or none when
 * they cannot change the role at all: `team.role` is needed, Owner is a
 * choice only with `team.owners`, and the access lock applies. The current
 * role is always among the choices when any are offered.
 */
export function roleChoices(member: Target, myEmail: string | null | undefined, powers: TeamPowers): Role[] {
  if (!powers.role || accessLock(member, myEmail, powers)) return [];
  return powers.owners ? ['staff', 'manager', 'owner'] : ['staff', 'manager'];
}

/** Whether to offer Pause or Resume: `team.pause` and no access lock. */
export function canPauseMember(member: Target, myEmail: string | null | undefined, powers: TeamPowers): boolean {
  return powers.pause && accessLock(member, myEmail, powers) === null;
}

export const isPaused = (member: Pick<TeamMember, 'paused'>) => member.paused === true;

/** "Paused Oct 2 by Maya Chen", "Paused Oct 2", "Paused". */
export function pausedLine(member: Pick<TeamMember, 'pausedAt' | 'pausedBy'>, now: Date = new Date()): string {
  const when = member.pausedAt ? ` ${formatShortDate(member.pausedAt, now)}` : '';
  const by = member.pausedBy ? ` by ${member.pausedBy.name?.trim() || member.pausedBy.email}` : '';
  return `${STAFF_COPY.paused}${when}${by}`;
}

/** The hold sheet's message. */
export function pauseMessage(member: Pick<TeamMember, 'name' | 'email'>): string {
  return `${memberName(member)} cannot sign in to the admin or this app, and gets no notifications, until someone resumes their access. Nothing is deleted.`;
}

export const pausedToast = (member: Pick<TeamMember, 'name' | 'email'>) => `Paused access for ${memberName(member)}.`;
export const resumedToast = (member: Pick<TeamMember, 'name' | 'email'>) => `${memberName(member)} can sign in again.`;
export const roleToast = (member: Pick<TeamMember, 'name' | 'email'>, role: Role) => `${memberName(member)} is now ${roleCopy(role).label}.`;

/** The cached list with one member replaced (the server answers the whole member). */
export function replaceMember(list: readonly TeamMember[], member: TeamMember): TeamMember[] {
  return list.map((m) => (m.email === member.email ? member : m));
}

/* ---------- the activity board ---------- */

export const RANGE_FALLBACK: readonly { value: ActivityRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

/** The range chips: GET /meta `activityRanges`, else the same words. "All time" reads "All" on a chip. */
export function rangeChips(meta: Pick<TeamMeta, 'activityRanges'> | undefined): { value: ActivityRange; label: string }[] {
  return (meta?.activityRanges ?? RANGE_FALLBACK).map((r) => ({ value: r.value, label: r.value === 'all' ? 'All' : r.label }));
}

export const isActivityRange = (value: unknown): value is ActivityRange => value === '7d' || value === '30d' || value === 'all';

const display = (row: Pick<StaffActivityRow, 'name' | 'email'>) => (row.name?.trim() || row.email).toLowerCase();

/**
 * The board's order (owner decision): most clients won, then most touches;
 * ties by calls booked, leads found, then name.
 */
export function byScoreboard(a: StaffActivityRow, b: StaffActivityRow): number {
  return (
    b.clientsWon - a.clientsWon ||
    b.touches.total - a.touches.total ||
    b.callsBooked - a.callsBooked ||
    b.leadsFound - a.leadsFound ||
    display(a).localeCompare(display(b), 'en')
  );
}

export function sortScoreboard(rows: readonly StaffActivityRow[]): StaffActivityRow[] {
  return [...rows].sort(byScoreboard);
}

/** Up to two decimals, trailing zeros dropped: 1.5 is "1.5", 2 is "2", 33.333 is "33.33". Never "-0". */
export function decimalText(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

/** Clients won: "0", "1", "1.5", "2.1" (credit shares make fractions). */
export const clientsWonText = (value: number) => decimalText(value);

/** A share of 100: "50%", "33.33%". */
export const shareText = (share: number) => `${decimalText(share)}%`;

/** "3 calls · 2 emails · 1 DM", leaving out kinds with none; "No touches" when there are none. */
export function touchBreakdown(touches: StaffActivityRow['touches']): string {
  const parts = [
    touches.call ? countLabel(touches.call, 'call', 'calls') : null,
    touches.email ? countLabel(touches.email, 'email', 'emails') : null,
    touches.dm ? countLabel(touches.dm, 'DM', 'DMs') : null,
    touches.meeting ? countLabel(touches.meeting, 'meeting', 'meetings') : null,
    touches.other ? countLabel(touches.other, 'other', 'other') : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No touches';
}

/** Follow-ups: overdue in signal, due today in gold, nothing due is quiet. */
export function followUpTone(followUps: StaffActivityRow['followUps']): Tone {
  if (followUps.overdue > 0) return 'signal';
  if (followUps.dueToday > 0) return 'gold';
  return 'muted';
}

/** "2 overdue · 1 today", or "None due". */
export function followUpText(followUps: StaffActivityRow['followUps']): string {
  const parts = [followUps.overdue ? `${followUps.overdue} overdue` : null, followUps.dueToday ? `${followUps.dueToday} today` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'None due';
}
