/**
 * Leading and trailing throttle for live callbacks (a slider dragging through
 * many steps): the first call runs at once, later calls inside the window
 * collapse into one trailing call with the newest arguments, so the last value
 * is never lost.
 */
export type Throttled<A extends unknown[]> = {
  (...args: A): void;
  /** Run the pending trailing call now (end of a drag). */
  flush: () => void;
  /** Drop the pending trailing call. */
  cancel: () => void;
};

export function throttle<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): Throttled<A> {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const run = (args: A) => {
    last = Date.now();
    pending = null;
    fn(...args);
  };

  const fire = () => {
    timer = null;
    if (pending) run(pending);
  };

  const throttled = ((...args: A) => {
    const wait = waitMs - (Date.now() - last);
    if (wait <= 0 && !timer) {
      run(args);
      return;
    }
    pending = args;
    if (!timer) timer = setTimeout(fire, Math.max(0, wait));
  }) as Throttled<A>;

  throttled.flush = () => {
    if (timer) clearTimeout(timer);
    fire();
  };
  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return throttled;
}
