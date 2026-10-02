import type { InviteOutcome, Member } from '@/api/schemas/clients';
import { formatShortDate, relativeTime } from '@/lib/dates';

/** Copy for the Team section (the client's portal users). */

export const NO_LOGIN = 'no login yet';

/** Name, else the email. */
export function memberName(member: Pick<Member, 'name' | 'email'>): string {
  return member.name?.trim() || member.email;
}

/** "Invited Sep 12 · Joined Sep 13 · Last seen 2 h ago", or "... · no login yet". */
export function memberTimeline(member: Pick<Member, 'invitedAt' | 'joinedAt' | 'lastSeenAt'>, now: Date = new Date()): string {
  return [
    member.invitedAt ? `Invited ${formatShortDate(member.invitedAt, now)}` : null,
    member.joinedAt ? `Joined ${formatShortDate(member.joinedAt, now)}` : null,
    member.lastSeenAt ? `Last seen ${relativeTime(member.lastSeenAt, now)}` : NO_LOGIN,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What "Resend invite" / "Send reset link" does for this person; null when it cannot (turned off). */
export function memberLinkAction(member: Pick<Member, 'status'>): { label: string; pending: string } | null {
  if (member.status === 'invited') return { label: 'Resend invite', pending: 'Sending' };
  if (member.status === 'active') return { label: 'Send reset link', pending: 'Sending' };
  return null;
}

/** The toast after "Add a person", by what happened to the invite email. */
export function addedMessage(invite: InviteOutcome): { tone: 'ok' | 'err'; text: string } {
  switch (invite) {
    case 'sent':
      return { tone: 'ok', text: 'Person added. Invite sent.' };
    case 'failed':
      return { tone: 'err', text: 'Person added, but the invite email failed. Use Resend invite.' };
    case 'skipped':
      return { tone: 'ok', text: 'Person added.' };
  }
}
