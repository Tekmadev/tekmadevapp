import type { NewTeamMemberInput } from '@/api/endpoints/team';
import type { TeamMember } from '@/api/schemas/team';
import type { Role } from '@/api/types';
import { roleCopy } from '@/auth/capabilities';
import type { Tone } from '@/design/tokens';
import { formatShortDate, relativeTime } from '@/lib/dates';
import { env } from '@/lib/env';
import { isValidEmail } from '@/lib/text';

/** Copy and pure helpers for Team (brief 8.16). No React here, so it is easy to test. */

export const TEAM_COPY = {
  title: 'Team',
  add: 'Add a team member',
  addButton: 'Add team member',
  adding: 'Adding',
  added: 'Team member added. Share the temporary password so they can sign in and change it.',
  addedTitle: 'Team member added',
  share: 'Share sign-in details',
  done: 'Done',
  never: 'never',
  empty: 'No one is on the team yet.',
  removeTitle: 'Remove from the team?',
  removeWarning: 'This also removes their client portal access if they have any.',
  removeHold: 'Hold to remove',
  removing: 'Removing',
  removeButton: 'Remove from team',
  locked: 'Set by the server environment. This owner cannot be removed.',
  self: 'This is you. Another owner can remove you.',
  selfNotOwner: 'This is you. An owner can remove you.',
  passwordHelp: '8 or more characters. They change it after signing in.',
  passwordShort: 'The temporary password must be at least 8 characters.',
  emailInvalid: 'Enter a valid email.',
  nameLong: 'Keep the name to 80 characters or fewer.',
} as const;

export const NAME_MAX = 80;
export const TEMP_PASSWORD_MIN = 8;

export type RoleOption = { value: Role; label: string; help: string; tone: Tone };

/** The add sheet's order: the narrowest role first, so the default gives the least access. */
const ROLE_ORDER: readonly Role[] = ['staff', 'manager', 'owner'];

/**
 * Every role with its badge and help line (owner decision 2026-10-03): Owner
 * gold, Manager neutral, Staff muted. From the app's role table, not GET
 * /meta `teamRoles`, which still sends the old Manager line.
 */
export const TEAM_ROLES: readonly RoleOption[] = ROLE_ORDER.map((value) => ({ value, ...roleCopy(value) }));

/**
 * The roles someone may give in "Add a team member" (they hold `team.write`):
 * Staff and Manager, and Owner only with `team.owners`. Managers never make owners.
 */
export function addableRoles(canMakeOwners: boolean): readonly RoleOption[] {
  return canMakeOwners ? TEAM_ROLES : TEAM_ROLES.filter((r) => r.value !== 'owner');
}

/** "an Owner", "a Manager", "Staff": for "You now have access to Tekmadev Admin as ...". */
export function roleWithArticle(role: Role): string {
  const { label } = roleCopy(role);
  if (role === 'staff') return label;
  return role === 'owner' ? `an ${label}` : `a ${label}`;
}

/** Name, else the email. */
export function memberName(member: Pick<TeamMember, 'name' | 'email'>): string {
  return member.name?.trim() || member.email;
}

/** "5 min ago", "Sep 12", or the brief's "never". */
export function lastSignInText(lastSignInAt: string | null, now: Date = new Date()): string {
  return lastSignInAt ? relativeTime(lastSignInAt, now) : TEAM_COPY.never;
}

/** The row's quiet line: "Last sign in: 5 min ago · Added Feb 17". */
export function memberMeta(member: Pick<TeamMember, 'lastSignInAt' | 'addedAt'>, now: Date = new Date()): string {
  return `Last sign in: ${lastSignInText(member.lastSignInAt, now)} · Added ${formatShortDate(member.addedAt, now)}`;
}

export function isSelf(member: Pick<TeamMember, 'email'>, myEmail: string | null | undefined): boolean {
  return !!myEmail && member.email.trim().toLowerCase() === myEmail.trim().toLowerCase();
}

/**
 * Whether to offer Remove: only to someone who may remove members
 * (`team.remove`, owners), never for an owner set by the server environment
 * (locked) and never for yourself (the server refuses both).
 */
export function canRemove(
  member: Pick<TeamMember, 'email' | 'envOwner'>,
  myEmail: string | null | undefined,
  mayRemove: boolean,
): boolean {
  return mayRemove && !member.envOwner && !isSelf(member, myEmail);
}

/** The note on your own row: an owner is told another owner can remove them, anyone else that an owner can. */
export function selfNote(mayRemove: boolean): string {
  return mayRemove ? TEAM_COPY.self : TEAM_COPY.selfNotOwner;
}

/** The hold sheet's message: what happens, then the brief's warning. */
export function removeMessage(member: Pick<TeamMember, 'name' | 'email'>): string {
  return `${memberName(member)} loses access to the admin. ${TEAM_COPY.removeWarning}`;
}

export function removedMessage(member: Pick<TeamMember, 'name' | 'email'>): string {
  return `Removed ${memberName(member)} from the team.`;
}

const RANK: Record<Role, number> = { owner: 1, manager: 2, staff: 3 };

/**
 * Where a new member goes in the cached list, in the server's order: env owners,
 * other owners, managers, then staff, oldest first in each group.
 */
export function insertMember(list: readonly TeamMember[], member: TeamMember): TeamMember[] {
  const rank = (m: TeamMember) => (m.envOwner ? 0 : RANK[m.role]);
  return [...list.filter((m) => m.email !== member.email), member].sort(
    (a, b) => rank(a) - rank(b) || a.addedAt.localeCompare(b.addedAt),
  );
}

export function withoutMember(list: readonly TeamMember[], email: string): TeamMember[] {
  return list.filter((m) => m.email !== email);
}

/* ---------- the add form ---------- */

export type NewMemberDraft = { name: string; email: string; password: string; role: Role };
export type NewMemberField = 'name' | 'email' | 'tempPassword' | 'role';

/** The same checks the server makes, so the common mistakes show before anything is sent. */
export function validateNewMember(draft: NewMemberDraft): Partial<Record<NewMemberField, string>> {
  const errors: Partial<Record<NewMemberField, string>> = {};
  if (draft.name.trim().length > NAME_MAX) errors.name = TEAM_COPY.nameLong;
  if (!isValidEmail(draft.email)) errors.email = TEAM_COPY.emailInvalid;
  if (Array.from(draft.password).length < TEMP_PASSWORD_MIN) errors.tempPassword = TEAM_COPY.passwordShort;
  return errors;
}

/** The POST /team body. The password is sent exactly as typed. */
export function newMemberInput(draft: NewMemberDraft): NewTeamMemberInput {
  const name = draft.name.trim();
  return { name: name === '' ? null : name, email: draft.email.trim().toLowerCase(), tempPassword: draft.password, role: draft.role };
}

/* ---------- temporary passwords ---------- */

/** No 0/O, 1/l/I: the password is read off one screen and typed on another. */
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALPHABET = LOWER + UPPER + DIGITS;
/** Bytes at or above this are skipped, so every character is equally likely (no modulo bias). */
const BYTE_LIMIT = 256 - (256 % ALPHABET.length);

const GROUPS = 3;
const GROUP_SIZE = 4;

/**
 * A readable temporary password like "Kx7m-Pq2r-Wz9t" (14 characters) from
 * random bytes. Returns null when the bytes run out or the result lacks a
 * lowercase letter, an uppercase letter or a digit, so the caller draws again.
 */
export function passwordFromBytes(bytes: Uint8Array): string | null {
  const chars: string[] = [];
  for (const byte of bytes) {
    if (chars.length === GROUPS * GROUP_SIZE) break;
    if (byte >= BYTE_LIMIT) continue;
    chars.push(ALPHABET[byte % ALPHABET.length]);
  }
  if (chars.length < GROUPS * GROUP_SIZE) return null;
  const has = (set: string) => chars.some((c) => set.includes(c));
  if (!has(LOWER) || !has(UPPER) || !has(DIGITS)) return null;
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i++) groups.push(chars.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE).join(''));
  return groups.join('-');
}

/** Draws until a password passes (almost always the first time). `randomBytes` is expo-crypto's getRandomBytes. */
export function generateTempPassword(randomBytes: (count: number) => Uint8Array): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const password = passwordFromBytes(randomBytes(32));
    if (password) return password;
  }
  // Only reached when the secure source is broken (all zeros): never fall back to a fixed password.
  for (;;) {
    const password = passwordFromBytes(Uint8Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)));
    if (password) return password;
  }
}

/** What the share sheet sends to the new member. */
export function shareCredentialsText(input: { email: string; password: string; role: Role }): string {
  return [
    `You now have access to Tekmadev Admin as ${roleWithArticle(input.role)}.`,
    '',
    `Email: ${input.email}`,
    `Temporary password: ${input.password}`,
    '',
    `Sign in at ${env.websiteUrl}/admin or in the Tekmadev Admin app, then change your password under Profile.`,
  ].join('\n');
}
