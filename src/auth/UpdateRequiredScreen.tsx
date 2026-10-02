import { ArrowDownToLine } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, errorMessage } from '@/api/errors';
import { Button } from '@/components/Button';
import { PendingButton } from '@/components/PendingButton';
import { Text } from '@/components/Text';
import { ASK_FOR_APK, openApkDownload } from '@/components/UpdateCard';
import { haptics } from '@/design/haptics';
import { durations, enterPull, springs } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { env } from '@/lib/env';
import { LogoMark } from '@/loader/LogoMark';

import { isBelowMinVersion, isUpdateAvailable, safeApkUrl } from './appVersion';
import { session, useMe, useSession } from './session';

export const UPDATE_MESSAGES = {
  title: 'Update required',
  body: 'This version of the app is too old to talk to the server.',
  stillTooOld: 'This version is still too old. Install the update to keep going.',
} as const;

const MARK_SIZE = 56;
const CONTENT_MAX_WIDTH = 440;

/**
 * enterPull, typed for `entering`. motion.ts declares a wider return type than the
 * function it actually returns, which `entering` rejects (reported to the lead).
 */
const pull = (index: number) => enterPull(index);

const settle = LinearTransition.springify()
  .damping(springs.default.damping)
  .stiffness(springs.default.stiffness)
  .mass(springs.default.mass);

/**
 * The blocking update screen (brief section 10): shown below `app.minVersion`
 * or on any HTTP 426. Calm, not alarming: what happened in one line, the way
 * out, and "Check again" for when the server's minimum changes back.
 */
export function UpdateRequiredScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const [problem, setProblem] = useState<string | null>(null);

  const apkUrl = safeApkUrl(me?.app.apkUrl);
  const latest = me && isUpdateAvailable(me.app) ? me.app.latestVersion : null;

  const checkAgain = async () => {
    setProblem(null);
    try {
      const fresh = await session.refreshMe();
      if (fresh && isBelowMinVersion(fresh.app)) {
        setProblem(UPDATE_MESSAGES.stillTooOld);
        haptics.error();
        return;
      }
      useSession.setState({ updateRequired: false });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.isUpgradeRequired) {
          setProblem(UPDATE_MESSAGES.stillTooOld);
          haptics.error();
          return;
        }
        // The server checks the version before the session, so a 401 means this
        // version got through: let go and show sign in (a stale session was
        // already signed out by the client).
        if (e.isUnauthorized) {
          useSession.setState({ updateRequired: false });
          return;
        }
      }
      setProblem(errorMessage(e));
      haptics.error();
    }
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={styles.fill}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space[8], paddingBottom: insets.bottom + space[8] },
        ]}
      >
        <View style={styles.column}>
          <Animated.View entering={FadeIn.duration(durations.slow)}>
            <LogoMark size={MARK_SIZE} />
          </Animated.View>

          <Animated.View entering={pull(1)} style={styles.titles}>
            <Text variant="eyebrow" tabular>{`Version ${env.appVersion}`}</Text>
            <Text variant="largeTitle" accessibilityRole="header">
              {UPDATE_MESSAGES.title}
            </Text>
            <Text variant="body" color="ink3">
              {UPDATE_MESSAGES.body}
            </Text>
            {latest ? (
              <Text variant="small" color="ink3" tabular>{`Version ${latest} is ready.`}</Text>
            ) : null}
          </Animated.View>

          <Animated.View entering={pull(2)} layout={settle} style={styles.actions}>
            {apkUrl ? (
              <Button
                label="Download the update"
                icon={ArrowDownToLine}
                fullWidth
                onPress={() => openApkDownload(apkUrl, colors)}
              />
            ) : (
              <Text variant="bodyStrong" color="ink2">
                {ASK_FOR_APK}
              </Text>
            )}
            <PendingButton
              label="Check again"
              pendingLabel="Checking"
              variant="secondary"
              fullWidth
              onPress={checkAgain}
            />
          </Animated.View>

          {problem ? (
            <Animated.View
              key={problem}
              entering={FadeIn.duration(durations.base)}
              layout={settle}
              accessibilityLiveRegion="polite"
            >
              <Text variant="label" color="signal" align="center" accessibilityRole="alert">
                {problem}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space[6] },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: space[8] },
  titles: { gap: space[3] },
  actions: { gap: space[3] },
});
