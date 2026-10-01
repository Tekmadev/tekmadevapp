import {
  canShowMonth,
  clampDate,
  compareMonth,
  dateRangeError,
  daysInMonth,
  formatFieldDate,
  formatMonthTitle,
  formatSpokenDate,
  GRID_CELLS,
  isDateInRange,
  monthGrid,
  monthOf,
  shiftMonth,
  weekdayInitials,
} from '../calendarMath';

describe('monthGrid', () => {
  it('starts on Sunday and leaves the days of other months blank', () => {
    // September 1, 2026 is a Tuesday: two blanks first.
    const cells = monthGrid({ year: 2026, month: 9 });
    expect(cells).toHaveLength(GRID_CELLS);
    expect(cells.slice(0, 3)).toEqual([null, null, '2026-09-01']);
    expect(cells[2 + 29]).toBe('2026-09-30');
    expect(cells[2 + 30]).toBeNull();
    expect(cells.filter(Boolean)).toHaveLength(30);
  });

  it('handles a month that starts on Sunday and leap years', () => {
    // February 1, 2026 is a Sunday: no lead, exactly four weeks.
    const feb = monthGrid({ year: 2026, month: 2 });
    expect(feb[0]).toBe('2026-02-01');
    expect(feb[27]).toBe('2026-02-28');
    expect(feb.slice(28).every((c) => c === null)).toBe(true);
    expect(monthGrid({ year: 2028, month: 2 }).filter(Boolean)).toHaveLength(29);
  });

  it('can start on Monday', () => {
    expect(monthGrid({ year: 2026, month: 9 }, 1).slice(0, 2)).toEqual([null, '2026-09-01']);
    expect(weekdayInitials(1)[0]).toEqual({ short: 'M', name: 'Monday' });
  });

  it('never depends on the machine time zone', () => {
    // Every cell is a plain calendar date that follows the previous one.
    const days = monthGrid({ year: 2026, month: 11 }).filter((c): c is string => c != null);
    days.forEach((d, i) => expect(Number(d.slice(8))).toBe(i + 1));
  });
});

describe('month helpers', () => {
  it('shifts across years', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 5 }, -17)).toEqual({ year: 2024, month: 12 });
  });

  it('compares months and counts days', () => {
    expect(compareMonth({ year: 2026, month: 1 }, { year: 2025, month: 12 })).toBe(1);
    expect(compareMonth(monthOf('2026-09-30'), { year: 2026, month: 9 })).toBe(0);
    expect(daysInMonth({ year: 2026, month: 4 })).toBe(30);
    expect(daysInMonth({ year: 2024, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2100, month: 2 })).toBe(28);
  });

  it('only shows months that hold a selectable day', () => {
    expect(canShowMonth({ year: 2026, month: 9 }, '2026-10-02')).toBe(false);
    expect(canShowMonth({ year: 2026, month: 10 }, '2026-10-02')).toBe(true);
    expect(canShowMonth({ year: 2026, month: 12 }, null, '2026-11-30')).toBe(false);
  });
});

describe('ranges', () => {
  it('checks and clamps inclusive bounds', () => {
    expect(isDateInRange('2026-10-02', '2026-10-02', '2026-10-31')).toBe(true);
    expect(isDateInRange('2026-10-01', '2026-10-02')).toBe(false);
    expect(isDateInRange('2026-11-01', null, '2026-10-31')).toBe(false);
    expect(clampDate('2026-10-01', '2026-10-02')).toBe('2026-10-02');
    expect(clampDate('2027-01-01', null, '2026-12-31')).toBe('2026-12-31');
    expect(clampDate('2026-10-15', '2026-10-02', '2026-12-31')).toBe('2026-10-15');
  });

  it('explains a date outside the range', () => {
    expect(dateRangeError('2026-10-01', '2026-10-02')).toBe('Pick a date on or after Oct 2, 2026.');
    expect(dateRangeError('2027-01-05', null, '2026-12-31')).toBe('Pick a date on or before Dec 31, 2026.');
    expect(dateRangeError('2026-10-02', '2026-10-02')).toBeNull();
    expect(dateRangeError(null, '2026-10-02')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats the field, the header and the spoken date', () => {
    expect(formatFieldDate('2026-09-30')).toBe('Wed, Sep 30, 2026');
    expect(formatMonthTitle({ year: 2026, month: 9 })).toBe('September 2026');
    expect(formatSpokenDate('2026-10-01')).toBe('Thursday, October 1, 2026');
    expect(weekdayInitials().map((d) => d.short).join('')).toBe('SMTWTFS');
  });
});
