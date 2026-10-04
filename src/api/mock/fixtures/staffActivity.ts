import { addDays, parseCalendarDate, todayToronto, torontoDateOf, torontoWallTimeToInstant } from '@/lib/dates';

import type { Role } from '../../types';
import type { ActivityRange, StaffActivity, StaffActivityRow } from '../../schemas/team';
import { clientsDb } from './clients';
import { creditsOf } from './credits';
import { leadBookedAt, leadsDb, leadTouchesDb } from './leads';

/**
 * The activity board for the mock (the website's lib/staff-activity.ts and
 * docs/admin-api/staff.md section 5), counted from the same in-memory data
 * the other screens show: leads found and booked, touches, follow-ups,
 * credits on clients won and the client activity behind "clients helped".
 */

export const ACTIVITY_RANGES: readonly ActivityRange[] = ['7d', '30d', 'all'];
export const RANGE_MESSAGE = 'Pick 7d, 30d or all.';

export type ActivityPerson = { email: string; name: string | null; role: Role; paused: boolean };

/** Instants with microseconds, compared as milliseconds. */
const ms = (instant: string) => Date.parse(instant.replace(/(\.\d{3})\d+/, '$1'));

/** Toronto midnight `days` calendar days before today, as an instant. */
function torontoMidnight(today: string, days: number): string {
  const p = parseCalendarDate(addDays(today, -days));
  if (!p) throw new Error('staff activity: bad date');
  return torontoWallTimeToInstant({ ...p, hour: 0, minute: 0 });
}

/** Where a range starts: today and the 6 (or 29) days before it from midnight, or null for all time. */
export function rangeStart(range: ActivityRange, today: string): string | null {
  if (range === 'all') return null;
  return torontoMidnight(today, range === '7d' ? 6 : 29);
}

/** What counts as helping on a client: a task changed or added, a call logged, a note or an update written. */
const HELP_EVENTS = new Set(['task.added', 'task.status', 'task.done', 'call.logged', 'note', 'update']);

function rowFor(person: ActivityPerson, sinceMs: number, today: string): StaffActivityRow {
  const email = person.email.toLowerCase();
  const inRange = (instant: string | null | undefined) => !!instant && ms(instant) >= sinceMs;

  const leadsFound = leadsDb.filter((l) => l.foundBy?.email.toLowerCase() === email && inRange(l.createdAt)).length;

  const touches = { call: 0, email: 0, dm: 0, meeting: 0, other: 0, total: 0 };
  for (const t of leadTouchesDb) {
    if (t.by.email.toLowerCase() !== email || !inRange(t.at)) continue;
    touches[t.kind] += 1;
    touches.total += 1;
  }

  const followUps = { dueToday: 0, overdue: 0 };
  for (const l of leadsDb) {
    if (l.assignedTo?.email.toLowerCase() !== email || !l.followUpAt) continue;
    const day = torontoDateOf(ms(l.followUpAt));
    if (day === today) followUps.dueToday += 1;
    else if (day < today) followUps.overdue += 1;
  }

  const callsBooked = leadsDb.filter((l) => l.bookedBy?.email.toLowerCase() === email && inRange(leadBookedAt.get(l.id))).length;

  // Clients won: real, live (not trashed) clients created in the range, newest first.
  const won = clientsDb.clients
    .filter((c) => !c.deletedAt && !c.isTest && inRange(c.createdAt))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const credits: StaffActivityRow['credits'] = [];
  let hundredths = 0;
  for (const c of won) {
    for (const r of creditsOf(c.id)) {
      if (r.email !== email) continue;
      credits.push({ clientId: c.id, businessName: c.businessName, role: r.role, share: r.share, wonAt: c.createdAt });
      hundredths += Math.round(r.share * 100);
    }
  }

  const testIds = new Set(clientsDb.clients.filter((c) => c.isTest).map((c) => c.id));
  const helped = new Set<string>();
  for (const a of clientsDb.activity) {
    if (a.actor.email?.toLowerCase() !== email || !HELP_EVENTS.has(a.event) || testIds.has(a.clientId) || !inRange(a.createdAt)) continue;
    helped.add(a.clientId);
  }

  return {
    email,
    name: person.name,
    role: person.role,
    paused: person.paused,
    leadsFound,
    touches,
    followUps,
    callsBooked,
    clientsWon: hundredths / 10_000,
    clientsHelped: helped.size,
    credits,
  };
}

const display = (row: { name: string | null; email: string }) => (row.name ?? row.email).toLowerCase();

/** The server's order: most clients won, then calls booked, touches and leads found; ties by name. */
export function byScore(a: StaffActivityRow, b: StaffActivityRow): number {
  return (
    b.clientsWon - a.clientsWon ||
    b.callsBooked - a.callsBooked ||
    b.touches.total - a.touches.total ||
    b.leadsFound - a.leadsFound ||
    display(a).localeCompare(display(b), 'en')
  );
}

/** The board for these people over a range (GET /team/activity, GET /me/activity). */
export function staffActivity(people: readonly ActivityPerson[], range: ActivityRange, now: Date = new Date()): StaffActivity {
  const today = todayToronto(now);
  const since = rangeStart(range, today);
  const sinceMs = since ? ms(since) : -Infinity;
  return { range, since, today, rows: people.map((p) => rowFor(p, sinceMs, today)).sort(byScore) };
}
