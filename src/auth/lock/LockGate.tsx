import * as WebBrowser from 'expo-web-browser';
import { use, useEffect, useLayoutEffect, useState } from 'react';
import { AppState, Keyboard, Modal, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSession } from '@/auth/session';
import { OverlayRootContext } from '@/components/sheet/context';
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
 * Android: a Modal (its own window), so it sits above sheets, toasts and the
 * boot splash, TalkBack cannot reach what is under it, and Android back cannot
 * dismiss it (`onRequestClose` does nothing; Home still leaves the app).
 *
 * iOS: the top layer of the overlay root instead (LockLayer). An iOS Modal is a
 * presented view controller, and UIKit refuses to present one while another is
 * up (the image viewer, the in-app browser): the lock would silently not show.
 * There is no back button or edge swipe that reaches under it either.
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

  if (Platform.OS === 'ios') return <LockLayer locked={locked} />;
  return <LockModal locked={locked} />;
}

function LockModal({ locked }: { locked: boolean }) {
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

/**
 * iOS: the lock drawn above every sheet and toast in the app's own view, in the
 * same commit as the decision to lock (a layout effect), so no frame shows the
 * app. The keyboard goes down and an open in-app browser is closed, because
 * presented controllers would sit above it. The image viewer hides itself while
 * locked (ImageViewer).
 */
function LockLayer({ locked }: { locked: boolean }) {
  const root = use(OverlayRootContext);
  useLayoutEffect(() => {
    if (!locked || !root) return undefined;
    Keyboard.dismiss();
    WebBrowser.dismissBrowser().catch(() => undefined);
    return root.showLayer({ key: 'app-lock', order: 1, modal: true, node: <LockScreen /> });
  }, [locked, root]);
  // Outside an overlay root (never in the app) the Modal is the only way to cover the screen.
  return root ? null : <LockModal locked={locked} />;
}

/** Android back on the lock does nothing: only unlocking or signing out removes it. */
function ignoreBack() {}

const styles = StyleSheet.create({ fill: { flex: 1 } });
