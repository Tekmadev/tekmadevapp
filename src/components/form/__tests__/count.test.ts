import { countState, nearThreshold } from '../count';

describe('countState', () => {
  it('is near in the last 10% (at least 3) and over past the limit', () => {
    expect(nearThreshold(60)).toBe(6);
    expect(nearThreshold(10)).toBe(3);
    expect(countState(42, 60)).toBe('normal');
    expect(countState(54, 60)).toBe('near');
    expect(countState(60, 60)).toBe('near');
    expect(countState(61, 60)).toBe('over');
  });
});
