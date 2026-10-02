import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { usePrefs } from '@/lib/prefs';

/** Our own key, so another screen that blocks capture for a moment never undoes this setting. */
const CAPTURE_KEY = 'tekmadev.hideInRecents';
/** iOS app switcher blur, 0 to 1. Strong enough that no row or number can be read. */
const IOS_BLUR = 0.8;

function apply(on: boolean) {
  let task: Promise<void>;
  if (Platform.OS === 'android') {
    // FLAG_SECURE: Recents shows a blank card, and screenshots and screen recordings come out black.
    task = on ? ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY) : ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY);
  } else if (Platform.OS === 'ios') {
    // The iOS equivalent for the app switcher: a blur over the snapshot while the app is not active.
    task = on ? ScreenCapture.enableAppSwitcherProtectionAsync(IOS_BLUR) : ScreenCapture.disableAppSwitcherProtectionAsync();
  } else {
    return;
  }
  task.catch(() => undefined);
}

/**
 * "Hide content in the recent apps screen" (brief 8.18). Mounted once in the
 * signed-in layout; follows the preference live and lets go on sign-out.
 */
export function useSecureScreen() {
  const on = usePrefs((s) => s.hideInRecents);
  useEffect(() => {
    if (!on) return undefined;
    apply(true);
    return () => apply(false);
  }, [on]);
}
