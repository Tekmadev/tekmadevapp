import {
  formatDateTime,
  instantToTorontoWall,
  toDate,
  torontoDateOf,
  torontoWallTimeToInstant,
  weekdayName,
  weekdayOf,
} from '@/lib/dates';

import { toCalendarDate } from './calendarMath';
import type { ClockTime } from './time';

/**
 * Date and time picking for DateTimeField. The user picks a Toronto calendar
 * date and a Toronto wall-clock time; only torontoWallTimeToInstant() turns
 * them into the ISO instant the API wants, so the phone's own time zone never
 * takes part (brief section 4, Time).
 */

export type DateTimeDraft = { date: string; time: ClockTime };

/** The Toronto date and time an instant shows, or null when it is not a valid instant. */
export function splitInstant(instant: string | null | undefined): DateTimeDraft | null {
  if (!instant || !toDate(instant)) return null;
  const w = instantToTorontoWall(instant);
  return { date: toCalendarDate(w.year, w.month, w.day), time: { hour: w.hour, minute: w.minute } };
}

/**
 * The ISO UTC instant for a Toronto date and time. A time skipped by the spring
 * DST jump (2:30 AM) lands an hour later, an ambiguous fall-back time on the
 * first one (see torontoWallTimeToInstant).
 */
export function combineToInstant(date: string, time: ClockTime): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return torontoWallTimeToInstant({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: time.hour,
    minute: time.minute,
  });
}

/** "Thu, Oct 8, 10:00 AM" (year added when not this year): what a date and time field shows. */
export function formatFieldDateTime(instant: string, now: Date = new Date()): string {
  const day = weekdayName(weekdayOf(torontoDateOf(instant))).slice(0, 3);
  return `${day}, ${formatDateTime(instant, now)}`;
}

/** Whole milliseconds of an instant, or null. */
const ms = (instant: string | null | undefined) => toDate(instant ?? null)?.getTime() ?? null;

/**
 * "Pick a time after Oct 8, 2:41 PM." for an instant outside min/max (inclusive
 * bounds), or null when it is fine or empty.
 */
export function dateTimeRangeError(
  instant: string | null | undefined,
  min?: string | null,
  max?: string | null,
  now: Date = new Date(),
): string | null {
  const t = ms(instant);
  if (t == null) return null;
  const lo = ms(min);
  const hi = ms(max);
  if (lo != null && t < lo) return `Pick a time after ${formatDateTime(min as string, now)}.`;
  if (hi != null && t > hi) return `Pick a time before ${formatDateTime(max as string, now)}.`;
  return null;
}

/** The first quarter hour at or after an instant, as a Toronto date and time (a sensible start for a "future" field). */
export function nextQuarterHour(instant: string | Date): DateTimeDraft {
  const d = toDate(instant) ?? new Date();
  const quarter = 15 * 60_000;
  const rounded = new Date(Math.ceil(d.getTime() / quarter) * quarter).toISOString();
  return splitInstant(rounded) as DateTimeDraft;
}
