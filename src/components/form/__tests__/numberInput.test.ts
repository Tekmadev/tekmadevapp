import { numberRangeError, numberToInput, parseNumberInput, sanitizeIntegerInput, sanitizeMoneyInput } from '../numberInput';

describe('money input', () => {
  it('keeps digits, one point and two decimals', () => {
    expect(sanitizeMoneyInput('77.5')).toBe('77.5');
    expect(sanitizeMoneyInput('77.555')).toBe('77.55');
    expect(sanitizeMoneyInput('$1,204.99')).toBe('1204.99');
    expect(sanitizeMoneyInput('007')).toBe('7');
    expect(sanitizeMoneyInput('.5')).toBe('.5');
  });

  it('reads a trailing comma with up to two digits as a decimal comma', () => {
    expect(sanitizeMoneyInput('77,5')).toBe('77.5');
    expect(sanitizeMoneyInput('1,204')).toBe('1204');
  });

  it('stores cents and never rounds', () => {
    expect(parseNumberInput('77.50', 'money')).toBe(7750);
    expect(parseNumberInput('77.5', 'money')).toBe(7750);
    expect(parseNumberInput('0.01', 'money')).toBe(1);
    expect(parseNumberInput('.', 'money')).toBeNull();
    expect(parseNumberInput('', 'money')).toBeNull();
    expect(numberToInput(7750, 'money')).toBe('77.50');
    expect(numberToInput(99700, 'money')).toBe('997');
    expect(numberToInput(null, 'money')).toBe('');
  });
});

describe('integer input', () => {
  it('keeps digits and an optional minus', () => {
    expect(sanitizeIntegerInput('1,2a3')).toBe('123');
    expect(sanitizeIntegerInput('-12')).toBe('12');
    expect(sanitizeIntegerInput('-12', true)).toBe('-12');
    expect(parseNumberInput('12', 'integer')).toBe(12);
    expect(parseNumberInput('-3', 'integer')).toBe(-3);
    expect(parseNumberInput('1.5', 'integer')).toBeNull();
    expect(numberToInput(12, 'integer')).toBe('12');
  });
});

describe('numberRangeError', () => {
  it('speaks dollars in money mode', () => {
    expect(numberRangeError(null, { mode: 'money', required: true })).toBe('Enter an amount.');
    expect(numberRangeError(50, { mode: 'money', min: 100, max: 50000 })).toBe('Enter an amount from $1 to $500.');
    expect(numberRangeError(50, { mode: 'money', min: 100 })).toBe('Enter at least $1.');
    expect(numberRangeError(7750, { mode: 'money', max: 5000 })).toBe('Enter at most $50.');
    expect(numberRangeError(7750, { mode: 'money', min: 100 })).toBeNull();
  });

  it('speaks plain numbers otherwise', () => {
    expect(numberRangeError(null, { mode: 'integer' })).toBeNull();
    expect(numberRangeError(null, { mode: 'integer', required: true })).toBe('Enter a number.');
    expect(numberRangeError(150, { mode: 'integer', min: 1, max: 100 })).toBe('Enter a number from 1 to 100.');
    expect(numberRangeError(150, { mode: 'integer', max: 100 })).toBe('Enter 100 or less.');
    expect(numberRangeError(0, { mode: 'integer', min: 1 })).toBe('Enter 1 or more.');
  });
});
