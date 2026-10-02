import type { AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { LOCK_AFTER_MS, usePrefs } from '@/lib/prefs';

import { isAuthenticating } from './biometrics';
import { shouldLockOnResume } from './lockLogic';

/**
 * Whether the app lock is up. `null` means nothing happened since the gate
 * mounted, so the gate's own start-up decision applies (locked on a cold start
 * with a saved session, open right after signing in with a password).
 */
type LockState = { locked: boolean | null };

export const useAppLock = create<LockState>()(() => ({ locked: null }));

/** When the app last went to the background with biometric unlock on, or null. */
let backgroundAt: number | null = null;

export const appLock = {
  lock() {
    if (useAppLock.getState().locked !== true) useAppLock.setState({ locked: true });
  },
  unlock() {
    useAppLock.setState({ locked: false });
  },
  /** Back to the start-up state (sign-out unmounts the gate). */
  reset() {
    backgroundAt = null;
    useAppLock.setState({ locked: null });
  },
  /**
   * Feed every AppState change here. Only a real trip to the background counts:
   * iOS "inactive" (Control Center, the Face ID sheet) and the system unlock
   * prompt's own round trip are ignored. "Immediately" locks on the way out,
   * so the content never shows on the way back in.
   */
  onAppStateChange(state: AppStateStatus, now: number = Date.now()) {
    const { biometricUnlock, lockAfter } = usePrefs.getState();
    const lockAfterMs = LOCK_AFTER_MS[lockAfter];
    if (state === 'background') {
      if (!biometricUnlock || isAuthenticating()) {
        backgroundAt = null;
        return;
      }
      backgroundAt = now;
      if (lockAfterMs === 0) appLock.lock();
      return;
    }
    if (state === 'active') {
      const since = backgroundAt;
      backgroundAt = null;
      if (biometricUnlock && shouldLockOnResume(since, now, lockAfterMs)) appLock.lock();
    }
  },
};
