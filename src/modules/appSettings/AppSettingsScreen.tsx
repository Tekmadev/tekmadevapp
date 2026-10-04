import { router, useFocusEffect } from 'expo-router';
import { Bell, Database, Eraser, LogOut, Palette, SlidersHorizontal } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { sessionKeys } from '@/api/endpoints/session';
import { ApiError, errorMessage } from '@/api/errors';
import { queryClient } from '@/api/query';
import { can } from '@/auth/permissions';
import { session, useSession } from '@/auth/session';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { haptics } from '@/design/haptics';
import { enterPull } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { connectivity } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { usePrefs } from '@/lib/prefs';
import { drafts } from '@/lib/storage';

import { AboutCard } from './AboutCard';
import { clearCachedData } from './clearCache';
import { CommissionCard } from './CommissionCard';
import { SETTINGS_COPY, THEME_OPTIONS } from './logic';
import { SecurityCard } from './SecurityCard';
import { SettingsGroup } from './SettingsGroup';
import { signOutMessage, signOutOnPurpose, SIGN_OUT_COPY } from './signOut';
import { useThemeCrossFade } from './useThemeCrossFade';

/** /me is refreshed on focus at most this often (the update card reads its version info). */
const ME_FRESH_MS = 60_000;

function refreshMeIfStale() {
  if (!connectivity.isOnline()) return;
  const updatedAt = queryClient.getQueryState(sessionKeys.me)?.dataUpdatedAt ?? 0;
  if (Date.now() - updatedAt < ME_FRESH_MS) return;
  session.refreshMe().catch(() => undefined);
}

/** Pull to refresh: the profile and version info behind "Check for updates". */
async function refreshMe() {
  if (!connectivity.isOnline()) return;
  try {
    await session.refreshMe();
  } catch (e) {
    // Session, owner-only and version problems are already handled by the client.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 426 || e.kind === 'aborted')) return;
    notice.err(errorMessage(e));
  }
}

async function clearCache() {
  await clearCachedData();
  haptics.success();
  notice.ok(SETTINGS_COPY.clearCacheDone);
}

/**
 * More, App settings (brief 8.18): Appearance (System / Light / Dark with a
 * cross-fade), Notifications, Security (biometric unlock, lock after, hide in
 * recents), Commission split (owners edit, managers read), Data ("Clear
 * cached data"), About (version, build, API mode, updates, the Kit easter
 * egg) and Sign out. Everything but the update check and the commission
 * split is local to the phone, so it works offline.
 */
export function AppSettingsScreen() {
  const { colors } = useTheme();
  const theme = usePrefs((s) => s.theme);
  const shot = useRef<View>(null);
  const crossFade = useThemeCrossFade(shot);
  const [clearOpen, setClearOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  // Every role has the Inbox today; a server list without it hides the notification settings too.
  // Signing out (from this screen) clears the profile: keep the group so nothing jumps on the way out.
  const notifications = useSession((s) => s.me === null || can(s.me, 'notifications.view'));

  useFocusEffect(refreshMeIfStale);

  const openSignOut = () => {
    setDraftCount(drafts.list().length);
    setSignOutOpen(true);
  };

  return (
    // The whole screen is the picture the theme cross-fade captures, so it needs a real native view.
    <View ref={shot} collapsable={false} onLayout={crossFade.onLayout} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <Screen title={SETTINGS_COPY.title} back onRefresh={refreshMe} queryKey={sessionKeys.me}>
        <SettingsGroup title={SETTINGS_COPY.appearance} icon={Palette} index={0} padded>
          <View style={styles.segment}>
            <SegmentedControl items={THEME_OPTIONS} value={theme} onChange={crossFade.change} accessibilityLabel={SETTINGS_COPY.appearance} />
          </View>
        </SettingsGroup>

        {notifications ? (
          <SettingsGroup title={SETTINGS_COPY.notifications} icon={Bell} index={1}>
            <ListRow
              title={SETTINGS_COPY.notificationsRow}
              subtitle={SETTINGS_COPY.notificationsRowHint}
              icon={SlidersHorizontal}
              onPress={() => router.push('/settings/notifications')}
            />
          </SettingsGroup>
        ) : null}

        <SecurityCard index={2} />

        {/* Owners edit it; managers read it; staff never see it. */}
        <CommissionCard index={3} />

        <SettingsGroup title={SETTINGS_COPY.data} icon={Database} index={3}>
          <ListRow
            title={SETTINGS_COPY.clearCache}
            subtitle={SETTINGS_COPY.clearCacheHint}
            icon={Eraser}
            chevron={false}
            onPress={() => setClearOpen(true)}
            accessibilityHint="Asks before clearing"
          />
        </SettingsGroup>

        <AboutCard index={4} />

        <Animated.View entering={enterPull(5)} style={styles.signOut}>
          <Card padded={false}>
            <ListRow
              title={SETTINGS_COPY.signOut}
              icon={LogOut}
              iconTone="signal"
              chevron={false}
              onPress={openSignOut}
              accessibilityHint="Asks before signing you out"
            />
          </Card>
        </Animated.View>
      </Screen>

      {crossFade.overlay}

      <ConfirmSheet
        visible={clearOpen}
        onClose={() => setClearOpen(false)}
        title={SETTINGS_COPY.clearCacheTitle}
        message={SETTINGS_COPY.clearCacheMessage}
        confirmLabel={SETTINGS_COPY.clearCacheConfirm}
        pendingLabel={SETTINGS_COPY.clearCachePending}
        tone="ink"
        requiresNetwork={false}
        onConfirm={clearCache}
      />

      <ConfirmSheet
        visible={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title={SIGN_OUT_COPY.title}
        message={signOutMessage(draftCount)}
        confirmLabel={SIGN_OUT_COPY.confirm}
        pendingLabel={SIGN_OUT_COPY.pending}
        tone={draftCount > 0 ? 'signal' : 'ink'}
        requiresNetwork={false}
        onConfirm={signOutOnPurpose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  segment: { paddingVertical: space[2] },
  signOut: { marginBottom: space[6] },
});
