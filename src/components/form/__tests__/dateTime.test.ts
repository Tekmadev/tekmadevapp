import { combineToInstant, dateTimeRangeError, formatFieldDateTime, nextQuarterHour, splitInstant } from '../dateTime';

/*
 * The picked date and time are Toronto wall time; the instant must come out
 * the same whatever zone the test machine (or the phone) is in.
 */

const now = new Date('2026-10-01T13:00:00.000Z');

describe('combineToInstant', () => {
  it('uses the Toronto offset in force on that date', () => {
    expect(combineToInstant('2026-10-08', { hour: 10, minute: 0 })).toBe('2026-10-08T14:00:00.000Z');
    expect(combineToInstant('2026-01-15', { hour: 9, minute: 30 })).toBe('2026-01-15T14:30:00.000Z');
    expect(combineToInstant('2026-12-31', { hour: 23, minute: 45 })).toBe('2027-01-01T04:45:00.000Z');
  });

  it('moves a time skipped by the spring DST jump an hour later', () => {
    // March 8, 2026: 2:00 AM jumps to 3:00 AM.
    expect(combineToInstant('2026-03-08', { hour: 2, minute: 30 })).toBe('2026-03-08T07:30:00.000Z');
  });

  it('picks the first of the two fall-back times', () => {
    // November 1, 2026: 1:30 AM happens twice; the first is still EDT.
    expect(combineToInstant('2026-11-01', { hour: 1, minute: 30 })).toBe('2026-11-01T05:30:00.000Z');
  });

  it('refuses a malformed date', () => {
    expect(combineToInstant('2026-1-8', { hour: 10, minute: 0 })).toBeNull();
  });
});

describe('splitInstant', () => {
  it('reads the Toronto date and time of an instant', () => {
    expect(splitInstant('2026-10-08T14:00:00.000Z')).toEqual({ date: '2026-10-08', time: { hour: 10, minute: 0 } });
    // Late evening in Toronto is already tomorrow in UTC.
    expect(splitInstant('2026-10-09T03:15:00.123456Z')).toEqual({ date: '2026-10-08', time: { hour: 23, minute: 15 } });
  });

  it('round trips with combineToInstant', () => {
    const picked = splitInstant('2026-07-04T16:45:00.000Z');
    expect(picked && combineToInstant(picked.date, picked.time)).toBe('2026-07-04T16:45:00.000Z');
  });

  it('returns null for nothing or garbage', () => {
    expect(splitInstant(null)).toBeNull();
    expect(splitInstant('not a date')).toBeNull();
  });
});

describe('formatting and ranges', () => {
  it('shows the weekday, date and Toronto time', () => {
    expect(formatFieldDateTime('2026-10-08T14:00:00.000Z', now)).toBe('Thu, Oct 8, 10:00 AM');
    expect(formatFieldDateTime('2027-01-04T22:05:00.000Z', now)).toBe('Mon, Jan 4, 2027, 5:05 PM');
  });

  it('explains an instant outside the range', () => {
    const min = '2026-10-08T15:00:00.000Z';
    expect(dateTimeRangeError('2026-10-08T14:00:00.000Z', min, null, now)).toBe('Pick a time after Oct 8, 11:00 AM.');
    expect(dateTimeRangeError(min, min, null, now)).toBeNull();
    expect(dateTimeRangeError('2026-10-09T00:00:00.000Z', null, min, now)).toBe('Pick a time before Oct 8, 11:00 AM.');
    expect(dateTimeRangeError(null, min, null, now)).toBeNull();
  });

  it('rounds up to the next quarter hour', () => {
    expect(nextQuarterHour('2026-10-01T13:07:00.000Z')).toEqual({ date: '2026-10-01', time: { hour: 9, minute: 15 } });
    expect(nextQuarterHour('2026-10-01T13:15:00.000Z')).toEqual({ date: '2026-10-01', time: { hour: 9, minute: 15 } });
    expect(nextQuarterHour('2026-10-02T03:50:00.000Z')).toEqual({ date: '2026-10-02', time: { hour: 0, minute: 0 } });
  });
});
