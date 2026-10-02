import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react-native';
import { Fragment, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { notificationKeys, notificationPrefsQuery, sendTestPush } from '@/api/endpoints/notifications';
import { sessionKeys } from '@/api/endpoints/session';
import { ApiError, errorMessage, MESSAGES } from '@/api/errors';
import type { NotificationPref } from '@/api/schemas/notifications';
import { useIsOwner } from '@/auth/session';
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
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { metaQuery } from '@/modules/overview/hooks';

import { PREFS_COPY, prefRows, testPushMessage, type PrefField } from './logic';
import { pushDeviceId } from './push';
import { usePrefMutation } from './usePrefMutation';

/** Each switch column: wide enough for the 52dp switch and the "QUIET" heading at font scale 1.3. */
const COLUMN = 64;
/** Skeleton rows while the preferences load (the brief's seven categories). */
const SKELETON_ROWS = 7;

/**
 * App settings, Notifications (brief 8.4 "Preferences" and 8.18): per
 * category, Quiet (does not count toward unread) and Push (phone
 * notification), plus "Send a test notification". Managers never see Team or
 * Audience. The switches save at once and roll back if the server refuses.
 */
export function NotificationPrefsScreen() {
  const isOwner = useIsOwner();
  const online = useIsOnline();
  const query = useQuery(notificationPrefsQuery());
  const meta = useQuery(metaQuery());
  const save = usePrefMutation();
  useRefreshOnFocus([notificationKeys.prefs(), sessionKeys.meta]);

  const data = query.data;
  const rows = data ? prefRows(data, meta.data?.notificationCategories, isOwner) : [];

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
    body = <PrefsSkeleton />;
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
function PrefsSkeleton() {
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
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
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
 * answer is shown under the button. Until push is set up on this phone (brief
 * section 9, needs the owner's Firebase file) the card says so plainly; the
 * test can still reach the person's other phones.
 */
function TestPushCard() {
  const { colors } = useTheme();
  const [result, setResult] = useState<TestResult | null>(null);
  const deviceId = pushDeviceId();

  const send = async () => {
    setResult(null);
    const { sent } = await sendTestPush(deviceId);
    haptics.success();
    setResult({ tone: 'ok', message: testPushMessage(sent, deviceId !== null) });
  };

  const onError = (error: unknown) => {
    // Sign-out, owner-only and update problems are already handled by the client.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 426 || error.kind === 'aborted')) return;
    haptics.error();
    setResult({ tone: 'signal', message: errorMessage(error) });
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
  testHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  testIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  testButton: { marginTop: space[4] },
  result: { marginTop: space[3] },
  flex: { flex: 1 },
});
