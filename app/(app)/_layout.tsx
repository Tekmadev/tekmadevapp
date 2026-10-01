import { Stack } from 'expo-router';

import { BiometricOfferSheet } from '@/auth/BiometricOfferSheet';
import { useTheme } from '@/design/theme';

/** The signed-in area: tabs plus every pushed screen (native stack). */
export default function AppLayout() {
  const { colors } = useTheme();
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
      {/* The one-time "Unlock with your fingerprint next time?" offer after the first sign-in (brief 8.2). */}
      <BiometricOfferSheet />
    </>
  );
}
