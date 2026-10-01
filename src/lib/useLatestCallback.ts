import { useCallback, useEffect, useRef } from 'react';

/**
 * A function with a stable identity that always calls the newest `fn` (the
 * "latest ref" pattern: the ref is updated in an effect, never during render).
 *
 * For handlers that must keep their identity while still seeing fresh props,
 * such as callbacks reached from memoized gestures or a throttle made once.
 * Call it from events, timers, worklet callbacks or effects, never during render.
 */
export function useLatestCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
