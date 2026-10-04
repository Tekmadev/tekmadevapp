import { env } from '@/lib/env';

import type { Activity, ClientCredit, CreditRole } from '../../schemas/clients';
import type { Lead } from '../../schemas/leads';
import type { CommissionSplit } from '../../schemas/settings';
import { mockCan } from '../permissions';
import { daysAgo, hoursAgo, nowIso, type MockStaff } from '../router';
import { addActivity, clientById, type ClientRecord } from './clients';
import { MOCK_ACCOUNTS } from './staff';

/**
 * Commission credit for the mock (the website's docs/admin-api/staff.md and
 * lib/staff-credit.ts): each client's credit rows (who found the lead, who
 * booked the call, anyone else who helped) with shares of 100, the owner's
 * default split, and the rules the server checks. No dollar math yet.
 *
 * Seeded so the staff account (Noah Lavoie) has believable numbers on the
 * activity board: half of a client won this week, more this month.
 */

export type CreditRecord = { email: string; role: CreditRole; share: number; updatedAt: string; updatedBy: string | null };

export const CREDIT_ROLES: readonly CreditRole[] = ['finder', 'booker', 'other'];
export const MAX_CREDITS = 20;

/** The server's copy (lib/staff-credit.ts CREDIT_MESSAGES). */
export const CREDIT_MESSAGES = {
  list: 'Send the credits as a list.',
  email: 'Pick someone on the team.',
  role: 'Pick finder, booker or other.',
  share: 'Enter a share from 0.01 to 100, with at most two decimals.',
  duplicate: 'List each person once per role.',
  tooMany: `Keep it to ${MAX_CREDITS} credits or fewer.`,
  total: 'Shares must add up to 100.',
  note: 'Add a note saying why.',
  noteLong: 'Keep the note to 500 characters or fewer.',
} as const;

/** The owner's default split (site_settings `commission`): 50 / 50 until changed. */
export const commissionState: { current: CommissionSplit } = { current: { finder: 50, booker: 50 } };

/** Every client's credit rows (the `client_credits` table). Mutable in-memory state. */
export const creditsDb = new Map<string, CreditRecord[]>();

/** A share of 0 to 100 with at most two decimals, in hundredths; null otherwise (the server's shareHundredths). */
export function shareHundredths(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const hundredths = Math.round(value * 100);
  return Math.abs(value * 100 - hundredths) < 1e-6 ? hundredths : null;
}

/** "50" or "33.33". */
const shareText = (share: number) => String(Math.round(share * 100) / 100);

/** Finder first, then booker, then other; biggest share first; then by email. */
export function sortCredits<T extends { role: CreditRole; share: number; email: string }>(list: readonly T[]): T[] {
  const rank = (r: CreditRole) => CREDIT_ROLES.indexOf(r);
  return [...list].sort((a, b) => rank(a.role) - rank(b.role) || b.share - a.share || a.email.localeCompare(b.email));
}

/** Everyone who can hold credit: env owners and every team member (paused people too), email to name. */
export function creditTeam(): Map<string, string | null> {
  const team = new Map<string, string | null>();
  for (const email of env.mockOwnerEmails) team.set(email.toLowerCase(), null);
  for (const a of MOCK_ACCOUNTS) team.set(a.email.toLowerCase(), a.name?.trim() || null);
  return team;
}

export type CreditInput = { email: string; role: CreditRole; share: number };

/**
 * The server's rules (checkCredits): at most 20 rows, everyone on the team,
 * a known role, shares above 0 with two decimals at most, each person once
 * per role, and a total of exactly 100 (or no rows at all).
 */
export function checkCredits(list: readonly CreditInput[], team: ReadonlyMap<string, unknown>): { code: 'credits' | 'total'; message: string } | null {
  if (list.length > MAX_CREDITS) return { code: 'credits', message: CREDIT_MESSAGES.tooMany };
  const seen = new Set<string>();
  let total = 0;
  for (const c of list) {
    if (!team.has(c.email)) return { code: 'credits', message: CREDIT_MESSAGES.email };
    if (!CREDIT_ROLES.includes(c.role)) return { code: 'credits', message: CREDIT_MESSAGES.role };
    const hundredths = shareHundredths(c.share);
    if (hundredths === null || hundredths === 0) return { code: 'credits', message: CREDIT_MESSAGES.share };
    const key = `${c.email}|${c.role}`;
    if (seen.has(key)) return { code: 'credits', message: CREDIT_MESSAGES.duplicate };
    seen.add(key);
    total += hundredths;
  }
  if (list.length > 0 && total !== 10_000) return { code: 'total', message: CREDIT_MESSAGES.total };
  return null;
}

/**
 * The default credits for a client created from a lead: finder and booker
 * each get their share (the same person in both roles gets both rows); only
 * one of them known gets 100 in that role; nobody known gets nothing.
 */
export function defaultCredits(foundBy: string | null | undefined, bookedBy: string | null | undefined, split: CommissionSplit): CreditInput[] {
  const finder = foundBy?.trim().toLowerCase() || null;
  const booker = bookedBy?.trim().toLowerCase() || null;
  if (finder && booker) {
    return [
      { email: finder, role: 'finder' as const, share: split.finder },
      { email: booker, role: 'booker' as const, share: split.booker },
    ].filter((c) => c.share > 0);
  }
  if (finder) return [{ email: finder, role: 'finder', share: 100 }];
  if (booker) return [{ email: booker, role: 'booker', share: 100 }];
  return [];
}

export const creditsOf = (clientId: string): CreditRecord[] => sortCredits(creditsDb.get(clientId) ?? []);

export function creditView(row: CreditRecord, team: ReadonlyMap<string, string | null> = creditTeam()): ClientCredit {
  return { email: row.email, name: team.get(row.email) ?? null, role: row.role, share: row.share };
}

/** The rows this caller may see: all with `clients.credits.view`, else their own (`activity.own`), else none. */
export function visibleCredits(clientId: string, user: MockStaff): { scope: 'all' | 'own'; rows: CreditRecord[] } {
  const rows = creditsOf(clientId);
  if (mockCan(user, 'clients.credits.view')) return { scope: 'all', rows };
  if (mockCan(user, 'activity.own')) return { scope: 'own', rows: rows.filter((r) => r.email === user.email.toLowerCase()) };
  return { scope: 'own', rows: [] };
}

/** The newest change among the rows shown, or null. */
export function newestCredit(rows: readonly CreditRecord[]): string | null {
  let best: string | null = null;
  for (const r of rows) if (best === null || r.updatedAt > best) best = r.updatedAt;
  return best;
}

/** Credit activity names everyone's shares: left out for anyone without `clients.credits.view`. */
export const isCreditActivity = (entry: Pick<Activity, 'event'>) => entry.event.startsWith('credits.');

/** "Noah Lavoie (finder 50), Maya Chen (booker 50)", or "nobody". */
function creditSummary(list: readonly CreditInput[], team: ReadonlyMap<string, string | null>): string {
  if (list.length === 0) return 'nobody';
  return sortCredits(list)
    .map((c) => `${team.get(c.email) || c.email} (${c.role} ${shareText(c.share)})`)
    .join(', ');
}

const sameCredits = (a: readonly CreditInput[], b: readonly CreditInput[]) => {
  const key = (list: readonly CreditInput[]) =>
    list
      .map((c) => `${c.email}|${c.role}|${shareHundredths(c.share)}`)
      .sort()
      .join(',');
  return key(a) === key(b);
};

type Actor = Activity['actor'];
const staffActor = (email: string): Actor => ({ kind: 'staff', name: creditTeam().get(email) ?? null, email });

function write(clientId: string, list: readonly CreditInput[], by: string, at: string) {
  creditsDb.set(
    clientId,
    list.map((c) => ({ email: c.email, role: c.role, share: c.share, updatedAt: at, updatedBy: by })),
  );
}

/**
 * PUT /clients/:id/credits after checkCredits passed: replaces the rows and
 * logs "credits.updated" (internal). The same credits again change and log nothing.
 */
export function saveCredits(c: ClientRecord, list: readonly CreditInput[], note: string, by: string, at = nowIso()): boolean {
  const before = creditsOf(c.id);
  if (sameCredits(before, list)) return false;
  write(c.id, list, by, at);
  const team = creditTeam();
  addActivity(c, {
    event: 'credits.updated',
    summary: `Credits changed to ${creditSummary(list, team)}. Was ${creditSummary(before, team)}. Note: ${note}`,
    actor: staffActor(by),
    visible: false,
    at,
  });
  return true;
}

/**
 * "Create client from this lead": the lead's finder and booker get the
 * default split, only when the client has no credits yet (a reused client
 * keeps any edit). Logged as "credits.created" (internal).
 */
export function creditClientFromLead(c: ClientRecord, lead: Pick<Lead, 'foundBy' | 'bookedBy'>, by: string): CreditInput[] {
  const credits = defaultCredits(lead.foundBy?.email, lead.bookedBy?.email, commissionState.current);
  if (credits.length === 0 || creditsOf(c.id).length > 0) return [];
  const at = nowIso();
  write(c.id, credits, by, at);
  addActivity(c, {
    event: 'credits.created',
    summary: `Credits set from the lead: ${creditSummary(credits, creditTeam())}.`,
    actor: staffActor(by),
    visible: false,
    at,
  });
  return credits;
}

/* ---------- the seed ---------- */

const OWNER = 'owner@tekmadev.test';
const MAYA = 'manager@tekmadev.test';
const NOAH = 'staff@tekmadev.test';

type CreditSeed = { clientId: string; credits: CreditInput[]; edit?: { from: CreditInput[]; note: string; hoursAgo: number } };

/**
 * Credits on clients that came from leads. Most were copied from the lead
 * when the client was created; a few were edited by the owner since (with
 * the note saying why).
 */
const CREDIT_SEEDS: CreditSeed[] = [
  {
    clientId: 'cl_dundaselec',
    credits: [
      { email: NOAH, role: 'finder', share: 50 },
      { email: MAYA, role: 'booker', share: 50 },
    ],
    edit: { from: [{ email: MAYA, role: 'booker', share: 100 }], note: 'Noah met Kevin at the Dundas home show and sent him the booking link.', hoursAgo: 20 },
  },
  { clientId: 'cl_steeltownph', credits: [{ email: NOAH, role: 'booker', share: 100 }] },
  {
    clientId: 'cl_nepeanortho',
    credits: [
      { email: NOAH, role: 'booker', share: 60 },
      { email: MAYA, role: 'other', share: 40 },
    ],
    edit: { from: [{ email: NOAH, role: 'booker', share: 100 }], note: 'Maya ran the discovery call and closed it.', hoursAgo: 24 * 12 },
  },
  { clientId: 'cl_acmeplumb01', credits: [{ email: MAYA, role: 'booker', share: 100 }] },
  { clientId: 'cl_rideaulawn', credits: [{ email: OWNER, role: 'booker', share: 100 }] },
  { clientId: 'cl_bytownroof', credits: [{ email: OWNER, role: 'booker', share: 100 }] },
  {
    clientId: 'cl_barrhavenhm',
    credits: [
      { email: MAYA, role: 'finder', share: 50 },
      { email: NOAH, role: 'booker', share: 50 },
    ],
    edit: { from: [{ email: NOAH, role: 'booker', share: 100 }], note: 'Maya got the referral from Luc at the Barrhaven job.', hoursAgo: 24 * 50 },
  },
];

for (const seed of CREDIT_SEEDS) {
  const c = clientById(seed.clientId);
  if (!c) continue;
  const fromLead = seed.edit?.from ?? seed.credits;
  write(c.id, fromLead, OWNER, c.createdAt);
  addActivity(c, {
    event: 'credits.created',
    summary: `Credits set from the lead: ${creditSummary(fromLead, creditTeam())}.`,
    actor: staffActor(OWNER),
    visible: false,
    at: c.createdAt,
  });
  if (seed.edit) saveCredits(c, seed.credits, seed.edit.note, OWNER, hoursAgo(seed.edit.hoursAgo));
}

/** Noah's onboarding help this month: tasks, a call log and a note (the board's "clients helped"). */
const HELP: [clientId: string, days: number, event: string, summary: string, kind?: 'note'][] = [
  ['cl_acmeplumb01', 1, 'task.status', 'Collect the logo files: waiting on the client.'],
  ['cl_steeltownph', 2, 'note', 'Called Aisha to confirm the photo shoot for Thursday.', 'note'],
  ['cl_nepeanortho', 5, 'call.logged', 'Logged a booked call from the website.'],
  ['cl_rideaulawn', 12, 'task.done', 'Confirm the service area: done.'],
];
for (const [clientId, days, event, summary, kind] of HELP) {
  const c = clientById(clientId);
  if (!c) continue;
  addActivity(c, { kind: kind ?? 'event', event, summary, text: kind === 'note' ? summary : null, actor: staffActor(NOAH), visible: false, at: daysAgo(days, 3) });
}
