import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint, ScanFace } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PendingButton } from '@/components/PendingButton';
import { useSubmitGroup } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { Sheet } from '@/components/sheet';
import { haptics } from '@/design/haptics';
import { durations } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { usePrefs } from '@/lib/prefs';
import { storage, StorageKeys } from '@/lib/storage';

import { BIOMETRIC_OFFER_COPY, biometricOfferCopy, iosBiometricName } from './lock/lockLogic';
import { session, useSession } from './session';

/** Let Home finish rising into place before a sheet asks for attention. */
const OFFER_DELAY_MS = 900;

/** The brief's words (Android). iPhone reads Face ID or Touch ID instead (biometricOfferCopy). */
export const BIOMETRIC_MESSAGES = BIOMETRIC_OFFER_COPY;

type IosBiometric = 'Face ID' | 'Touch ID' | null;

/** iPhone: which biometric it has, for the words and the icon. Android never asks (its copy is fixed). */
async function iosBiometric(): Promise<IosBiometric> {
  if (Platform.OS !== 'ios') return null;
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync().catch((): LocalAuthentication.AuthenticationType[] => []);
  return iosBiometricName({
    face: types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION),
    fingerprint: types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT),
  });
}

/** Only offered where it can work right now: a sensor and at least one enrolled fingerprint or face. */
async function biometricsUsable(): Promise<boolean> {
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && enrolled;
  } catch {
    return false;
  }
}

/**
 * The one-time offer after the first successful sign-in (brief 8.2). Mount it
 * once inside the signed-in layout; it shows itself when `justSignedIn` is set,
 * at most once per install (StorageKeys.biometricOffered), and only on a phone
 * that can actually unlock with a fingerprint (or Face ID or Touch ID on
 * iPhone). "Turn on" confirms with a real unlock before saving the preference,
 * so it can never lock anyone out.
 */
export function BiometricOfferSheet() {
  const justSignedIn = useSession((s) => s.justSignedIn);
  const alreadyOn = usePrefs((s) => s.biometricUnlock);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometric, setBiometric] = useState<IosBiometric>(null);
  const copy = biometricOfferCopy(Platform.OS, biometric);

  useEffect(() => {
    if (!justSignedIn) return undefined;
    if (alreadyOn || storage.getBoolean(StorageKeys.biometricOffered)) {
      session.acknowledgeSignIn();
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([biometricsUsable(), iosBiometric()])
        .then(([usable, kind]) => {
          if (cancelled) return;
          if (!usable) {
            session.acknowledgeSignIn();
            return;
          }
          // Remembered as soon as it is shown: "Not now", back and a swipe all count as an answer.
          storage.set(StorageKeys.biometricOffered, true);
          setBiometric(kind);
          setError(null);
          setVisible(true);
        })
        .catch(() => undefined);
    }, OFFER_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [justSignedIn, alreadyOn]);

  const close = () => {
    setVisible(false);
    session.acknowledgeSignIn();
  };

  const turnOn = async () => {
    setError(null);
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync().catch(() => false),
      LocalAuthentication.isEnrolledAsync().catch(() => false),
    ]);
    if (!hardware || !enrolled) {
      setError(hardware ? copy.notEnrolled : copy.noHardware);
      haptics.error();
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: copy.prompt,
      cancelLabel: 'Cancel',
    }).catch((): LocalAuthentication.LocalAuthenticationResult => ({ success: false, error: 'unknown' }));
    if (result.success) {
      usePrefs.getState().setBiometricUnlock(true);
      haptics.success();
      notice.ok(copy.turnedOn);
      close();
      return;
    }
    // Backing out of the system prompt is a choice, not a failure: stay quiet and keep the offer open.
    if (result.error === 'user_cancel' || result.error === 'system_cancel' || result.error === 'app_cancel') return;
    setError(result.error === 'lockout' ? copy.lockout : copy.failed);
    haptics.error();
  };

  return (
    <Sheet visible={visible} onClose={close} title={copy.title} footer={<OfferActions onTurnOn={turnOn} onNotNow={close} />}>
      <OfferBody body={copy.body} face={biometric === 'Face ID'} error={error} />
    </Sheet>
  );
}

function OfferBody({ body, face, error }: { body: string; face: boolean; error: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.body}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: colors.goldTint }]}>
          <Icon icon={face ? ScanFace : Fingerprint} size={24} color="gold" />
        </View>
        <Text variant="body" color="ink3" style={styles.flex}>
          {body}
        </Text>
      </View>
      {error ? (
        <Animated.View entering={FadeIn.duration(durations.base)} accessibilityLiveRegion="polite">
          <Text variant="label" color="signal" accessibilityRole="alert">
            {error}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Rendered inside the sheet, so "Not now" is disabled while the system prompt is up. */
function OfferActions({ onTurnOn, onNotNow }: { onTurnOn: () => Promise<void>; onNotNow: () => void }) {
  const { busy } = useSubmitGroup();
  return (
    <View style={styles.actions}>
      <PendingButton label="Turn on" pendingLabel="Confirming" requiresNetwork={false} fullWidth onPress={onTurnOn} />
      <Button label="Not now" variant="ghost" fullWidth disabled={busy} onPress={onNotNow} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[4] },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  actions: { gap: space[2] },
});
