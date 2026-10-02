import { useEffect, useEffectEvent, useState } from 'react';
import { AppState, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { HoldToConfirm } from '@/components/HoldToConfirm';
import { SubmitGroup } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { durations } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { drafts } from '@/lib/storage';
import { SPLASH_MARK_SIZE } from '@/loader/BootSplash';
import { LogoMark } from '@/loader/LogoMark';
import { signOutMessage, signOutOnPurpose, SIGN_OUT_COPY } from '@/modules/appSettings/signOut';

import { authenticate } from './biometrics';
import { LOCK_COPY, markAreaHeight, unlockErrorMessage } from './lockLogic';
import { appLock } from './lockStore';

/** Let the lock draw first, so the system prompt slides over it rather than over the app. */
const AUTO_PROMPT_DELAY_MS = 350;
/** Content is capped like the sign-in screen, so it stays one column on tablets. */
const MAX_WIDTH = 440;

/**
 * The full-screen lock. The logo mark sits exactly where the boot splash draws
 * it, so a cold start goes from splash to lock without the mark moving. It asks
 * for the fingerprint, face or screen lock once by itself (when the app is in
 * front), then waits for "Unlock". Signing out with a password sign-in later
 * is the way out for someone who cannot unlock.
 */
export function LockScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [height, setHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);
  const markArea = markAreaHeight(height, bottomHeight, SPLASH_MARK_SIZE);

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // No confirm tap after a face match: this only opens the app.
    const result = await authenticate(LOCK_COPY.prompt, { requireConfirmation: false });
    setBusy(false);
    if (result.success) {
      haptics.success();
      appLock.unlock();
      return;
    }
    const message = unlockErrorMessage(result.error);
    if (!message) return;
    setError(message);
    haptics.error();
  };

  // Ask once by itself, as soon as the app is in front (the lock can go up on the way to the background).
  const autoPrompt = useEffectEvent(() => {
    void unlock();
  });
  useEffect(() => {
    let asked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      if (asked || AppState.currentState !== 'active') return;
      asked = true;
      timer = setTimeout(autoPrompt, AUTO_PROMPT_DELAY_MS);
    };
    ask();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') ask();
    });
    return () => {
      subscription.remove();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const askSignOut = () => {
    setDraftCount(drafts.list().length);
    setError(null);
    setSigningOut(true);
  };

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.bg }]}
      accessibilityViewIsModal
      onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}
    >
      <View
        style={[styles.markArea, markArea === null ? StyleSheet.absoluteFill : { height: markArea }]}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
      >
        <LogoMark size={SPLASH_MARK_SIZE} color={colors.gold} />
      </View>

      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + space[6] }]}
        onLayout={(e: LayoutChangeEvent) => setBottomHeight(e.nativeEvent.layout.height)}
      >
        {signingOut ? (
          <SubmitGroup>
            <Animated.View entering={FadeIn.duration(durations.base)} style={styles.block}>
              <Text variant="headline" align="center" accessibilityRole="header">
                {SIGN_OUT_COPY.title}
              </Text>
              <Text variant="body" color="ink3" align="center">
                {signOutMessage(draftCount)}
              </Text>
              <View style={styles.actions}>
                <HoldToConfirm
                  label={SIGN_OUT_COPY.confirm}
                  pendingLabel={SIGN_OUT_COPY.pending}
                  tone={draftCount > 0 ? 'signal' : 'ink'}
                  requiresNetwork={false}
                  onConfirm={signOutOnPurpose}
                />
                <Button label={LOCK_COPY.cancel} variant="ghost" fullWidth onPress={() => setSigningOut(false)} />
              </View>
            </Animated.View>
          </SubmitGroup>
        ) : (
          <View style={styles.block}>
            <Text variant="headline" align="center" accessibilityRole="header">
              {LOCK_COPY.title}
            </Text>
            <Text variant="body" color="ink3" align="center">
              {LOCK_COPY.body}
            </Text>
            {error ? (
              <Animated.View entering={FadeIn.duration(durations.base)} accessibilityLiveRegion="polite">
                <Text variant="label" color="signal" align="center" accessibilityRole="alert">
                  {error}
                </Text>
              </Animated.View>
            ) : null}
            <View style={styles.actions}>
              <Button label={LOCK_COPY.unlock} pendingLabel={LOCK_COPY.unlocking} pending={busy} fullWidth onPress={() => void unlock()} />
              {/* Never disabled: if the system prompt never answers, signing out is still the way out. */}
              <Button label={LOCK_COPY.signOut} variant="ghost" fullWidth onPress={askSignOut} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  markArea: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space[6],
    paddingHorizontal: layout.gutter,
  },
  block: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: space[3] },
  actions: { gap: space[2], marginTop: space[3] },
});
