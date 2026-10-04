import { complement, COMMISSION_COPY, parsePercent, sameSplit, splitErrors, splitInput, splitSummary } from '../commission';

describe('the commission split', () => {
  it('fills in the other side so the two add up to 100', () => {
    expect(complement('40')).toBe('60');
    expect(complement('33.33')).toBe('66.67');
    expect(complement('0')).toBe('100');
    expect(complement('100')).toBe('0');
    expect(complement('')).toBeNull();
    expect(complement('120')).toBeNull();
  });

  it('checks each side, then the total, with the server copy', () => {
    expect(splitErrors('50', '50')).toEqual({});
    expect(splitErrors('0', '100')).toEqual({});
    expect(splitErrors('', '50')).toEqual({ finder: COMMISSION_COPY.range });
    expect(splitErrors('10.555', '89.445')).toEqual({ finder: COMMISSION_COPY.range, booker: COMMISSION_COPY.range });
    expect(splitErrors('60', '50')).toEqual({ finder: 'Finder and booker must add up to 100.', booker: 'Finder and booker must add up to 100.' });
  });

  it('sends numbers and reads them back', () => {
    expect(parsePercent('12.5%')).toBe(12.5);
    expect(splitInput('33.33', '66.67')).toEqual({ finder: 33.33, booker: 66.67 });
    expect(sameSplit('50', '50.00', { finder: 50, booker: 50 })).toBe(true);
    expect(sameSplit('40', '60', { finder: 50, booker: 50 })).toBe(false);
    expect(splitSummary({ finder: 60, booker: 40 })).toBe('Finder 60% · Booker 40%');
  });
});
