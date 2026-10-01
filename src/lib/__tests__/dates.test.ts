import {
  addDays,
  dayGroupLabel,
  daysBetween,
  daysFromToday,
  eyebrowDate,
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatShortDate,
  formatTime,
  greeting,
  instantToTorontoWall,
  monthName,
  monthShort,
  parseCalendarDate,
  relativeTime,
  toDate,
  todayToronto,
  torontoDateOf,
  torontoParts,
  torontoWallTimeToInstant,
  weekdayName,
  weekdayOf,
  type WallTime,
} from '@/lib/dates';

/*
 * Every expectation here is in America/Toronto and must hold whatever zone the
 * machine running the tests is in. `now` is always a fixed instant.
 *
 * 2026 DST in Toronto: spring forward Sunday March 8 at 2:00 (EST -5 to EDT -4),
 * fall back Sunday November 1 at 2:00 (EDT -4 to EST -5).
 */

const at = (iso: string) => new Date(iso);
const wall = (year: number, month: number, day: number, hour: number, minute: number): WallTime => ({ year, month, day, hour, minute });

// Wednesday September 30, 2026, 4:00 PM in Toronto (EDT).
const NOW = at('2026-09-30T20:00:00Z');

describe('toDate', () => {
  it('parses microsecond ISO strings from the server', () => {
    expect(toDate('2026-09-30T14:03:22.123456Z')?.toISOString()).toBe('2026-09-30T14:03:22.123Z');
    expect(toDate('2026-09-30T14:03:22.999999Z')?.toISOString()).toBe('2026-09-30T14:03:22.999Z');
    expect(toDate('2026-09-30T10:03:22.123456-04:00')?.toISOString()).toBe('2026-09-30T14:03:22.123Z');
    expect(toDate('2026-09-30T14:03:22.123456+00:00')?.toISOString()).toBe('2026-09-30T14:03:22.123Z');
  });

  it('parses other precisions', () => {
    expect(toDate('2026-09-30T14:03:22Z')?.toISOString()).toBe('2026-09-30T14:03:22.000Z');
    expect(toDate('2026-09-30T14:03:22.1Z')?.toISOString()).toBe('2026-09-30T14:03:22.100Z');
    expect(toDate('2026-09-30T14:03:22.123Z')?.toISOString()).toBe('2026-09-30T14:03:22.123Z');
  });

  it('accepts dates and epoch milliseconds', () => {
    const d = at('2026-09-30T14:00:00Z');
    expect(toDate(d)).toBe(d);
    expect(toDate(d.getTime())?.toISOString()).toBe('2026-09-30T14:00:00.000Z');
  });

  it('returns null for missing or invalid input', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('')).toBeNull();
    expect(toDate('not a date')).toBeNull();
    expect(toDate(new Date('nope'))).toBeNull();
  });
});

describe('torontoParts', () => {
  it('gives the Toronto wall clock in summer (EDT)', () => {
    expect(torontoParts('2026-09-30T18:41:22.123456Z')).toEqual({
      year: 2026,
      month: 9,
      day: 30,
      hour: 14,
      minute: 41,
      second: 22,
      weekday: 3,
    });
  });

  it('gives the Toronto wall clock in winter (EST)', () => {
    expect(torontoParts('2026-01-15T15:00:00Z')).toMatchObject({ year: 2026, month: 1, day: 15, hour: 10, minute: 0, weekday: 4 });
  });

  it('crosses the UTC midnight boundary into the previous Toronto day', () => {
    expect(torontoParts('2026-10-01T03:30:00Z')).toMatchObject({ year: 2026, month: 9, day: 30, hour: 23, minute: 30, weekday: 3 });
    expect(torontoParts('2027-01-01T04:59:59Z')).toMatchObject({ year: 2026, month: 12, day: 31, hour: 23, second: 59 });
  });

  it('reports midnight as hour 0, not 24', () => {
    expect(torontoParts('2026-09-30T04:00:00Z')).toMatchObject({ day: 30, hour: 0, minute: 0 });
  });

  it('accepts Date objects and epoch milliseconds', () => {
    expect(torontoParts(at('2026-09-30T18:41:00Z')).hour).toBe(14);
    expect(torontoParts(Date.UTC(2026, 8, 30, 18, 41)).hour).toBe(14);
  });
});

describe('todayToronto and torontoDateOf', () => {
  it('stays on the Toronto day until Toronto midnight (EDT, UTC-4)', () => {
    expect(todayToronto(at('2026-10-01T03:59:59Z'))).toBe('2026-09-30');
    expect(todayToronto(at('2026-10-01T04:00:00Z'))).toBe('2026-10-01');
  });

  it('stays on the Toronto day until Toronto midnight (EST, UTC-5)', () => {
    expect(todayToronto(at('2026-01-16T04:59:59Z'))).toBe('2026-01-15');
    expect(todayToronto(at('2026-01-16T05:00:00Z'))).toBe('2026-01-16');
  });

  it('turns the year in Toronto, not in UTC', () => {
    expect(todayToronto(at('2027-01-01T03:00:00Z'))).toBe('2026-12-31');
    expect(torontoDateOf('2027-01-01T05:00:00Z')).toBe('2027-01-01');
  });

  it('formats single-digit months and days with zeros', () => {
    expect(torontoDateOf('2026-03-05T17:00:00Z')).toBe('2026-03-05');
  });
});

describe('calendar dates (YYYY-MM-DD)', () => {
  it('parses only the exact format', () => {
    expect(parseCalendarDate('2026-09-30')).toEqual({ year: 2026, month: 9, day: 30 });
    expect(parseCalendarDate('2026-9-30')).toBeNull();
    expect(parseCalendarDate('2026-09-30T00:00:00Z')).toBeNull();
    expect(parseCalendarDate('')).toBeNull();
  });

  it('daysBetween counts calendar days across months and years', () => {
    expect(daysBetween('2026-09-30', '2026-09-30')).toBe(0);
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-01', '2026-09-30')).toBe(-1);
    expect(daysBetween('2026-01-31', '2026-03-01')).toBe(29);
    expect(daysBetween('2028-01-31', '2028-03-01')).toBe(30);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('daysBetween ignores DST (a 23 or 25 hour day is still one day)', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
  });

  it('daysBetween is NaN for invalid dates', () => {
    expect(daysBetween('nope', '2026-09-30')).toBeNaN();
  });

  it('addDays moves across months, years, leap days and DST', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-09-30', 0)).toBe('2026-09-30');
    expect(addDays('2026-09-30', 365)).toBe('2027-09-30');
  });

  it('addDays leaves invalid input as it is', () => {
    expect(addDays('soon', 3)).toBe('soon');
  });

  it('weekdayOf reads the calendar, not a zone', () => {
    expect(weekdayOf('2026-09-28')).toBe(1);
    expect(weekdayOf('2026-09-30')).toBe(3);
    expect(weekdayOf('2026-01-01')).toBe(4);
  });

  it('daysFromToday is relative to the Toronto day', () => {
    // 11:30 PM on September 30 in Toronto, already October 1 in UTC.
    const lateNight = at('2026-10-01T03:30:00Z');
    expect(daysFromToday('2026-09-30', lateNight)).toBe(0);
    expect(daysFromToday('2026-10-08', lateNight)).toBe(8);
    expect(daysFromToday('2026-09-27', lateNight)).toBe(-3);
  });
});

describe('torontoWallTimeToInstant', () => {
  it('converts winter times with EST (UTC-5)', () => {
    expect(torontoWallTimeToInstant(wall(2026, 1, 15, 10, 0))).toBe('2026-01-15T15:00:00.000Z');
    expect(torontoWallTimeToInstant(wall(2026, 12, 31, 23, 30))).toBe('2027-01-01T04:30:00.000Z');
  });

  it('converts summer times with EDT (UTC-4)', () => {
    expect(torontoWallTimeToInstant(wall(2026, 9, 30, 10, 0))).toBe('2026-09-30T14:00:00.000Z');
    expect(torontoWallTimeToInstant(wall(2026, 7, 1, 0, 0))).toBe('2026-07-01T04:00:00.000Z');
  });

  it('handles the hours around spring forward', () => {
    expect(torontoWallTimeToInstant(wall(2026, 3, 7, 23, 0))).toBe('2026-03-08T04:00:00.000Z');
    expect(torontoWallTimeToInstant(wall(2026, 3, 8, 1, 59))).toBe('2026-03-08T06:59:00.000Z');
    expect(torontoWallTimeToInstant(wall(2026, 3, 8, 3, 0))).toBe('2026-03-08T07:00:00.000Z');
    expect(torontoWallTimeToInstant(wall(2026, 3, 8, 12, 0))).toBe('2026-03-08T16:00:00.000Z');
  });

  it('moves a time in the skipped spring-forward hour one hour forward', () => {
    // 2:30 AM never happens on March 8: it resolves to 3:30 AM EDT.
    const instant = torontoWallTimeToInstant(wall(2026, 3, 8, 2, 30));
    expect(instant).toBe('2026-03-08T07:30:00.000Z');
    expect(instantToTorontoWall(instant)).toEqual(wall(2026, 3, 8, 3, 30));
    expect(torontoWallTimeToInstant(wall(2026, 3, 8, 2, 0))).toBe('2026-03-08T07:00:00.000Z');
  });

  it('resolves the ambiguous fall-back hour to its first occurrence (EDT)', () => {
    // 1:30 AM happens twice on November 1: 05:30Z (EDT) and 06:30Z (EST).
    expect(torontoWallTimeToInstant(wall(2026, 11, 1, 1, 30))).toBe('2026-11-01T05:30:00.000Z');
    expect(torontoWallTimeToInstant(wall(2026, 11, 1, 1, 0))).toBe('2026-11-01T05:00:00.000Z');
  });

  it('handles the hours around fall back', () => {
    expect(torontoWallTimeToInstant(wall(2026, 11, 1, 0, 30))).toBe('2026-11-01T04:30:00.000Z');
    // 2:00 AM only exists once, after the clocks went back (EST).
    expect(torontoWallTimeToInstant(wall(2026, 11, 1, 2, 0))).toBe('2026-11-01T07:00:00.000Z');
    expect(torontoWallTimeToInstant(wall(2026, 10, 31, 23, 30))).toBe('2026-11-01T03:30:00.000Z');
    expect(torontoWallTimeToInstant(wall(2026, 11, 2, 0, 30))).toBe('2026-11-02T05:30:00.000Z');
  });

  it('round trips with instantToTorontoWall', () => {
    for (const iso of [
      '2026-01-15T15:00:00.000Z',
      '2026-03-08T06:59:00.000Z',
      '2026-03-08T07:00:00.000Z',
      '2026-06-21T03:59:00.000Z',
      '2026-09-30T18:41:00.000Z',
      '2026-11-01T05:30:00.000Z',
      '2026-11-01T07:00:00.000Z',
      '2026-12-31T23:59:00.000Z',
      '2027-01-01T04:59:00.000Z',
    ]) {
      expect(torontoWallTimeToInstant(instantToTorontoWall(iso))).toBe(iso);
    }
  });

  it('round trips every wall time of a DST day that exists once', () => {
    for (let hour = 0; hour < 24; hour++) {
      if (hour === 2) continue; // skipped on March 8
      const w = wall(2026, 3, 8, hour, 15);
      expect(instantToTorontoWall(torontoWallTimeToInstant(w))).toEqual(w);
    }
    for (let hour = 0; hour < 24; hour++) {
      const w = wall(2026, 11, 1, hour, 45);
      expect(instantToTorontoWall(torontoWallTimeToInstant(w))).toEqual(w);
    }
  });

  it('maps the second 1:30 AM back to the first (documented choice)', () => {
    expect(instantToTorontoWall('2026-11-01T06:30:00Z')).toEqual(wall(2026, 11, 1, 1, 30));
    expect(torontoWallTimeToInstant(instantToTorontoWall('2026-11-01T06:30:00Z'))).toBe('2026-11-01T05:30:00.000Z');
  });
});

describe('formatting', () => {
  it('formatTime', () => {
    expect(formatTime('2026-09-30T18:41:22.123456Z')).toBe('2:41 PM');
    expect(formatTime('2026-09-30T04:00:00Z')).toBe('12:00 AM');
    expect(formatTime('2026-09-30T16:00:00Z')).toBe('12:00 PM');
    expect(formatTime('2026-09-30T15:59:00Z')).toBe('11:59 AM');
    expect(formatTime('2026-01-15T14:05:00Z')).toBe('9:05 AM');
    expect(formatTime(at('2026-10-01T03:30:00Z'))).toBe('11:30 PM');
  });

  it('formatDate shows the Toronto day, not the UTC day', () => {
    expect(formatDate('2026-09-30T18:00:00Z')).toBe('Sep 30, 2026');
    expect(formatDate('2026-10-01T03:00:00Z')).toBe('Sep 30, 2026');
    expect(formatDate('2027-01-01T04:00:00Z')).toBe('Dec 31, 2026');
  });

  it('formatShortDate adds the year only when it is not this year', () => {
    expect(formatShortDate('2026-09-30T18:00:00Z', NOW)).toBe('Sep 30');
    expect(formatShortDate('2026-03-05T18:00:00Z', NOW)).toBe('Mar 5');
    expect(formatShortDate('2025-12-31T18:00:00Z', NOW)).toBe('Dec 31, 2025');
    // Already 2026 in UTC, still 2025 in Toronto.
    expect(formatShortDate('2026-01-01T03:00:00Z', NOW)).toBe('Dec 31, 2025');
  });

  it('formatDateTime', () => {
    expect(formatDateTime('2026-09-30T18:41:00Z', NOW)).toBe('Sep 30, 2:41 PM');
    expect(formatDateTime('2025-11-02T14:05:00Z', NOW)).toBe('Nov 2, 2025, 9:05 AM');
  });

  it('formatCalendarDate never shifts a calendar date by a zone', () => {
    // new Date('2026-01-01') is midnight UTC, which is still December 31 in Toronto.
    expect(formatCalendarDate('2026-01-01', NOW)).toBe('Jan 1');
    expect(formatCalendarDate('2026-09-12', NOW)).toBe('Sep 12');
    expect(formatCalendarDate('2026-09-12', NOW, true)).toBe('Sep 12, 2026');
    expect(formatCalendarDate('2025-12-31', NOW)).toBe('Dec 31, 2025');
    expect(formatCalendarDate('2027-03-01', NOW)).toBe('Mar 1, 2027');
  });

  it('formatCalendarDate decides "this year" in Toronto', () => {
    // 10 PM on December 31 in Toronto, already 2027 in UTC.
    expect(formatCalendarDate('2026-12-31', at('2027-01-01T03:00:00Z'))).toBe('Dec 31');
  });

  it('formatCalendarDate passes through empty or unexpected values', () => {
    expect(formatCalendarDate(null, NOW)).toBe('');
    expect(formatCalendarDate(undefined, NOW)).toBe('');
    expect(formatCalendarDate('', NOW)).toBe('');
    expect(formatCalendarDate('soon', NOW)).toBe('soon');
  });

  it('eyebrowDate is the Toronto day in capitals', () => {
    expect(eyebrowDate(NOW)).toBe('WEDNESDAY, SEPTEMBER 30');
    expect(eyebrowDate(at('2026-10-01T03:30:00Z'))).toBe('WEDNESDAY, SEPTEMBER 30');
    expect(eyebrowDate(at('2026-10-01T04:00:00Z'))).toBe('THURSDAY, OCTOBER 1');
  });

  it('name helpers', () => {
    expect(monthName(9)).toBe('September');
    expect(monthShort(9)).toBe('Sep');
    expect(weekdayName(0)).toBe('Sunday');
    expect(monthName(13)).toBe('');
    expect(weekdayName(7)).toBe('');
  });
});

describe('greeting', () => {
  // Toronto hour h on September 30 (EDT) is UTC h + 4.
  const edt = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 30, h + 4, m));
  // Toronto hour h on January 15 (EST) is UTC h + 5.
  const est = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 15, h + 5, m));

  it('switches at 5:00, 12:00 and 17:00 Toronto time', () => {
    for (const toronto of [edt, est]) {
      expect(greeting(toronto(0, 0))).toBe('Good evening');
      expect(greeting(toronto(4, 59))).toBe('Good evening');
      expect(greeting(toronto(5, 0))).toBe('Good morning');
      expect(greeting(toronto(11, 59))).toBe('Good morning');
      expect(greeting(toronto(12, 0))).toBe('Good afternoon');
      expect(greeting(toronto(16, 59))).toBe('Good afternoon');
      expect(greeting(toronto(17, 0))).toBe('Good evening');
      expect(greeting(toronto(19, 30))).toBe('Good evening');
    }
  });
});

describe('dayGroupLabel', () => {
  it('Today and Yesterday follow Toronto midnight', () => {
    expect(dayGroupLabel('2026-09-30T14:00:00Z', NOW)).toBe('Today');
    // 12:30 AM on September 30 in Toronto.
    expect(dayGroupLabel('2026-09-30T04:30:00Z', NOW)).toBe('Today');
    // 11:30 PM on September 29 in Toronto, though already September 30 in UTC.
    expect(dayGroupLabel('2026-09-30T03:30:00Z', NOW)).toBe('Yesterday');
    expect(dayGroupLabel('2026-09-29T12:00:00Z', NOW)).toBe('Yesterday');
  });

  it('uses the weekday and date for older days this year', () => {
    expect(dayGroupLabel('2026-09-28T15:00:00Z', NOW)).toBe('Monday, September 28');
    expect(dayGroupLabel('2026-01-01T15:00:00Z', NOW)).toBe('Thursday, January 1');
  });

  it('adds the year for other years', () => {
    expect(dayGroupLabel('2025-12-31T15:00:00Z', NOW)).toBe('Wednesday, December 31, 2025');
  });

  it('works when today is the first day of the month', () => {
    const oct1 = at('2026-10-01T16:00:00Z');
    expect(dayGroupLabel('2026-09-30T20:00:00Z', oct1)).toBe('Yesterday');
    expect(dayGroupLabel('2026-09-29T20:00:00Z', oct1)).toBe('Tuesday, September 29');
  });

  it('accepts microsecond instants', () => {
    expect(dayGroupLabel('2026-09-30T14:03:22.123456Z', NOW)).toBe('Today');
  });
});

describe('relativeTime', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const ahead = (ms: number) => new Date(NOW.getTime() + ms);
  const MIN = 60_000;
  const HOUR = 60 * MIN;

  it('says just now for the first 45 seconds', () => {
    expect(relativeTime(ago(0), NOW)).toBe('just now');
    expect(relativeTime(ago(10_000), NOW)).toBe('just now');
    expect(relativeTime(ago(44_999), NOW)).toBe('just now');
  });

  it('counts whole minutes under an hour', () => {
    expect(relativeTime(ago(45_000), NOW)).toBe('1 min ago');
    expect(relativeTime(ago(5 * MIN), NOW)).toBe('5 min ago');
    expect(relativeTime(ago(5 * MIN + 59_000), NOW)).toBe('5 min ago');
    expect(relativeTime(ago(59 * MIN), NOW)).toBe('59 min ago');
    // Never "60 min ago".
    expect(relativeTime(ago(59 * MIN + 59_000), NOW)).toBe('59 min ago');
  });

  it('counts whole hours earlier today', () => {
    expect(relativeTime(ago(HOUR), NOW)).toBe('1 h ago');
    expect(relativeTime(ago(HOUR + 40 * MIN), NOW)).toBe('1 h ago');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3 h ago');
    // 12:30 AM today in Toronto.
    expect(relativeTime('2026-09-30T04:30:00Z', NOW)).toBe('15 h ago');
  });

  it('says Yesterday for the previous Toronto day, even a few hours back', () => {
    expect(relativeTime('2026-09-29T20:00:00Z', NOW)).toBe('Yesterday');
    // 2 AM Toronto now; 10 PM last night was 4 hours ago but yesterday.
    expect(relativeTime('2026-09-30T02:00:00Z', at('2026-09-30T06:00:00Z'))).toBe('Yesterday');
  });

  it('shows the date for older instants', () => {
    expect(relativeTime('2026-09-28T15:00:00Z', NOW)).toBe('Sep 28');
    expect(relativeTime('2025-09-28T15:00:00Z', NOW)).toBe('Sep 28, 2025');
  });

  it('handles future instants (bookings, expiries)', () => {
    expect(relativeTime(ahead(30_000), NOW)).toBe('in 1 min');
    expect(relativeTime(ahead(30 * MIN), NOW)).toBe('in 30 min');
    expect(relativeTime(ahead(59 * MIN + 50_000), NOW)).toBe('in 59 min');
    // 4 PM now; 7 PM tonight.
    expect(relativeTime(ahead(3 * HOUR), NOW)).toBe('today 7:00 PM');
    expect(relativeTime('2026-10-01T14:00:00Z', NOW)).toBe('tomorrow 10:00 AM');
    expect(relativeTime('2026-10-05T14:00:00Z', NOW)).toBe('Oct 5');
    expect(relativeTime('2027-02-05T14:00:00Z', NOW)).toBe('Feb 5, 2027');
  });

  it('is empty for invalid input', () => {
    expect(relativeTime('nope', NOW)).toBe('');
  });
});
