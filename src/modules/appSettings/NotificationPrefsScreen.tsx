import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { AlertTriangle, BellOff, BellRing, type LucideIcon } from 'lucide-react-native';
import { Fragment, useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { notificationKeys, notificationPrefsQuery, sendTestPush } from '@/api/endpoints/notifications';
import { sessionKeys } from '@/api/endpoints/session';
import { ApiError, errorMessage, MESSAGES } from '@/api/errors';
import type { NotificationPref } from '@/api/schemas/notifications';
import { useCapabilities } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Switch } from '@/components/form/Switch';
import { Icon } from '@/components/Icon';
import { PendingButton } from '@/components/PendingButton';
import { Screen } from '@/components/Screen';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { durations, enterPull } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { isMockApi } from '@/lib/env';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { metaQuery } from '@/modules/overview/hooks';
import {
  forgetRegistration,
  permissionAction,
  presentLocalTest,
  PUSH_COPY,
  pushPitch,
  readableCategories,
  registerThisPhone,
  turnOnPush,
  usePushState,
} from '@/modules/push';

import { PREFS_COPY, prefRows, testPushMessage, type PrefField } from './logic';
import { usePushDeviceId } from './push';
import { usePrefMutation } from './usePrefMutation';

/** Each switch column: wide enough for the 52dp switch and the "QUIET" heading at font scale 1.3. */
const COLUMN = 64;
/**
 * App settings, Notifications (brief 8.4 "Preferences" and 8.18): per
 * category, Quiet (does not count toward unread) and Push (phone
 * notification), plus "Send a test notification". Only the categories this
 * person may read (`inbox.<category>`): staff see Leads and Clients. The
 * switches save at once and roll back if the server refuses.
 */
export function NotificationPrefsScreen() {
  return (
    <RequireCapability cap="notifications.view">
      <NotificationPrefsBody />
    </RequireCapability>
  );
}

function NotificationPrefsBody() {
  const capabilities = useCapabilities();
  const readable = readableCategories(capabilities);
  const online = useIsOnline();
  const query = useQuery(notificationPrefsQuery());
  const meta = useQuery(metaQuery());
  const save = usePrefMutation();
  useRefreshOnFocus([notificationKeys.prefs(), sessionKeys.meta]);
  // Back from the system settings, or a first visit: read the permission and register if needed.
  useFocusEffect(
    useCallback(() => {
      void registerThisPhone();
    }, []),
  );

  const data = query.data;
  const rows = data ? prefRows(data, meta.data?.notificationCategories, readable) : [];

  const onRefresh = async () => {
    // Offline the banner already explains; a refetch would only wait for the connection.
    if (!connectivity.isOnline()) return;
    await Promise.all([query.refetch(), meta.refetch()]);
  };

  const change = (pref: NotificationPref, field: PrefField, value: boolean) => {
    save.mutate({ category: pref.category, field, value });
  };

  let body: ReactNode;
  if (data) {
    body =
      rows.length > 0 ? (
        <Animated.View entering={enterPull(0)}>
          <PrefsTable rows={rows} disabled={!online} onChange={change} />
          <Text variant="small" color="ink3" style={styles.legend}>
            {PREFS_COPY.legend}
          </Text>
        </Animated.View>
      ) : (
        <EmptyState message={PREFS_COPY.empty} compact />
      );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    // Offline with nothing cached: say so, never an endless skeleton. It loads by itself once back online.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    // One bone per category this person will see, so nothing moves when the rows arrive.
    body = <PrefsSkeleton rows={Math.max(readable.length, 1)} />;
  }

  return (
    <Screen
      title={PREFS_COPY.title}
      subtitle={PREFS_COPY.subtitle}
      back
      onRefresh={onRefresh}
      refetching={query.isFetching && data !== undefined}
      offlineBanner={data !== undefined}
      queryKey={notificationKeys.prefs()}
    >
      {query.isRefetchError && data !== undefined && online ? (
        <ErrorState compact error={query.error} onRetry={() => query.refetch()} style={styles.refetchError} />
      ) : null}
      {body}
      <Animated.View entering={enterPull(1)} style={styles.test}>
        <PhonePushCard offHelp={pushPitch(readable).offHelp} />
      </Animated.View>
      <Animated.View entering={enterPull(2)} style={styles.testCard}>
        <TestPushCard />
      </Animated.View>
    </Screen>
  );
}

type PrefsTableProps = {
  rows: NotificationPref[];
  disabled: boolean;
  onChange: (pref: NotificationPref, field: PrefField, value: boolean) => void;
};

/** One row per category, with a Quiet and a Push column (headed once, at the top). */
function PrefsTable({ rows, disabled, onChange }: PrefsTableProps) {
  const hint = disabled ? MESSAGES.offline : undefined;
  return (
    <Card padded={false}>
      <View style={[styles.row, styles.headRow]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.label} />
        <Text variant="eyebrow" align="center" style={styles.column}>
          {PREFS_COPY.quiet}
        </Text>
        <Text variant="eyebrow" align="center" style={styles.column}>
          {PREFS_COPY.push}
        </Text>
      </View>
      {rows.map((pref) => (
        <Fragment key={pref.category}>
          <Divider />
          <View style={styles.row}>
            <Text variant="body" style={styles.label} numberOfLines={2}>
              {pref.label}
            </Text>
            <View style={styles.column}>
              <Switch
                value={pref.muted}
                onValueChange={(next) => onChange(pref, 'muted', next)}
                disabled={disabled}
                accessibilityLabel={`${pref.label}, ${PREFS_COPY.quiet}`}
                accessibilityHint={hint ?? PREFS_COPY.quietHint}
              />
            </View>
            <View style={styles.column}>
              <Switch
                value={pref.push}
                onValueChange={(next) => onChange(pref, 'push', next)}
                disabled={disabled}
                accessibilityLabel={`${pref.label}, ${PREFS_COPY.push}`}
                accessibilityHint={hint ?? PREFS_COPY.pushHint}
              />
            </View>
          </View>
        </Fragment>
      ))}
    </Card>
  );
}

/** Same shape as the table, so nothing moves when the rows arrive. */
function PrefsSkeleton({ rows }: { rows: number }) {
  return (
    <SkeletonGroup>
      <Card padded={false}>
        <View style={[styles.row, styles.headRow]}>
          <View style={styles.label} />
          <View style={styles.column}>
            <Skeleton width={36} />
          </View>
          <View style={styles.column}>
            <Skeleton width={30} />
          </View>
        </View>
        {Array.from({ length: rows }, (_, i) => (
          <Fragment key={i}>
            <Divider />
            <View style={styles.row}>
              <View style={styles.label}>
                <Skeleton width={i % 2 ? '45%' : '35%'} />
              </View>
              <View style={styles.column}>
                <Skeleton shape="block" width={52} height={32} style={styles.switchBone} />
              </View>
              <View style={styles.column}>
                <Skeleton shape="block" width={52} height={32} style={styles.switchBone} />
              </View>
            </View>
          </Fragment>
        ))}
      </Card>
    </SkeletonGroup>
  );
}

type TestResult = { tone: 'ok' | 'signal'; message: string };

/**
 * "Send a test notification" (POST /notifications/test-push). The server's
 * answer is shown under the button. Until push is set up on this phone the
 * card says so plainly; the test can still reach the person's other phones.
 * In mock API mode the mock cannot reach Expo, so after its answer this phone
 * shows a local test notification (Leads channel, same payload shape).
 */
function TestPushCard() {
  const { colors } = useTheme();
  const [result, setResult] = useState<TestResult | null>(null);
  const deviceId = usePushDeviceId();
  const permission = usePushState((s) => s.permission);

  const send = async () => {
    setResult(null);
    const { sent } = await sendTestPush(deviceId);
    haptics.success();
    const message = testPushMessage(sent, deviceId !== null);
    const local = isMockApi && deviceId !== null && permission?.status === 'granted';
    if (local) await presentLocalTest().catch(() => undefined);
    setResult({ tone: 'ok', message: local ? `${message} ${PUSH_COPY.mockLocalTest}` : message });
  };

  const onError = (error: unknown) => {
    // Sign-out, owner-only and update problems are already handled by the client.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 426 || error.kind === 'aborted')) return;
    haptics.error();
    setResult({ tone: 'signal', message: errorMessage(error) });
    // The server no longer knows this phone: set it up again (the card shows how that goes).
    if (error instanceof ApiError && error.code === 'no_devices' && deviceId !== null) {
      forgetRegistration();
      void registerThisPhone({ force: true });
    }
  };

  return (
    <Card>
      <View style={styles.testHead}>
        <View style={[styles.testIcon, { backgroundColor: colors.goldTint }]}>
          <Icon icon={BellRing} size={20} color="gold" />
        </View>
        <Text variant="small" color="ink3" style={styles.flex}>
          {deviceId ? PREFS_COPY.testHelp : PREFS_COPY.pushNotSetUp}
        </Text>
      </View>
      <PendingButton
        label={PREFS_COPY.test}
        pendingLabel={PREFS_COPY.testPending}
        variant="secondary"
        fullWidth
        onPress={send}
        onError={onError}
        style={styles.testButton}
      />
      {result ? (
        <Animated.View entering={FadeIn.duration(durations.base)} accessibilityLiveRegion="polite" style={styles.result}>
          <Text variant="label" color={result.tone === 'ok' ? 'ink2' : 'signal'} align="center" accessibilityRole={result.tone === 'ok' ? undefined : 'alert'}>
            {result.message}
          </Text>
        </Animated.View>
      ) : null}
    </Card>
  );
}

/**
 * Push on this phone (brief section 9): off (with "Turn on", which asks, or
 * opens the system settings when the system will not ask again), being set
 * up, set up, or failed with the reason in plain words and "Try again".
 * `offHelp` says what pushes this person would get.
 */
function PhonePushCard({ offHelp }: { offHelp: string }) {
  const { colors, tones } = useTheme();
  const permission = usePushState((s) => s.permission);
  const status = usePushState((s) => s.status);
  const error = usePushState((s) => s.error);

  const action = permission ? permissionAction(permission) : 'none';

  const turnOn = async () => {
    const next = await turnOnPush();
    if (next.status === 'granted') await registerThisPhone();
  };

  let icon: LucideIcon = BellRing;
  let iconColor: 'gold' | 'ink3' | 'signal' = 'gold';
  let title: string;
  let help: string | null;
  let button: ReactNode = null;
  if (permission === null) {
    title = PUSH_COPY.settingUp;
    help = PUSH_COPY.settingUpHelp;
  } else if (action !== 'none') {
    icon = BellOff;
    iconColor = 'ink3';
    title = PUSH_COPY.off;
    help = offHelp;
    button = (
      <PendingButton
        label={PUSH_COPY.turnOn}
        pendingLabel={PUSH_COPY.turningOn}
        requiresNetwork={false}
        fullWidth
        onPress={turnOn}
        accessibilityHint={action === 'ask' ? PUSH_COPY.askHint : PUSH_COPY.settingsHint}
        style={styles.testButton}
      />
    );
  } else if (status === 'failed') {
    icon = AlertTriangle;
    iconColor = 'signal';
    title = PUSH_COPY.failed;
    help = error?.message ?? null;
    button = (
      <PendingButton
        label={PUSH_COPY.tryAgain}
        pendingLabel={PUSH_COPY.retrying}
        variant="secondary"
        fullWidth
        onPress={() => registerThisPhone({ force: true })}
        style={styles.testButton}
      />
    );
  } else if (status === 'registered') {
    title = PUSH_COPY.on;
    help = PUSH_COPY.onHelp;
  } else {
    title = PUSH_COPY.settingUp;
    help = PUSH_COPY.settingUpHelp;
  }

  const tint = iconColor === 'signal' ? tones.signal.bg : iconColor === 'gold' ? colors.goldTint : colors.bg3;

  return (
    <Card>
      <View style={styles.testHead} accessible accessibilityLiveRegion="polite">
        <View style={[styles.testIcon, { backgroundColor: tint }]}>
          <Icon icon={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong" color={iconColor === 'signal' ? 'signal' : 'ink'}>
            {title}
          </Text>
          {help ? (
            <Text variant="small" color="ink3">
              {help}
            </Text>
          ) : null}
          {status === 'failed' && action === 'none' && error?.detail ? (
            <Text variant="small" color="ink4" selectable>
              {`${PUSH_COPY.details}: ${error.detail}`}
            </Text>
          ) : null}
        </View>
      </View>
      {button}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingLeft: space[4],
    paddingRight: space[2],
    paddingVertical: space[1],
    gap: space[1],
  },
  headRow: { minHeight: 40, paddingTop: space[3], paddingBottom: space[2] },
  label: { flex: 1 },
  column: { width: COLUMN, alignItems: 'center' },
  switchBone: { borderRadius: 16 },
  legend: { marginTop: space[3], paddingHorizontal: space[1] },
  refetchError: { marginBottom: space[4] },
  test: { marginTop: space[7] },
  testCard: { marginTop: space[4] },
  testHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  testIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  testButton: { marginTop: space[4] },
  result: { marginTop: space[3] },
  flex: { flex: 1 },
});
