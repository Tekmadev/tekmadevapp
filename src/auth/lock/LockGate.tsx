import { useEffect, useState } from 'react';
import { AppState, Modal, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSession } from '@/auth/session';
import { usePrefs } from '@/lib/prefs';

import { LockScreen } from './LockScreen';
import { appLock, useAppLock } from './lockStore';

/**
 * A cold start with a saved session locks; signing in with a password a moment
 * ago does not (`justSignedIn` is still set while the signed-in layout mounts).
 */
function lockedAtStart(): boolean {
  return usePrefs.getState().biometricUnlock && !useSession.getState().justSignedIn;
}

/**
 * The app lock (brief 8.18, section 13 phase 6). Mount once in the signed-in
 * layout. With biometric unlock on, it covers everything on a cold start and
 * whenever the app returns after the chosen "Lock after" delay, until the
 * person unlocks or signs out.
 *
 * It is a Modal (its own window), so it sits above sheets, toasts and the boot
 * splash, TalkBack cannot reach what is under it, and Android back cannot
 * dismiss it (`onRequestClose` does nothing; Home still leaves the app).
 */
export function LockGate() {
  const [atStart] = useState(lockedAtStart);
  const stored = useAppLock((s) => s.locked);
  const enabled = usePrefs((s) => s.biometricUnlock);
  const locked = enabled && (stored ?? atStart);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => appLock.onAppStateChange(state));
    return () => {
      subscription.remove();
      appLock.reset();
    };
  }, []);

  return (
    <Modal
      visible={locked}
      transparent
      // No fade in: the content under it must never show through while it appears.
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      hardwareAccelerated
      onRequestClose={ignoreBack}
    >
      {/* A Modal is a separate window: gestures (HoldToConfirm) need their own root. */}
      <GestureHandlerRootView style={styles.fill}>
        <LockScreen />
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Android back on the lock does nothing: only unlocking or signing out removes it. */
function ignoreBack() {}

const styles = StyleSheet.create({ fill: { flex: 1 } });
