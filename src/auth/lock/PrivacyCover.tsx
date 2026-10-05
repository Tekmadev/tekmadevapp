import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View, type AppStateStatus } from 'react-native';

import { useTheme } from '@/design/theme';
import { SPLASH_MARK_SIZE } from '@/loader/BootSplash';
import { LogoMark } from '@/loader/LogoMark';

import { isAuthenticating } from './biometrics';
import { coversContent } from './lockLogic';

/** True while the app is out of the person's hands (app switcher, Control Center, another app). */
function useAway(): boolean {
  const [away, setAway] = useState(() => coversContent(AppState.currentState, isAuthenticating()));
  useEffect(() => {
    const onChange = (state: AppStateStatus) => setAway(coversContent(state, isAuthenticating()));
    onChange(AppState.currentState);
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);
  return away;
}

/**
 * iOS "Hide content in the app switcher" (Android uses FLAG_SECURE instead,
 * see useSecureScreen). While the app is not active, an opaque cover with the
 * mark where the splash and the lock draw it, so the app switcher snapshot and
 * Control Center show no client data. The system unlock and permission prompts
 * of our own (Face ID, notifications) leave the app showing behind them.
 * Pointer events pass through: it only ever shows while nobody can touch the app.
 */
export function PrivacyCover() {
  const { colors } = useTheme();
  const away = useAway();
  if (!away) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.bg }]}
    >
      <LogoMark size={SPLASH_MARK_SIZE} color={colors.gold} />
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
