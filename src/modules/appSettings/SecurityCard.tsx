import { Shield } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { authenticate, getUnlockSupport } from '@/auth/lock/biometrics';
import { biometricDescription, LOCK_COPY, NO_UNLOCK_SUPPORT, turnOnErrorMessage } from '@/auth/lock/lockLogic';
import { useUnlockSupport } from '@/auth/lock/useUnlockSupport';
import { Divider } from '@/components/Divider';
import { Select } from '@/components/form/Select';
import { SwitchRow } from '@/components/form/Switch';
import { haptics } from '@/design/haptics';
import { durations } from '@/design/motion';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { usePrefs } from '@/lib/prefs';

import { hideInRecentsCopy, LOCK_AFTER_OPTIONS, SETTINGS_COPY } from './logic';
import { SettingsGroup } from './SettingsGroup';

/** Shown (disabled) while the first check of the phone's unlock methods runs, so the row does not jump. */
const CHECKING = biometricDescription({ method: 'biometric', fingerprint: false, face: false }, Platform.OS);
const HIDE_CONTENT = hideInRecentsCopy(Platform.OS);

/**
 * Security (brief 8.18, section 13 phase 6): biometric unlock, how soon it
 * locks again, and "Hide content in the recent apps screen" ("in the app
 * switcher" on iPhone). Biometric unlock
 * is only offered when the phone has a biometric or a screen lock set up, and
 * turning it on asks for one successful unlock first, so nobody locks
 * themselves out. Everything here is local, so it works offline.
 */
export function SecurityCard({ index }: { index: number }) {
  const biometricUnlock = usePrefs((s) => s.biometricUnlock);
  const lockAfter = usePrefs((s) => s.lockAfter);
  const hideInRecents = usePrefs((s) => s.hideInRecents);
  const support = useUnlockSupport();
  const [turningOn, setTurningOn] = useState(false);

  const unavailable = support?.method === 'none';
  // Already on: always offer the way to turn it off, whatever the phone says now.
  const canToggle = biometricUnlock || (support !== null && !unavailable);
  const description = support ? biometricDescription(support, Platform.OS) : CHECKING;

  const turnOn = async () => {
    setTurningOn(true);
    const current = await getUnlockSupport();
    if (current.method === 'none') {
      setTurningOn(false);
      haptics.error();
      notice.err(biometricDescription(NO_UNLOCK_SUPPORT, Platform.OS));
      return;
    }
    const result = await authenticate(LOCK_COPY.promptTurnOn);
    setTurningOn(false);
    if (result.success) {
      usePrefs.getState().setBiometricUnlock(true);
      haptics.success();
      notice.ok(SETTINGS_COPY.biometricOn);
      return;
    }
    const message = turnOnErrorMessage(result.error, Platform.OS);
    if (!message) return;
    haptics.error();
    notice.err(message);
  };

  const toggleBiometric = (next: boolean) => {
    if (next) {
      void turnOn();
      return;
    }
    usePrefs.getState().setBiometricUnlock(false);
    notice.ok(SETTINGS_COPY.biometricOff);
  };

  return (
    <SettingsGroup title={SETTINGS_COPY.security} icon={Shield} index={index} padded>
      <SwitchRow
        label={SETTINGS_COPY.biometric}
        description={description}
        value={biometricUnlock}
        onValueChange={toggleBiometric}
        pending={turningOn}
        disabled={!canToggle}
        testID="settings-biometric"
      />
      {biometricUnlock ? (
        <Animated.View entering={FadeIn.duration(durations.base)} exiting={FadeOut.duration(durations.fast)}>
          <Divider />
          <View style={styles.field}>
            <Select
              label={SETTINGS_COPY.lockAfter}
              options={LOCK_AFTER_OPTIONS}
              value={lockAfter}
              onChange={(value) => usePrefs.getState().setLockAfter(value)}
              help={SETTINGS_COPY.lockAfterHelp}
              fill="bg2"
              testID="settings-lock-after"
            />
          </View>
        </Animated.View>
      ) : null}
      <Divider />
      <SwitchRow
        label={HIDE_CONTENT.label}
        description={HIDE_CONTENT.description}
        value={hideInRecents}
        onValueChange={(next) => usePrefs.getState().setHideInRecents(next)}
        testID="settings-hide-in-recents"
      />
    </SettingsGroup>
  );
}

const styles = StyleSheet.create({
  field: { paddingVertical: space[3] },
});
