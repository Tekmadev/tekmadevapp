import { router } from 'expo-router';
import { Info } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isUpdateAvailable } from '@/auth/appVersion';
import { session, useMe } from '@/auth/session';
import { Divider } from '@/components/Divider';
import { KeyValue } from '@/components/KeyValue';
import { PendingButton } from '@/components/PendingButton';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { UpdateCard } from '@/components/UpdateCard';
import { haptics } from '@/design/haptics';
import { layout, space } from '@/design/tokens';
import { env, isMockApi } from '@/lib/env';
import { notice } from '@/lib/notice';
import { usePrefs } from '@/lib/prefs';

import { KIT_TAPS_START, registerKitTap, SETTINGS_COPY } from './logic';
import { SettingsGroup } from './SettingsGroup';

/** An unknown build version (no native module) never offers an update, like Home. */
const versionKnown = env.appVersion !== '0.0.0';

/**
 * About (brief 8.18): version and build, the API mode (dev builds, and every
 * build still on the mock API), "Check for updates" (GET /me, then the update
 * card or "You're on the latest version."), and the Kit easter egg: tap the
 * version 7 times, with a haptic countdown from the 4th tap.
 */
export function AboutCard({ index }: { index: number }) {
  const me = useMe();
  // Hidden for this visit only; Home remembers its own dismissal.
  const [dismissed, setDismissed] = useState(false);
  const showUpdate = Boolean(me && versionKnown && isUpdateAvailable(me.app) && !dismissed);

  const check = async () => {
    const fresh = await session.refreshMe();
    if (versionKnown && fresh && isUpdateAvailable(fresh.app)) {
      setDismissed(false);
      haptics.success();
      notice.ok(`Version ${fresh.app.latestVersion} is ready.`);
      return;
    }
    notice.ok(SETTINGS_COPY.latest);
  };

  const above =
    showUpdate && me ? (
      <UpdateCard latestVersion={me.app.latestVersion} apkUrl={me.app.apkUrl} onDismiss={() => setDismissed(true)} style={styles.update} />
    ) : null;

  return (
    <SettingsGroup title={SETTINGS_COPY.about} icon={Info} index={index} above={above}>
      <VersionRow />
      <Divider inset={layout.gutter} insetEnd={layout.gutter} />
      <KeyValue
        items={[
          { label: SETTINGS_COPY.build, value: env.buildNumber, mono: true },
          env.isDev || isMockApi ? { label: SETTINGS_COPY.apiMode, value: isMockApi ? 'Mock' : 'Live' } : null,
        ]}
      />
      <View style={styles.check}>
        <PendingButton
          label={SETTINGS_COPY.checkUpdates}
          pendingLabel={SETTINGS_COPY.checking}
          variant="secondary"
          fullWidth
          onPress={check}
          testID="settings-check-updates"
        />
      </View>
    </SettingsGroup>
  );
}

/** The version line. Seven quick taps open the Kit; from the 4th, each tap ticks so it feels like a countdown. */
function VersionRow() {
  const taps = useRef(KIT_TAPS_START);
  const value = env.appVersion;

  const onPress = () => {
    const { next, event } = registerKitTap(taps.current, Date.now());
    taps.current = next;
    if (event === 'countdown') {
      haptics.tick();
      return;
    }
    if (event === 'open') {
      haptics.success();
      usePrefs.getState().setKitUnlocked(true);
      router.push('/kit');
    }
  };

  return (
    <PressableScale
      haptic={false}
      pressedScale={0.99}
      onPress={onPress}
      accessibilityRole="text"
      accessibilityLabel={`${SETTINGS_COPY.version} ${value}`}
      testID="settings-version"
    >
      <View style={styles.row}>
        <Text variant="small" color="ink3">
          {SETTINGS_COPY.version}
        </Text>
        <Text variant="mono" align="right" style={styles.value}>
          {value}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  update: { marginBottom: space[3] },
  row: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingVertical: space[3],
    paddingHorizontal: layout.gutter,
  },
  value: { flex: 1 },
  check: { paddingHorizontal: layout.gutter, paddingTop: space[2], paddingBottom: space[4] },
});
