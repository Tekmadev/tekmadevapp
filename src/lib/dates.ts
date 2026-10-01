/**
 * Every date and time in the app is shown in America/Toronto, whatever the phone
 * is set to. Hermes on Android supports Intl.DateTimeFormat with `timeZone` and
 * `formatToParts` (nothing else from Intl beyond NumberFormat), so everything here
 * is built on those two.
 *
 * Conventions from the API:
 * - Instants are ISO 8601 UTC strings (often with microseconds): parse with toDate().
 * - Calendar dates are `YYYY-MM-DD` and mean a Toronto calendar date: never shift
 *   them through a time zone, format them with formatCalendarDate().
 * - Chart labels like `2026-09-30T14:00:00` (no offset) are text: never parse them.
 */

export const TZ = 'America/Toronto';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type WallTime = { year: number; month: number; day: number; hour: number; minute: number };
type Parts = WallTime & { second: number; weekday: number };

let partsFormatter: Intl.DateTimeFormat | null = null;
function formatter() {
  if (!partsFormatter) {
    partsFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
  }
  return partsFormatter;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Parse an ISO instant (any fractional precision). Returns null when invalid. */
export function toDate(input: string | Date | number | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') return new Date(input);
  // Trim fractional seconds to milliseconds; Hermes rejects 6 digits in some versions.
  const normalized = input.replace(/(\.\d{3})\d+/, '$1');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The Toronto wall-clock parts of an instant. */
export function torontoParts(input: string | Date | number): Parts {
  const d = toDate(input) ?? new Date(0);
  const out: Partial<Parts> = {};
  for (const p of formatter().formatToParts(d)) {
    switch (p.type) {
      case 'year':
        out.year = Number(p.value);
        break;
      case 'month':
        out.month = Number(p.value);
        break;
      case 'day':
        out.day = Number(p.value);
        break;
      case 'hour':
        out.hour = Number(p.value) % 24;
        break;
      case 'minute':
        out.minute = Number(p.value);
        break;
      case 'second':
        out.second = Number(p.value);
        break;
      case 'weekday':
        out.weekday = WEEKDAY_INDEX[p.value] ?? 0;
        break;
    }
  }
  return out as Parts;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Toronto calendar date of an instant as `YYYY-MM-DD`. */
export function torontoDateOf(input: string | Date | number): string {
  const p = torontoParts(input);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Today's Toronto calendar date. */
export function todayToronto(now: Date = new Date()): string {
  return torontoDateOf(now);
}

export function parseCalendarDate(date: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Day number since the epoch for a calendar date (UTC arithmetic, no zone shift). */
function dayNumber(date: string): number {
  const p = parseCalendarDate(date);
  if (!p) return NaN;
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
}

/** `b - a` in whole calendar days. */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

export function addDays(date: string, days: number): string {
  const p = parseCalendarDate(date);
  if (!p) return date;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Weekday index (0 = Sunday) of a calendar date. */
export function weekdayOf(date: string): number {
  const p = parseCalendarDate(date);
  if (!p) return 0;
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/**
 * Offset of Toronto from UTC, in minutes, at a given instant (EST = -300, EDT = -240).
 */
function torontoOffsetMinutes(utcMs: number): number {
  const p = torontoParts(new Date(utcMs));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/**
 * A Toronto wall time (what the user picked) to an ISO UTC instant.
 * Handles DST: a time skipped by the spring-forward jump resolves to the
 * instant one hour later; an ambiguous fall-back time resolves to the first one.
 */
export function torontoWallTimeToInstant(wall: WallTime): string {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // The offsets in force a little before and after this wall time (they differ only on DST days).
  const before = torontoOffsetMinutes(naive - 12 * 3_600_000);
  const after = torontoOffsetMinutes(naive + 12 * 3_600_000);
  const candidates = Array.from(new Set([naive - before * 60_000, naive - after * 60_000])).sort((a, b) => a - b);
  const shows = (ms: number) => {
    const p = torontoParts(new Date(ms));
    return p.year === wall.year && p.month === wall.month && p.day === wall.day && p.hour === wall.hour && p.minute === wall.minute;
  };
  // Ambiguous (fall back): the earliest instant that shows this wall time.
  const match = candidates.find(shows);
  // Skipped (spring forward): applying the pre-change offset moves it forward an hour.
  return new Date(match ?? naive - before * 60_000).toISOString();
}

export function instantToTorontoWall(input: string | Date): WallTime {
  const p = torontoParts(input);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute };
}

/* ---------- formatting ---------- */

function hour12(h: number) {
  const x = h % 12;
  return x === 0 ? 12 : x;
}

/** "2:41 PM" */
export function formatTime(input: string | Date): string {
  const p = torontoParts(input);
  return `${hour12(p.hour)}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** "Sep 30" this year, "Sep 30, 2025" otherwise. */
export function formatShortDate(input: string | Date, now: Date = new Date()): string {
  const p = torontoParts(input);
  const y = torontoParts(now).year;
  return p.year === y ? `${MONTHS_SHORT[p.month - 1]} ${p.day}` : `${MONTHS_SHORT[p.month - 1]} ${p.day}, ${p.year}`;
}

/** "Sep 30, 2026" */
export function formatDate(input: string | Date): string {
  const p = torontoParts(input);
  return `${MONTHS_SHORT[p.month - 1]} ${p.day}, ${p.year}`;
}

/** "Sep 30, 2:41 PM" (year added when not the current year). */
export function formatDateTime(input: string | Date, now: Date = new Date()): string {
  return `${formatShortDate(input, now)}, ${formatTime(input)}`;
}

/** A Toronto calendar date `YYYY-MM-DD`: "Sep 12" (or "Sep 12, 2025"). No zone shift. */
export function formatCalendarDate(date: string | null | undefined, now: Date = new Date(), withYear = false): string {
  if (!date) return '';
  const p = parseCalendarDate(date);
  if (!p) return date;
  const y = torontoParts(now).year;
  return p.year === y && !withYear ? `${MONTHS_SHORT[p.month - 1]} ${p.day}` : `${MONTHS_SHORT[p.month - 1]} ${p.day}, ${p.year}`;
}

/** "WEDNESDAY, SEPTEMBER 30" for the Home eyebrow. */
export function eyebrowDate(now: Date = new Date()): string {
  const p = torontoParts(now);
  return `${WEEKDAYS[p.weekday]}, ${MONTHS[p.month - 1]} ${p.day}`.toUpperCase();
}

/** "Good morning" / "Good afternoon" / "Good evening" by the Toronto hour. */
export function greeting(now: Date = new Date()): string {
  const h = torontoParts(now).hour;
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Inbox day groups: "Today", "Yesterday", "Monday, September 28" (plus year when not this year). */
export function dayGroupLabel(input: string | Date, now: Date = new Date()): string {
  const day = torontoDateOf(input);
  const today = todayToronto(now);
  const diff = daysBetween(day, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const p = torontoParts(input);
  const base = `${WEEKDAYS[p.weekday]}, ${MONTHS[p.month - 1]} ${p.day}`;
  return p.year === torontoParts(now).year ? base : `${base}, ${p.year}`;
}

/** Compact relative time: "just now", "5 min ago", "3 h ago", "Yesterday", "Sep 28". */
export function relativeTime(input: string | Date, now: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return '';
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) {
    // Future instants (bookings, expiries).
    const ahead = -diffMs;
    // Clamped so 59.6 minutes never reads "in 60 min".
    if (ahead < 60 * 60_000) return `in ${Math.min(59, Math.max(1, Math.round(ahead / 60_000)))} min`;
    const days = daysBetween(todayToronto(now), torontoDateOf(d));
    if (days === 0) return `today ${formatTime(d)}`;
    if (days === 1) return `tomorrow ${formatTime(d)}`;
    return formatShortDate(d, now);
  }
  if (diffMs < 45_000) return 'just now';
  // Whole elapsed units (floor), so 59.6 minutes is "59 min ago", never "60 min ago".
  if (diffMs < 60 * 60_000) return `${Math.max(1, Math.floor(diffMs / 60_000))} min ago`;
  const days = daysBetween(torontoDateOf(d), todayToronto(now));
  if (days === 0) return `${Math.floor(diffMs / 3_600_000)} h ago`;
  if (days === 1) return 'Yesterday';
  return formatShortDate(d, now);
}

/** Calendar-day distance from today: positive = in the future ("8d to live"), negative = past ("3d late"). */
export function daysFromToday(date: string, now: Date = new Date()): number {
  return daysBetween(todayToronto(now), date);
}

export const monthName = (month: number) => MONTHS[month - 1] ?? '';
export const monthShort = (month: number) => MONTHS_SHORT[month - 1] ?? '';
export const weekdayName = (index: number) => WEEKDAYS[index] ?? '';
