import type { Agreement } from '@/api/schemas/clients';
import { formatDateTime } from '@/lib/dates';

/** Enough of the SHA-256 to recognise it at a glance; copying gives the full hash. */
export const HASH_PREFIX = 12;

export function shortHash(hash: string): string {
  return hash.trim().slice(0, HASH_PREFIX);
}

/** "Accepted <time> by <name> (<email>)", or "Sent <time>" (plus when it was viewed); null for a draft. */
export function agreementLine(a: Agreement, now: Date = new Date()): string | null {
  if (a.acceptedAt) {
    const who = a.acceptedByName && a.acceptedByEmail ? `${a.acceptedByName} (${a.acceptedByEmail})` : (a.acceptedByName ?? a.acceptedByEmail);
    return `Accepted ${formatDateTime(a.acceptedAt, now)}${who ? ` by ${who}` : ''}`;
  }
  if (a.sentAt) {
    const viewed = a.status === 'viewed' && a.viewedAt ? ` · viewed ${formatDateTime(a.viewedAt, now)}` : '';
    return `Sent ${formatDateTime(a.sentAt, now)}${viewed}`;
  }
  return null;
}
