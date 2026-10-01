import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CACHE_BUSTER, CACHE_MAX_AGE, queryClient, queryPersister, shouldPersistQuery, wireQueryManagers } from '@/api/query';
import { installAuthBridge, session, useSession } from '@/auth/session';
import { SheetProvider } from '@/components/sheet/SheetProvider';
import { ToastHost } from '@/components/ToastHost';
import { ThemeProvider, useTheme } from '@/design/theme';
import { startConnectivity } from '@/lib/connectivity';
import { BootSplash } from '@/loader/BootSplash';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
startConnectivity();
wireQueryManagers();
installAuthBridge({
  onOwnerOnly: () => {
    if (router.canGoBack()) router.back();
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{
                persister: queryPersister,
                maxAge: CACHE_MAX_AGE,
                buster: CACHE_BUSTER,
                dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
              }}
            >
              <SheetProvider>
                <RootNavigator />
                <ToastHost />
              </SheetProvider>
            </PersistQueryClientProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const theme = useTheme();
  const status = useSession((s) => s.status);
  const updateRequired = useSession((s) => s.updateRequired);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    session.restore().catch(() => undefined);
  }, []);

  useEffect(() => {
    // Root view colour under every screen: no white flash between transitions.
    SystemUI.setBackgroundColorAsync(theme.colors.bg).catch(() => undefined);
  }, [theme.colors.bg]);

  const navTheme = useMemo(() => {
    const base = theme.isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.colors.bg,
        card: theme.colors.bg,
        text: theme.colors.ink,
        border: theme.colors.line,
        primary: theme.colors.gold,
        notification: theme.colors.signal,
      },
    };
  }, [theme]);

  const onLayout = useCallback(() => {
    // The JS boot splash is drawn on the same colour as the native one, so
    // hiding the native splash on first layout is seamless.
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const signedIn = status === 'signedIn';

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.bg }]} onLayout={onLayout}>
      <NavigationThemeProvider value={navTheme}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            contentStyle: { backgroundColor: theme.colors.bg },
          }}
        >
          <Stack.Protected guard={updateRequired}>
            <Stack.Screen name="update-required" />
          </Stack.Protected>
          <Stack.Protected guard={!updateRequired && signedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!updateRequired && !signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </NavigationThemeProvider>
      {!bootDone ? <BootSplash ready={status !== 'restoring'} onFinish={() => setBootDone(true)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
