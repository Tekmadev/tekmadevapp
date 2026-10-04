import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStringStorage, storage, StorageKeys } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type LockAfter = 'immediately' | '1m' | '5m' | '15m';

export const LOCK_AFTER_MS: Record<LockAfter, number> = {
  immediately: 0,
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
};

type PrefsState = {
  theme: ThemePreference;
  biometricUnlock: boolean;
  lockAfter: LockAfter;
  hideInRecents: boolean;
  /** The Inbox's "Include test" toggle (`testdata.view` only), remembered between sessions. */
  inboxIncludeTest: boolean;
  /** Dev builds only: hidden Kit screen unlocked by tapping the version 7 times. */
  kitUnlocked: boolean;
  setTheme: (theme: ThemePreference) => void;
  setBiometricUnlock: (on: boolean) => void;
  setLockAfter: (value: LockAfter) => void;
  setHideInRecents: (on: boolean) => void;
  setInboxIncludeTest: (on: boolean) => void;
  setKitUnlocked: (on: boolean) => void;
  reset: () => void;
};

const defaults = {
  theme: 'system' as ThemePreference,
  biometricUnlock: false,
  lockAfter: '1m' as LockAfter,
  hideInRecents: false,
  inboxIncludeTest: false,
  kitUnlocked: false,
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      ...defaults,
      setTheme: (theme) => set({ theme }),
      setBiometricUnlock: (biometricUnlock) => set({ biometricUnlock }),
      setLockAfter: (lockAfter) => set({ lockAfter }),
      setHideInRecents: (hideInRecents) => set({ hideInRecents }),
      setInboxIncludeTest: (inboxIncludeTest) => set({ inboxIncludeTest }),
      setKitUnlocked: (kitUnlocked) => set({ kitUnlocked }),
      reset: () => set(defaults),
    }),
    {
      name: StorageKeys.prefs,
      storage: createJSONStorage(() => mmkvStringStorage(storage)),
      version: 1,
      partialize: ({ theme, biometricUnlock, lockAfter, hideInRecents, inboxIncludeTest, kitUnlocked }) => ({
        theme,
        biometricUnlock,
        lockAfter,
        hideInRecents,
        inboxIncludeTest,
        kitUnlocked,
      }),
    },
  ),
);
