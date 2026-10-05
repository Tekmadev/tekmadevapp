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

/**
 * The iOS app switcher cover (PrivacyCover): up whenever the app is not active,
 * except while a system prompt of our own (Face ID, a permission) makes it
 * inactive. In the background it is always up: that is when iOS takes the
 * snapshot the app switcher shows.
 */
export function coversContent(state: string, systemPrompt: boolean): boolean {
  if (state === 'background') return true;
  if (state === 'inactive') return !systemPrompt;
  return false;
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
  unavailableIos: 'This iPhone has no Face ID, Touch ID or passcode set up. Sign out, then sign in with your password.',
} as const;

/** "Nothing is set up on this phone", in the words of the platform. */
export function unlockUnavailableMessage(platform: string): string {
  return platform === 'ios' ? LOCK_COPY.unavailableIos : LOCK_COPY.unavailable;
}

/**
 * What to say after a failed system prompt. Null means stay quiet: backing out
 * of the prompt is a choice, and `app_cancel` means another prompt was already up.
 */
export function unlockErrorMessage(error: LocalAuthenticationError, platform: string): string | null {
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
      return unlockUnavailableMessage(platform);
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
  const message = unlockErrorMessage(error, platform);
  if (message === unlockUnavailableMessage(platform)) return biometricDescription(NO_UNLOCK_SUPPORT, platform);
  return message;
}

/** iPhone names its biometrics: Face ID or Touch ID (null when it has neither). */
export function iosBiometricName(support: Pick<UnlockSupport, 'fingerprint' | 'face'>): 'Face ID' | 'Touch ID' | null {
  if (support.face) return 'Face ID';
  if (support.fingerprint) return 'Touch ID';
  return null;
}

/** The help line under "Biometric unlock", in the words of what this phone actually has. */
export function biometricDescription(support: UnlockSupport, platform: 'android' | 'ios' | string): string {
  if (platform === 'ios') return iosBiometricDescription(support);
  const screenLock = 'screen lock';
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

function iosBiometricDescription(support: UnlockSupport): string {
  const name = iosBiometricName(support);
  switch (support.method) {
    case 'biometric':
      return `Open the app with ${name ?? 'Face ID or Touch ID'}. Your passcode works too.`;
    case 'credential':
      return 'Open the app with your iPhone passcode.';
    default:
      return name
        ? `Set up ${name} or a passcode on this iPhone first, then turn this on.`
        : 'Set up a passcode on this iPhone first, then turn this on.';
  }
}

/** The one-time "Unlock with your fingerprint next time?" offer after the first sign-in (brief 8.2). */
export type BiometricOfferCopy = {
  title: string;
  body: string;
  noHardware: string;
  notEnrolled: string;
  lockout: string;
  failed: string;
  turnedOn: string;
  /** The system prompt's reason line. */
  prompt: string;
};

/** The brief's words (Android). */
export const BIOMETRIC_OFFER_COPY: BiometricOfferCopy = {
  title: 'Unlock with your fingerprint next time?',
  body: 'When you come back to the app, your fingerprint opens it. You can change this any time in Settings.',
  noHardware: 'This phone has no fingerprint sensor.',
  notEnrolled: 'Add a fingerprint in your phone settings first, then turn this on in Settings.',
  lockout: LOCK_COPY.lockout,
  failed: 'Could not confirm your fingerprint. Try again.',
  turnedOn: 'Fingerprint unlock is on.',
  prompt: 'Turn on fingerprint unlock',
};

/** The offer in the words of the platform: on iPhone, Face ID (or Touch ID on a phone with a home button). */
export function biometricOfferCopy(platform: string, iosBiometric: 'Face ID' | 'Touch ID' | null): BiometricOfferCopy {
  if (platform !== 'ios') return BIOMETRIC_OFFER_COPY;
  const name = iosBiometric ?? 'Face ID';
  return {
    title: `Unlock with ${name} next time?`,
    body: `When you come back to the app, ${name} opens it. You can change this any time in Settings.`,
    noHardware: 'This iPhone has no Face ID or Touch ID.',
    notEnrolled: `Set up ${name} in your iPhone settings first, then turn this on in Settings.`,
    lockout: LOCK_COPY.lockout,
    failed: name === 'Touch ID' ? 'Could not confirm your fingerprint. Try again.' : 'Could not confirm your face. Try again.',
    turnedOn: `${name} unlock is on.`,
    prompt: `Turn on ${name} unlock`,
  };
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
