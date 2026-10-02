import { Stack } from 'expo-router';
import { useQuickActionRouting } from 'expo-quick-actions/router';

import { BiometricOfferSheet } from '@/auth/BiometricOfferSheet';
import { useTheme } from '@/design/theme';
import { onQuickAction, useAppShortcuts } from '@/modules/quickActions/shortcuts';
import { SearchSheet } from '@/modules/search/SearchSheet';

/**
 * The signed-in area: tabs plus every pushed screen (native stack), and the
 * app-level pieces that live as long as someone is signed in: the global
 * search sheet, the biometric offer, and the Android launcher shortcuts
 * (registered here, routed here, cleared when this unmounts on sign-out).
 */
export default function AppLayout() {
  const { colors } = useTheme();
  // Inside the signed-in layout (not the root) so a shortcut can navigate once routes exist.
  useQuickActionRouting(onQuickAction);
  useAppShortcuts();

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
        <Stack.Screen name="blog/[id]" options={{ animation: 'fade_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="links/qr/[id]" options={{ animation: 'fade' }} />
        <Stack.Screen name="kit" />
        <Stack.Screen name="assistant" options={{ animation: 'fade_from_bottom' }} />
      </Stack>
      {/* Global search, opened from the search button in every tab header (brief section 7). */}
      <SearchSheet />
      {/* The one-time "Unlock with your fingerprint next time?" offer after the first sign-in (brief 8.2). */}
      <BiometricOfferSheet />
    </>
  );
}
