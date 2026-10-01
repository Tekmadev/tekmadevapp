import { formatCents } from '@/lib/money';
import { torontoWallTimeToInstant, formatTime, dayGroupLabel } from '@/lib/dates';
import { mapAdminUrl } from '@/lib/deeplinks';

describe('smoke', () => {
  it('formats money', () => {
    expect(formatCents(7750)).toBe('$77.50');
    expect(formatCents(99700)).toBe('$997');
  });
  it('converts Toronto wall time with DST', () => {
    expect(torontoWallTimeToInstant({ year: 2026, month: 9, day: 30, hour: 10, minute: 0 })).toBe('2026-09-30T14:00:00.000Z');
    expect(torontoWallTimeToInstant({ year: 2026, month: 1, day: 15, hour: 10, minute: 0 })).toBe('2026-01-15T15:00:00.000Z');
    expect(torontoWallTimeToInstant({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 })).toBe('2026-03-08T07:30:00.000Z');
    expect(torontoWallTimeToInstant({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 })).toBe('2026-11-01T05:30:00.000Z');
    expect(formatTime('2026-09-30T18:41:22.123456Z')).toBe('2:41 PM');
    expect(dayGroupLabel('2026-09-30T14:00:00Z', new Date('2026-09-30T20:00:00Z'))).toBe('Today');
  });
  it('maps deep links', () => {
    expect(mapAdminUrl('/admin/clients/abc#calls', 'manager')).toEqual({ pathname: '/clients/[id]', params: { id: 'abc', section: 'calls' } });
    expect(mapAdminUrl('/admin/pricing', 'manager')).toEqual({ pathname: '/inbox' });
  });
});
