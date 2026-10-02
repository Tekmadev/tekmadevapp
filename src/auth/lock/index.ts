/**
 * The app lock and the secure-screen setting (brief 8.18, section 13 phase 6).
 * Mount `<LockGate />` and call `useSecureScreen()` once, in the signed-in layout.
 */
export { authenticate, getUnlockSupport, isAuthenticating } from './biometrics';
export { LockGate } from './LockGate';
export {
  biometricDescription,
  LOCK_COPY,
  NO_UNLOCK_SUPPORT,
  turnOnErrorMessage,
  unlockErrorMessage,
  type UnlockMethod,
  type UnlockSupport,
} from './lockLogic';
export { appLock, useAppLock } from './lockStore';
export { useSecureScreen } from './useSecureScreen';
export { useUnlockSupport } from './useUnlockSupport';
