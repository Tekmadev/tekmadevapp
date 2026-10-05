import * as ScreenCapture from 'expo-screen-capture';
import { createElement, use, useEffect } from 'react';
import { Platform } from 'react-native';

import { OverlayRootContext } from '@/components/sheet/context';
import { usePrefs } from '@/lib/prefs';

import { PrivacyCover } from './PrivacyCover';

/** Our own key, so another screen that blocks capture for a moment never undoes this setting. */
const CAPTURE_KEY = 'tekmadev.hideInRecents';

/** FLAG_SECURE: Recents shows a blank card, and screenshots and screen recordings come out black. */
function applyFlagSecure(on: boolean) {
  const task = on ? ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY) : ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY);
  task.catch(() => undefined);
}

/**
 * "Hide content in the recent apps screen" (brief 8.18; "in the app switcher"
 * on iPhone). Mounted once in the signed-in layout; follows the preference live
 * and lets go on sign-out.
 * - Android: FLAG_SECURE on the window (it covers sheets and toasts too).
 * - iOS: an opaque cover over everything while the app is not active
 *   (PrivacyCover, drawn as the top layer of the overlay root), so the
 *   app switcher snapshot shows the mark instead of client data. The full-screen
 *   image viewer, a Modal of its own, draws the same cover inside it.
 */
export function useSecureScreen() {
  const on = usePrefs((s) => s.hideInRecents);
  const root = use(OverlayRootContext);
  useEffect(() => {
    if (!on) return undefined;
    if (Platform.OS === 'ios') {
      return root?.showLayer({ key: 'privacy-cover', order: 2, modal: false, node: createElement(PrivacyCover) });
    }
    if (Platform.OS !== 'android') return undefined;
    applyFlagSecure(true);
    return () => applyFlagSecure(false);
  }, [on, root]);
}
