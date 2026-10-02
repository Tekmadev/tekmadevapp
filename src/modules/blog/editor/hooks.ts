import { useEffect, useState } from 'react';
import { useAnimatedScrollHandler, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

import { springs } from '@/design/motion';

/** `value`, once it has stopped changing for `ms` (the Preview's 400ms render debounce). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Scrolled less than this from the top, the top bar always shows. */
const REVEAL_ZONE = 96;
/** Travel in one direction before the bar hides or comes back. */
const TRAVEL = 24;

/**
 * The top bar's "quick return": it slides away while the writer scrolls down
 * (or the text scrolls up under the caret) and comes back on the first scroll
 * up, or near the top. `hidden` goes 0 (showing) to 1 (hidden) on the snappy
 * spring; with reduced motion the spring jumps (ReduceMotion.System). Each
 * scroll view gets its own handler; they share `hidden`.
 */
export function useQuickReturn(hidden: SharedValue<number>, target: SharedValue<number>) {
  const y = useSharedValue(0);
  const last = useSharedValue(0);
  const travel = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const next = e.contentOffset.y;
      const dy = next - last.get();
      last.set(next);
      y.set(next);
      // Keep counting while the direction holds; a turn starts a new count.
      const t = travel.get();
      travel.set(dy === 0 ? t : Math.sign(dy) === Math.sign(t) ? t + dy : dy);
      let want = -1;
      if (next <= REVEAL_ZONE) want = 0;
      else if (travel.get() > TRAVEL) want = 1;
      else if (travel.get() < -TRAVEL) want = 0;
      if (want >= 0 && want !== target.get()) {
        target.set(want);
        hidden.set(withSpring(want, springs.snappy));
      }
    },
  });

  return { y, onScroll };
}
