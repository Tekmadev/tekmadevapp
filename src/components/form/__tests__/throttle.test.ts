import { throttle } from '../throttle';

describe('throttle', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('runs the first call at once and the newest one at the end of the window', () => {
    const fn = jest.fn();
    const t = throttle(fn, 50);
    t(1);
    t(2);
    t(3);
    expect(fn.mock.calls).toEqual([[1]]);
    jest.advanceTimersByTime(50);
    expect(fn.mock.calls).toEqual([[1], [3]]);
  });

  it('flushes the pending call (end of a drag) and can cancel it', () => {
    const fn = jest.fn();
    const t = throttle(fn, 50);
    t(1);
    t(2);
    t.flush();
    expect(fn.mock.calls).toEqual([[1], [2]]);
    t(3);
    t.cancel();
    jest.advanceTimersByTime(100);
    expect(fn.mock.calls).toEqual([[1], [2]]);
  });
});
