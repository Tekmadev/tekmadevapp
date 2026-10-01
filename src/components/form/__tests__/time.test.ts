import { formatClockTime, from12h, parseTimeInput, to12h } from '../time';

describe('12 hour clock', () => {
  it('converts both ways', () => {
    expect(to12h(0)).toEqual({ hour12: 12, meridiem: 'am' });
    expect(to12h(12)).toEqual({ hour12: 12, meridiem: 'pm' });
    expect(to12h(23)).toEqual({ hour12: 11, meridiem: 'pm' });
    expect(from12h(12, 'am')).toBe(0);
    expect(from12h(12, 'pm')).toBe(12);
    expect(from12h(7, 'pm')).toBe(19);
  });

  it('formats like the rest of the app', () => {
    expect(formatClockTime({ hour: 14, minute: 5 })).toBe('2:05 PM');
    expect(formatClockTime({ hour: 0, minute: 30 })).toBe('12:30 AM');
  });
});

describe('parseTimeInput', () => {
  it.each([
    ['2:41 PM', { hour: 14, minute: 41 }],
    ['2:41pm', { hour: 14, minute: 41 }],
    ['2.41 p.m.', { hour: 14, minute: 41 }],
    ['2pm', { hour: 14, minute: 0 }],
    ['12:15 am', { hour: 0, minute: 15 }],
    ['12 pm', { hour: 12, minute: 0 }],
    ['14:41', { hour: 14, minute: 41 }],
    ['14h30', { hour: 14, minute: 30 }],
    ['1441', { hour: 14, minute: 41 }],
    ['0:30', { hour: 0, minute: 30 }],
    ['noon', { hour: 12, minute: 0 }],
    ['Midnight', { hour: 0, minute: 0 }],
  ])('reads %s', (text, expected) => {
    expect(parseTimeInput(text)).toEqual(expected);
  });

  it('keeps the meridiem the picker shows when none is typed', () => {
    expect(parseTimeInput('2:30', 'pm')).toEqual({ hour: 14, minute: 30 });
    expect(parseTimeInput('930', 'am')).toEqual({ hour: 9, minute: 30 });
  });

  it.each(['', 'abc', '25:00', '2:60', '13 pm', '0 am', 'a'])('rejects %p', (text) => {
    expect(parseTimeInput(text)).toBeNull();
  });
});
