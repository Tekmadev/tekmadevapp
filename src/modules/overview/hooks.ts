import { queryOptions } from '@tanstack/react-query';
import { useFocusEffect, useNavigation } from 'expo-router';
import type { BottomTabNavigationProp } from 'expo-router/js-tabs';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { getMeta, sessionKeys } from '@/api/endpoints/session';
import { storage } from '@/lib/storage';
import { useLatestCallback } from '@/lib/useLatestCallback';

/* ---------- GET /meta ---------- */

/**
 * GET /meta (labels and tones for lead and subscription statuses, lead sources).
 * The labels change only with a server deploy, so an hour is plenty; the
 * persisted cache means they are there on a cold start.
 */
export function metaQuery() {
  return queryOptions({
    queryKey: sessionKeys.meta,
    queryFn: ({ signal }) => getMeta(signal),
    staleTime: 60 * 60_000,
  });
}

/* ---------- clock ---------- */

const MINUTE = 60_000;
const minuteNow = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/** The current minute, cached so every read between ticks returns the same value. */
let minuteSnapshot = minuteNow();
const getMinute = () => minuteSnapshot;
const minuteListeners = new Set<() => void>();
let stopMinuteClock: (() => void) | null = null;

function tickMinute() {
  const next = minuteNow();
  if (next === minuteSnapshot) return;
  minuteSnapshot = next;
  minuteListeners.forEach((l) => l());
}

/** One timer and one AppState listener for every subscriber, running only while someone listens. */
function startMinuteClock(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    // A hair past the boundary, so the new minute has started.
    timer = setTimeout(
      () => {
        tickMinute();
        schedule();
      },
      MINUTE - (Date.now() % MINUTE) + 50,
    );
  };
  schedule();
  // Timers are throttled in the background: catch up the moment the app is back.
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') tickMinute();
  });
  return () => {
    clearTimeout(timer);
    sub.remove();
  };
}

function subscribeMinutes(onChange: () => void) {
  minuteListeners.add(onChange);
  if (!stopMinuteClock) {
    // Nothing was listening for a while: catch up (React re-checks the snapshot after subscribing).
    minuteSnapshot = minuteNow();
    stopMinuteClock = startMinuteClock();
  }
  return () => {
    minuteListeners.delete(onChange);
    if (minuteListeners.size === 0 && stopMinuteClock) {
      stopMinuteClock();
      stopMinuteClock = null;
    }
  };
}

/**
 * The current time, moving on each minute and on app resume, so the greeting,
 * the date eyebrow and "5 min ago" stay true while Home sits open.
 */
export function useMinuteClock(): Date {
  const ms = useSyncExternalStore(subscribeMinutes, getMinute);
  return useMemo(() => new Date(ms), [ms]);
}

/* ---------- refetch on focus and resume ---------- */

/** Coming back within this long after a fetch does not fetch again (quick tab hops). */
const REFETCH_MIN_AGE_MS = 5_000;

/**
 * Refetches when the screen regains focus (not on the first focus: mounting the
 * query already fetches when the cache is stale) and when the app returns to
 * the foreground while this screen is the one showing. `cancelRefetch: false`
 * joins a fetch already running instead of restarting it.
 */
export function useRefetchOnFocus(refetch: (options: { cancelRefetch: boolean }) => unknown, dataUpdatedAt: number) {
  const run = useLatestCallback(() => {
    if (dataUpdatedAt > 0 && Date.now() - dataUpdatedAt < REFETCH_MIN_AGE_MS) return;
    refetch({ cancelRefetch: false });
  });
  const focused = useRef(false);
  const seenFirstFocus = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      if (seenFirstFocus.current) run();
      seenFirstFocus.current = true;
      return () => {
        focused.current = false;
      };
    }, [run]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focused.current) run();
    });
    return () => sub.remove();
  }, [run]);
}

/* ---------- tab press ---------- */

/**
 * Tapping the Home tab while Home is already showing scrolls back to the top.
 * (Screen's own useScrollToTop does the same; this keeps Home's behaviour
 * explicit and independent of that.)
 */
export function useTabPressScrollToTop(scrollToTop: () => void) {
  const navigation = useNavigation<BottomTabNavigationProp<Record<string, object | undefined>>>();
  const onPress = useLatestCallback(scrollToTop);
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        if (navigation.isFocused()) onPress();
      }),
    [navigation, onPress],
  );
}

/* ---------- update card ---------- */

/** Local only: the version whose "Update available" card was dismissed on this phone. */
const UPDATE_DISMISSED_KEY = 'home.updateDismissed.v1';

function readDismissed(): string | null {
  try {
    return storage.getString(UPDATE_DISMISSED_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Dismissing the update card hides it until a newer version is announced: the
 * dismissed version is remembered, so the next release shows the card again.
 */
export function useDismissedUpdate(): [dismissed: string | null, dismiss: (version: string) => void] {
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);
  const dismiss = useCallback((version: string) => {
    setDismissed(version);
    try {
      storage.set(UPDATE_DISMISSED_KEY, version);
    } catch {
      // Not remembered across launches; it stays hidden for now.
    }
  }, []);
  return [dismissed, dismiss];
}
