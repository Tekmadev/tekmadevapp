import { addDays, monthName, monthShort, parseCalendarDate, weekdayName, weekdayOf } from '@/lib/dates';

/**
 * Calendar math for DateField and DateTimeField.
 *
 * Everything works on `YYYY-MM-DD` strings (a Toronto calendar date) and plain
 * year/month numbers, never on a local Date, so the phone's time zone can never
 * shift a day. `YYYY-MM-DD` strings compare correctly as text, which keeps the
 * range checks cheap.
 */

export type YearMonth = { year: number; month: number };

/** Weeks start on Sunday (en-CA). */
export const WEEK_STARTS_ON = 0;

/** Every month is drawn as 6 rows so the sheet never changes height between months. */
export const GRID_CELLS = 42;

const pad = (n: number) => String(n).padStart(2, '0');

export function toCalendarDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function monthOf(date: string): YearMonth {
  const p = parseCalendarDate(date);
  return p ? { year: p.year, month: p.month } : { year: 1970, month: 1 };
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Negative when a is before b, 0 for the same month. */
export function compareMonth(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function daysInMonth(ym: YearMonth): number {
  // Day 0 of the next month is the last day of this one (UTC, no zone involved).
  return new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
}

/**
 * The 42 cells of a month grid, Sunday first. Days that belong to the
 * neighbouring months are null (drawn blank).
 */
export function monthGrid(ym: YearMonth, weekStartsOn: number = WEEK_STARTS_ON): (string | null)[] {
  const first = toCalendarDate(ym.year, ym.month, 1);
  const lead = (weekdayOf(first) - weekStartsOn + 7) % 7;
  const total = daysInMonth(ym);
  const cells: (string | null)[] = [];
  for (let i = 0; i < GRID_CELLS; i++) {
    const day = i - lead + 1;
    cells.push(day >= 1 && day <= total ? addDays(first, day - 1) : null);
  }
  return cells;
}

/** One-letter weekday headers in grid order: S M T W T F S. */
export function weekdayInitials(weekStartsOn: number = WEEK_STARTS_ON): { short: string; name: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const name = weekdayName((i + weekStartsOn) % 7);
    return { short: name.slice(0, 1), name };
  });
}

export function isDateInRange(date: string, min?: string | null, max?: string | null): boolean {
  if (min && date < min) return false;
  if (max && date > max) return false;
  return true;
}

export function clampDate(date: string, min?: string | null, max?: string | null): string {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

/** Whether the month after shifting still holds at least one selectable day. */
export function canShowMonth(ym: YearMonth, min?: string | null, max?: string | null): boolean {
  if (min && compareMonth(ym, monthOf(min)) < 0) return false;
  if (max && compareMonth(ym, monthOf(max)) > 0) return false;
  return true;
}

/** "September 2026" */
export function formatMonthTitle(ym: YearMonth): string {
  return `${monthName(ym.month)} ${ym.year}`;
}

/** "Wed, Sep 30, 2026": what a date field shows. */
export function formatFieldDate(date: string): string {
  const p = parseCalendarDate(date);
  if (!p) return date;
  return `${weekdayName(weekdayOf(date)).slice(0, 3)}, ${monthShort(p.month)} ${p.day}, ${p.year}`;
}

/** "Wednesday, September 30, 2026": what TalkBack reads for a day cell. */
export function formatSpokenDate(date: string): string {
  const p = parseCalendarDate(date);
  if (!p) return date;
  return `${weekdayName(weekdayOf(date))}, ${monthName(p.month)} ${p.day}, ${p.year}`;
}

/** "Pick a date on or after Oct 2, 2026." for a date outside min/max, or null when it is fine (or empty). */
export function dateRangeError(date: string | null | undefined, min?: string | null, max?: string | null): string | null {
  if (!date) return null;
  if (min && date < min) return `Pick a date on or after ${formatShortFieldDate(min)}.`;
  if (max && date > max) return `Pick a date on or before ${formatShortFieldDate(max)}.`;
  return null;
}

/** "Oct 2, 2026": always with the year, so a range message is never ambiguous. */
function formatShortFieldDate(date: string): string {
  const p = parseCalendarDate(date);
  return p ? `${monthShort(p.month)} ${p.day}, ${p.year}` : date;
}
