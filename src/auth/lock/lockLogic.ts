import type { LocalAuthenticationError } from 'expo-local-authentication';

/**
 * The app lock rules that need no device (brief 8.18 and section 13, phase 6).
 * Pure functions, unit tested in __tests__/lockLogic.test.ts.
 */

/** How the phone can confirm it is its owner: a biometric, only the screen lock, or nothing at all. */
export type UnlockMethod = 'biometric' | 'credential' | 'none';

export type UnlockSupport = {
  method: UnlockMethod;
  /** Which biometrics the phone has (for the wording only; the system prompt picks). */
  fingerprint: boolean;
  face: boolean;
};

export const NO_UNLOCK_SUPPORT: UnlockSupport = { method: 'none', fingerprint: false, face: false };

/**
 * expo-local-authentication's SecurityLevel as a method: 0 none, 1 a PIN,
 * pattern or password only, 2 and 3 a weak or strong biometric.
 */
export function unlockMethodFor(level: number): UnlockMethod {
  if (level >= 2) return 'biometric';
  if (level === 1) return 'credential';
  return 'none';
}

/**
 * Lock when the app comes back after being away at least `lockAfterMs`.
 * `backgroundAt` is null when nothing was recorded (biometric unlock was off,
 * or the app only left for the system's own unlock prompt). A clock that moved
 * backwards cannot prove a short absence, so it locks.
 */
export function shouldLockOnResume(backgroundAt: number | null, now: number, lockAfterMs: number): boolean {
  if (backgroundAt === null) return false;
  const away = now - backgroundAt;
  if (away < 0) return true;
  return away >= lockAfterMs;
}

export const LOCK_COPY = {
  title: 'Locked',
  body: "Confirm it's you to open Tekmadev Admin.",
  unlock: 'Unlock',
  unlocking: 'Unlocking',
  signOut: 'Sign out',
  cancel: 'Cancel',
  prompt: 'Unlock Tekmadev Admin',
  promptTurnOn: 'Turn on biometric unlock',
  lockout: 'Too many tries. Wait a moment, then try again.',
  failed: "Could not confirm it's you. Try again.",
  unavailable: 'This phone has no fingerprint or screen lock set up. Sign out, then sign in with your password.',
} as const;

/**
 * What to say after a failed system prompt. Null means stay quiet: backing out
 * of the prompt is a choice, and `app_cancel` means another prompt was already up.
 */
export function unlockErrorMessage(error: LocalAuthenticationError): string | null {
  switch (error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
      return null;
    case 'lockout':
      return LOCK_COPY.lockout;
    case 'not_enrolled':
    case 'not_available':
    case 'passcode_not_set':
      return LOCK_COPY.unavailable;
    default:
      return LOCK_COPY.failed;
  }
}

/**
 * What to say when turning biometric unlock on fails (App settings). Null:
 * stay quiet, the person backed out. Nothing set up on the phone reads as the
 * same help line the setting shows.
 */
export function turnOnErrorMessage(error: LocalAuthenticationError, platform: string): string | null {
  const message = unlockErrorMessage(error);
  if (message === LOCK_COPY.unavailable) return biometricDescription(NO_UNLOCK_SUPPORT, platform);
  return message;
}

/** The help line under "Biometric unlock", in the words of what this phone actually has. */
export function biometricDescription(support: UnlockSupport, platform: 'android' | 'ios' | string): string {
  const screenLock = platform === 'ios' ? 'passcode' : 'screen lock';
  switch (support.method) {
    case 'biometric': {
      let what = 'fingerprint or face';
      if (support.fingerprint && !support.face) what = 'fingerprint';
      else if (support.face && !support.fingerprint) what = 'face';
      return `Open the app with your ${what}. Your ${screenLock} works too.`;
    }
    case 'credential':
      return `Open the app with your phone's ${screenLock}.`;
    default:
      return `Set up a fingerprint or a ${screenLock} on this phone first, then turn this on.`;
  }
}

/** Space kept between the logo mark and the text under it on the lock screen. */
export const MARK_GAP = 24;

/**
 * The lock screen's logo area. Null: the whole screen, so the mark sits exactly
 * where the boot splash drew it. When the text and buttons at the bottom would
 * reach the mark (a short phone, large text, the sign-out message), the area
 * shrinks to the space above them and the mark centres there instead.
 */
export function markAreaHeight(screenHeight: number, bottomHeight: number, markSize: number): number | null {
  if (screenHeight <= 0 || bottomHeight <= 0) return null;
  const markBottom = screenHeight / 2 + markSize / 2 + MARK_GAP;
  if (markBottom <= screenHeight - bottomHeight) return null;
  return Math.max(markSize, screenHeight - bottomHeight);
}
