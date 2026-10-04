import type { ClientCreditsInput } from '@/api/endpoints/clients';
import type { ClientCredit, CreditRole } from '@/api/schemas/clients';
import type { TeamMeta } from '@/api/schemas/team';

/**
 * Commission credit on a client (the website's docs/admin-api/staff.md
 * section 4): the role labels, the share parser, and the same rules the
 * server checks before PUT /clients/:id/credits, so the editor can show the
 * total live and stop the usual mistakes before a round trip. Pure, so it is
 * unit tested. No dollar math: shares are what a commission will be paid from.
 */

export const CREDIT_COPY = {
  title: 'Credit',
  ownTitle: 'Your credit',
  edit: 'Edit',
  editTitle: 'Edit credit',
  save: 'Save credit',
  saved: 'Credit saved.',
  add: 'Add a person',
  person: 'Person',
  role: 'Role',
  share: 'Share',
  note: 'Note',
  noteHelp: 'Why it changed. Owners and managers see it in the activity.',
  empty: 'No one has credit for this client yet.',
  ownEmpty: 'You have no credit on this client.',
  privateNote: 'Credit is private: you see only your own share.',
  nobody: 'Nobody gets credit for this client.',
  pickPerson: 'Pick someone on the team.',
  shareRange: 'Enter a share from 0.01 to 100, with at most two decimals.',
  duplicate: 'List each person once per role.',
  tooMany: 'Keep it to 20 credits or fewer.',
  total: 'Shares must add up to 100.',
  noteRequired: 'Add a note saying why.',
  noteLong: 'Keep the note to 500 characters or fewer.',
} as const;

export const MAX_CREDITS = 20;
export const NOTE_MAX = 500;

const ROLE_ORDER: readonly CreditRole[] = ['finder', 'booker', 'other'];

/** GET /meta `creditRoles` fallback, the server's words. */
export const CREDIT_ROLE_FALLBACK: Record<CreditRole, { label: string; help: string }> = {
  finder: { label: 'Finder', help: 'Found the lead and added it.' },
  booker: { label: 'Booker', help: 'Booked the call.' },
  other: { label: 'Other', help: 'Helped win the client another way.' },
};

type RolesMeta = Pick<TeamMeta, 'creditRoles'> | undefined;

/** Finder, Booker, Other with their help lines, from meta when it has them. */
export function creditRoleOptions(meta: RolesMeta): { value: CreditRole; label: string; help: string }[] {
  return meta?.creditRoles ?? ROLE_ORDER.map((value) => ({ value, ...CREDIT_ROLE_FALLBACK[value] }));
}

export function creditRoleLabel(meta: RolesMeta, role: CreditRole): string {
  return meta?.creditRoles?.find((r) => r.value === role)?.label ?? CREDIT_ROLE_FALLBACK[role].label;
}

/** Up to two decimals, trailing zeros dropped: "50", "33.33". */
export function shareNumberText(share: number): string {
  const rounded = Math.round(share * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

export const sharePercent = (share: number) => `${shareNumberText(share)}%`;

/** "Finder · 50%". */
export const creditLine = (meta: RolesMeta, credit: Pick<ClientCredit, 'role' | 'share'>) => `${creditRoleLabel(meta, credit.role)} · ${sharePercent(credit.share)}`;

/** A share in hundredths when it is 0.01 to 100 with at most two decimals, else null (the server's rule). */
export function shareHundredths(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0 || value > 100) return null;
  const hundredths = Math.round(value * 100);
  return Math.abs(value * 100 - hundredths) < 1e-6 ? hundredths : null;
}

/** What was typed in a share box: "50", "33.33", "12.5", " 40 " or "40%". Empty or not a number: null. */
export function parseShare(text: string): number | null {
  const clean = text.replace('%', '').replace(',', '.').trim();
  if (!/^\d{1,3}(\.\d*)?$|^\.\d+$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** Only digits and one decimal point, two decimals at most, as the person types. */
export function sanitizeShareInput(text: string): string {
  const cleaned = text.replace(',', '.').replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole.slice(0, 3);
  return `${whole.slice(0, 3)}.${rest.join('').slice(0, 2)}`;
}

/* ---------- the editor's draft ---------- */

export type CreditDraftRow = { key: string; email: string | null; role: CreditRole; share: string };

let rowCounter = 0;
/** A key for a new row (module scope, so it is stable across renders). */
export const newRowKey = () => `credit-${++rowCounter}`;

export function draftFromCredits(credits: readonly ClientCredit[]): CreditDraftRow[] {
  return credits.map((c) => ({ key: newRowKey(), email: c.email, role: c.role, share: shareNumberText(c.share) }));
}

/** A new row: the first role nobody holds yet (finder, then booker, then other). */
export function newDraftRow(rows: readonly CreditDraftRow[]): CreditDraftRow {
  const role = ROLE_ORDER.find((r) => !rows.some((row) => row.role === r)) ?? 'other';
  return { key: newRowKey(), email: null, role, share: '' };
}

/** The sum of the shares that parse, in hundredths. */
export function totalHundredths(rows: readonly Pick<CreditDraftRow, 'share'>[]): number {
  return rows.reduce((sum, row) => sum + (shareHundredths(parseShare(row.share)) ?? 0), 0);
}

/** "100%", "85%", "33.33%". */
export const totalText = (hundredths: number) => `${shareNumberText(hundredths / 100)}%`;

/** The total is right: exactly 100, or no rows at all (nobody gets credit). */
export const totalIsValid = (rows: readonly CreditDraftRow[]) => rows.length === 0 || totalHundredths(rows) === 10_000;

export type CreditProblems = {
  /** Per row key: the person or the share. */
  rows: Record<string, { person?: string; share?: string }>;
  /** A problem with the list as a whole (a duplicate, too many, the total). */
  list?: string;
  note?: string;
};

/**
 * Everything wrong with the draft, the server's rules and copy: each row
 * needs a person and a share from 0.01 to 100 (two decimals at most), each
 * person once per role, 20 rows at most, shares adding up to exactly 100 (or
 * no rows), and a note of 1 to 500 characters.
 */
export function creditProblems(rows: readonly CreditDraftRow[], note: string): CreditProblems {
  const problems: CreditProblems = { rows: {} };
  const seen = new Set<string>();
  for (const row of rows) {
    const issues: { person?: string; share?: string } = {};
    if (!row.email) issues.person = CREDIT_COPY.pickPerson;
    if (shareHundredths(parseShare(row.share)) === null) issues.share = CREDIT_COPY.shareRange;
    if (issues.person || issues.share) problems.rows[row.key] = issues;
    if (row.email) {
      const key = `${row.email.toLowerCase()}|${row.role}`;
      if (seen.has(key)) problems.list ??= CREDIT_COPY.duplicate;
      seen.add(key);
    }
  }
  if (rows.length > MAX_CREDITS) problems.list = CREDIT_COPY.tooMany;
  if (!problems.list && !totalIsValid(rows)) problems.list = CREDIT_COPY.total;
  const trimmed = note.trim();
  if (!trimmed) problems.note = CREDIT_COPY.noteRequired;
  else if (trimmed.length > NOTE_MAX) problems.note = CREDIT_COPY.noteLong;
  return problems;
}

export const hasProblems = (p: CreditProblems) => Object.keys(p.rows).length > 0 || !!p.list || !!p.note;

/** The PUT body: emails lowercased, shares as numbers, the note trimmed. Call after creditProblems found nothing. */
export function creditsInput(rows: readonly CreditDraftRow[], note: string): ClientCreditsInput {
  return {
    credits: rows.map((row) => ({ email: (row.email ?? '').toLowerCase(), role: row.role, share: (shareHundredths(parseShare(row.share)) ?? 0) / 100 })),
    note: note.trim(),
  };
}

/** Whether the draft says the same as the saved credits (in any order): saving would change nothing. */
export function sameAsSaved(rows: readonly CreditDraftRow[], saved: readonly ClientCredit[]): boolean {
  const key = (list: readonly { email: string; role: CreditRole; share: number | null }[]) =>
    list
      .map((c) => `${c.email.toLowerCase()}|${c.role}|${shareHundredths(c.share)}`)
      .sort()
      .join(',');
  return key(rows.map((r) => ({ email: r.email ?? '', role: r.role, share: parseShare(r.share) }))) === key(saved);
}
