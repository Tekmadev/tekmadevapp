import { indexAtRatio, indexOfValue, stepCount, stepDecimals, valueAtIndex } from '../sliderMath';

describe('slider steps', () => {
  it('counts decimals of the step', () => {
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(0.1)).toBe(1);
    expect(stepDecimals(0.05)).toBe(2);
    expect(stepDecimals(1e-7)).toBe(7);
  });

  it('counts steps, and none for a broken range', () => {
    expect(stepCount(0.6, 3, 0.05)).toBe(48);
    expect(stepCount(0, 100, 1)).toBe(100);
    expect(stepCount(0, 0, 1)).toBe(0);
    expect(stepCount(0, 10, 0)).toBe(0);
  });

  it('rebuilds values without float noise', () => {
    expect(valueAtIndex(22, 0.5, 1, 0.01)).toBe(0.72);
    expect(valueAtIndex(20, 0.6, 3, 0.05)).toBe(1.6);
    expect(valueAtIndex(999, 0, 10, 1)).toBe(10);
  });

  it('finds the index of a value and of a track position', () => {
    expect(indexOfValue(1.6, 0.6, 3, 0.05)).toBe(20);
    expect(indexOfValue(-5, 0, 10, 1)).toBe(0);
    expect(indexOfValue(Number.NaN, 0, 10, 1)).toBe(0);
    expect(indexAtRatio(0.5, 48)).toBe(24);
    expect(indexAtRatio(1.4, 10)).toBe(10);
    expect(indexAtRatio(-1, 10)).toBe(0);
  });
});
