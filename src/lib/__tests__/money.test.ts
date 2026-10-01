import { centsToInput, formatCents, formatCentsCompact, formatMoney, parseDollarsToCents } from '@/lib/money';

describe('formatCents', () => {
  it('keeps cents when there are cents (never rounds $77.50 to $78)', () => {
    expect(formatCents(7750)).toBe('$77.50');
    expect(formatCents(7705)).toBe('$77.05');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(99)).toBe('$0.99');
    expect(formatCents(99750)).toBe('$997.50');
  });

  it('drops .00 on whole amounts', () => {
    expect(formatCents(99700)).toBe('$997');
    expect(formatCents(100)).toBe('$1');
    expect(formatCents(0)).toBe('$0');
  });

  it('can keep .00 when asked', () => {
    expect(formatCents(99700, 'CAD', { dropZeroCents: false })).toBe('$997.00');
    expect(formatCents(10000, 'CAD', { dropZeroCents: false })).toBe('$100.00');
  });

  it('groups thousands', () => {
    expect(formatCents(123456789)).toBe('$1,234,567.89');
    expect(formatCents(120400)).toBe('$1,204');
  });

  it('formats negatives (refunds, credits)', () => {
    expect(formatCents(-7750)).toBe('-$77.50');
    expect(formatCents(-9900)).toBe('-$99');
  });

  it('never prints a negative zero', () => {
    expect(formatCents(-0)).toBe('$0');
    expect(formatCents(-0.4)).toBe('$0');
  });

  it('rounds stray fractions of a cent', () => {
    expect(formatCents(7750.4)).toBe('$77.50');
    expect(formatCents(7749.6)).toBe('$77.50');
  });

  it('shows the currency for non-CAD rows, so "$" always means CAD', () => {
    expect(formatCents(1250, 'USD')).toBe('US$12.50');
    expect(formatCents(1250, 'usd')).toBe('US$12.50');
    expect(formatCents(100, 'AUD')).toBe('A$1');
    expect(formatCents(1250, 'CAD')).toBe('$12.50');
  });

  it('signs positive amounts when asked', () => {
    expect(formatCents(7750, 'CAD', { signed: true })).toBe('+$77.50');
    expect(formatCents(-7750, 'CAD', { signed: true })).toBe('-$77.50');
    expect(formatCents(0, 'CAD', { signed: true })).toBe('$0');
    expect(formatCents(1250, 'USD', { signed: true })).toBe('+US$12.50');
  });

  it('returns an empty string for non-numbers instead of a made-up amount', () => {
    expect(formatCents(NaN)).toBe('');
    expect(formatCents(Infinity)).toBe('');
  });

  it('uses plain spaces only (no narrow no-break spaces)', () => {
    for (const text of [formatCents(1250, 'EUR'), formatCents(-123456, 'USD'), formatCents(99700)]) {
      expect(text).not.toMatch(/[\u00a0\u202f]/);
    }
  });
});

describe('formatMoney', () => {
  it('formats API money objects', () => {
    expect(formatMoney({ amount: 7750, currency: 'CAD' })).toBe('$77.50');
    expect(formatMoney({ amount: 99700, currency: 'CAD' })).toBe('$997');
    expect(formatMoney({ amount: 1250, currency: 'USD' })).toBe('US$12.50');
    expect(formatMoney({ amount: 500, currency: 'CAD' }, { signed: true })).toBe('+$5');
  });

  it('is empty when there is no amount', () => {
    expect(formatMoney(null)).toBe('');
    expect(formatMoney(undefined)).toBe('');
  });
});

describe('formatCentsCompact', () => {
  it('shortens thousands and millions with one decimal at most', () => {
    expect(formatCentsCompact(124000)).toBe('$1.2K');
    expect(formatCentsCompact(12_450_000)).toBe('$124.5K');
    expect(formatCentsCompact(100_000)).toBe('$1K');
    expect(formatCentsCompact(150_000_000)).toBe('$1.5M');
    expect(formatCentsCompact(1_000_000_000)).toBe('$10M');
  });

  it('keeps small amounts exact', () => {
    expect(formatCentsCompact(7750)).toBe('$77.50');
    expect(formatCentsCompact(99_999)).toBe('$999.99');
    expect(formatCentsCompact(0)).toBe('$0');
  });

  it('rolls over to the next unit instead of showing 1000K', () => {
    expect(formatCentsCompact(99_999_999)).toBe('$1M');
    expect(formatCentsCompact(99_995_000)).toBe('$1M');
    expect(formatCentsCompact(99_940_000)).toBe('$999.4K');
  });

  it('handles negatives and other currencies', () => {
    expect(formatCentsCompact(-124000)).toBe('-$1.2K');
    expect(formatCentsCompact(-7750)).toBe('-$77.50');
    expect(formatCentsCompact(124000, 'USD')).toBe('USD 1.2K');
  });

  it('is empty for non-numbers', () => {
    expect(formatCentsCompact(NaN)).toBe('');
  });
});

describe('parseDollarsToCents', () => {
  it.each([
    ['77', 7700],
    ['77.5', 7750],
    ['77.50', 7750],
    ['77.05', 7705],
    ['0.05', 5],
    ['.5', 50],
    ['997', 99700],
    ['$1,204.99', 120499],
    ['  12  ', 1200],
    ['1 204', 120400],
    ['12.', 1200],
    ['0', 0],
    ['-12.34', -1234],
    ['-.5', -50],
  ])('parses %j as %d cents', (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents);
  });

  it.each(['', '   ', '.', '-', '-.', '$', 'abc', '12abc', '1.234', '12.3.4', '1e5', '--5', '5-', '+5', 'CA$12', 'Infinity', 'NaN'])(
    'rejects %j',
    (input) => {
      expect(parseDollarsToCents(input)).toBeNull();
    },
  );

  it('never returns a negative zero', () => {
    expect(Object.is(parseDollarsToCents('-0'), 0)).toBe(true);
    expect(Object.is(parseDollarsToCents('-0.00'), 0)).toBe(true);
  });

  it('rejects amounts too large to be exact', () => {
    expect(parseDollarsToCents('99999999999999999999')).toBeNull();
    expect(parseDollarsToCents('9999999999999')).toBe(999999999999900);
  });
});

describe('centsToInput', () => {
  it('gives the editable text of a money field', () => {
    expect(centsToInput(7750)).toBe('77.50');
    expect(centsToInput(7705)).toBe('77.05');
    expect(centsToInput(99700)).toBe('997');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(0)).toBe('0');
    expect(centsToInput(-7750)).toBe('-77.50');
    expect(centsToInput(120499)).toBe('1204.99');
  });

  it('is empty when there is no value', () => {
    expect(centsToInput(null)).toBe('');
    expect(centsToInput(undefined)).toBe('');
    expect(centsToInput(NaN)).toBe('');
  });
});

describe('round trips', () => {
  it('cents to input and back is lossless', () => {
    for (const cents of [0, 1, 5, 10, 99, 100, 7705, 7750, 99700, 99750, 120499, 123456789, -1, -7750, -99700]) {
      expect(parseDollarsToCents(centsToInput(cents))).toBe(cents);
    }
  });

  it('typed text settles on one canonical form', () => {
    for (const [typed, canonical] of [
      ['77.5', '77.50'],
      ['$1,204.00', '1204'],
      ['.05', '0.05'],
      ['997.', '997'],
    ]) {
      const cents = parseDollarsToCents(typed);
      expect(cents).not.toBeNull();
      expect(centsToInput(cents)).toBe(canonical);
    }
  });

  it('what the field shows formats to the same amount', () => {
    for (const cents of [7750, 99700, 5, 120499]) {
      const parsed = parseDollarsToCents(centsToInput(cents));
      expect(parsed).not.toBeNull();
      expect(formatCents(parsed ?? NaN)).toBe(formatCents(cents));
    }
  });
});
