import * as LocalAuthentication from 'expo-local-authentication';

import { NO_UNLOCK_SUPPORT, unlockMethodFor, type UnlockSupport } from './lockLogic';

/**
 * The phone's own unlock (expo-local-authentication), wrapped for the app lock.
 *
 * `authenticate` is the one way the lock and Settings ask for a fingerprint,
 * face or screen lock. While its prompt is up the app may briefly go to the
 * background (Android's PIN screen is a separate activity), and the lock gate
 * must not count that as the person leaving: `isAuthenticating()` tells it.
 */

let authenticating = 0;

/** True while a system unlock prompt started by `authenticate` is on screen. */
export function isAuthenticating(): boolean {
  return authenticating > 0;
}

/** What this phone can unlock with right now. Never throws; a failed check reads as nothing set up. */
export async function getUnlockSupport(): Promise<UnlockSupport> {
  try {
    const [level, types] = await Promise.all([
      LocalAuthentication.getEnrolledLevelAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync().catch((): LocalAuthentication.AuthenticationType[] => []),
    ]);
    return {
      method: unlockMethodFor(level),
      fingerprint: types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT),
      face: types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION),
    };
  } catch {
    return NO_UNLOCK_SUPPORT;
  }
}

/**
 * Shows the system prompt (biometric, falling back to the screen lock). Never
 * throws: an unexpected failure resolves as `unknown`.
 */
export async function authenticate(
  promptMessage: string,
  options: { requireConfirmation?: boolean } = {},
): Promise<LocalAuthentication.LocalAuthenticationResult> {
  authenticating += 1;
  try {
    return await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      requireConfirmation: options.requireConfirmation ?? true,
    });
  } catch {
    return { success: false, error: 'unknown' };
  } finally {
    authenticating -= 1;
  }
}
