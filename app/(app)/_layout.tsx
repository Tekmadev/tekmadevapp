import { Stack } from 'expo-router';
import { useQuickActionRouting } from 'expo-quick-actions/router';

import { BiometricOfferSheet } from '@/auth/BiometricOfferSheet';
import { LockGate } from '@/auth/lock/LockGate';
import { useSecureScreen } from '@/auth/lock/useSecureScreen';
import { useTheme } from '@/design/theme';
import { PushHost } from '@/modules/push/PushHost';
import { onQuickAction, useAppShortcuts } from '@/modules/quickActions/shortcuts';
import { SearchSheet } from '@/modules/search/SearchSheet';

/**
 * The signed-in area: tabs plus every pushed screen (native stack), and the
 * app-level pieces that live as long as someone is signed in: the global
 * search sheet, the biometric offer, the app shortcuts (long-press the app icon,
 * on Android and iPhone: registered here, routed here, cleared when this
 * unmounts on sign-out), the app lock and "Hide content in the recent apps
 * screen" (brief 8.18), and push notifications (brief section 9).
 *
 * Every pushed screen shows its own back button: iPhone has no system back.
 * The iOS edge swipe pops any screen; the blog editor's unsaved-changes guard
 * (usePreventRemove) turns that swipe into its "Save your changes?" sheet.
 * The native stack ignores `gestureEnabled` on Android (back is handled in JS).
 */
export default function AppLayout() {
  const { colors } = useTheme();
  // Inside the signed-in layout (not the root) so a shortcut can navigate once routes exist.
  useQuickActionRouting(onQuickAction);
  useAppShortcuts();
  // FLAG_SECURE on Android (the app switcher cover on iOS) while the setting is on.
  useSecureScreen();

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="clients/new" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="demos/new" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="blog/[id]" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="links/qr/[id]" options={{ animation: 'fade' }} />
        <Stack.Screen name="kit" />
        <Stack.Screen name="assistant" options={{ animation: 'fade_from_bottom' }} />
      </Stack>
      {/* Global search, opened from the search button in every tab header (brief section 7). */}
      <SearchSheet />
      {/* The one-time "Unlock with your fingerprint next time?" offer after the first sign-in (brief 8.2). */}
      <BiometricOfferSheet />
      {/* Push (brief section 9): channels, registration, foreground toasts, tap routing, the one-time offer. */}
      <PushHost />
      {/* Biometric unlock: above everything, including sheets and toasts, until unlocked. */}
      <LockGate />
    </>
  );
}
