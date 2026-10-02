import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { clientKeys } from '@/api/endpoints/clients';
import { sessionKeys } from '@/api/endpoints/session';
import { purgeTestData, rebuildTestCatalog, testModeKeys, testModeQuery } from '@/api/endpoints/testMode';
import { errorMessage, MESSAGES } from '@/api/errors';
import type { TestModeStatus } from '@/api/schemas/testMode';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { openInBrowser } from '@/components/automation/ApprovalBlocks';
import { useJobRunner } from '@/components/automation/useJobRunner';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ErrorState } from '@/components/ErrorState';
import { Screen } from '@/components/Screen';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { metaQuery } from '@/modules/overview/hooks';

import {
  afterPurge,
  hasTestData,
  INTRO,
  purgeConfirmMessage,
  purgeMessage,
  REBUILT_TOAST,
  rebuildFailureMessage,
  TEST_MODE_URL,
} from './logic';
import { CatalogSection, DataSection, PurchasesSection, SetupSection, TestCardCard } from './TestModeSections';

/**
 * Test mode (brief 8.15, owner only). The owner buys Webline on the real site
 * against the Stripe sandbox; test mode is a browser cookie, so the app opens
 * the website's test mode page in a Custom Tab and shows the test card. Below:
 * the sandbox status from the API (keys, webhook secret, catalog per product),
 * the test rows on record, "Rebuild test catalog" (a long job), "Delete all
 * test data" (hold to confirm) and the latest test purchases.
 */
export function TestModeScreen() {
  return (
    <OwnerOnly>
      <TestModeBody />
    </OwnerOnly>
  );
}

function TestModeBody() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const query = useQuery(testModeQuery());
  const meta = useQuery(metaQuery());
  useRefreshOnFocus([testModeKeys.all, sessionKeys.meta]);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const status = query.data;

  /* ---------- Rebuild test catalog (long job) ---------- */

  const job = useJobRunner((signal) => rebuildTestCatalog(signal));
  const [settling, setSettling] = useState(false);
  const startJob = job.start;
  const rebuilding = job.running || settling;

  const rebuild = async () => {
    const outcome = await startJob();
    if (outcome.status === 'busy' || outcome.status === 'cancelled') return;
    if (outcome.status === 'done') {
      queryClient.setQueryData(testModeKeys.status(), outcome.result);
      notice.ok(REBUILT_TOAST);
    } else {
      const message = rebuildFailureMessage(outcome.error, outcome.timedOut);
      if (message) notice.err(message);
    }
    // Either way the status is refetched: after a timeout the server may still be building.
    setSettling(true);
    try {
      await queryClient.invalidateQueries({ queryKey: testModeKeys.all });
    } finally {
      setSettling(false);
    }
  };

  /* ---------- Delete all test data ---------- */

  const purge = useMutation({
    mutationFn: () => purgeTestData(),
    onSuccess: (deleted) => {
      queryClient.setQueryData<TestModeStatus>(testModeKeys.status(), (old) => (old ? afterPurge(old) : old));
      notice.ok(purgeMessage(deleted));
      void queryClient.invalidateQueries({ queryKey: testModeKeys.all });
      // Test accounts leave the Clients list (with "Include test") and their detail screens.
      void queryClient.invalidateQueries({ queryKey: clientKeys.all });
    },
  });

  const onRefresh = async () => {
    // Offline a refetch would wait for the connection with the black hole spinning; the banner already explains.
    if (!connectivity.isOnline()) return;
    const [result] = await Promise.all([query.refetch(), meta.refetch()]);
    if (result.isError && result.data !== undefined && connectivity.isOnline()) notice.err(errorMessage(result.error));
  };

  let body: ReactNode;
  if (status) {
    body = (
      <>
        {query.isRefetchError && online ? (
          <ErrorState compact error={query.error} onRetry={() => query.refetch()} style={styles.refetchError} />
        ) : null}
        <SetupSection status={status} />
        <CatalogSection status={status} rebuilding={rebuilding} startedAt={job.startedAt} onRebuild={() => void rebuild()} />
        <DataSection status={status} canDelete={online && hasTestData(status)} onDelete={() => setConfirmPurge(true)} />
        <PurchasesSection purchases={status.recentPurchases} meta={meta.data} />
      </>
    );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  } else if (query.fetchStatus === 'paused') {
    // Offline with nothing cached: a skeleton would never end, so say why.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    body = <StatusSkeleton />;
  }

  return (
    <>
      <Screen
        title="Test mode"
        back
        onRefresh={onRefresh}
        refetching={query.isFetching && status !== undefined}
        offlineBanner={status !== undefined}
        queryKey={testModeKeys.status()}
      >
        <View style={styles.intro}>
          <Text variant="body" color="ink2">
            {INTRO}
          </Text>
          <Button
            label="Open test mode in the browser"
            icon={ExternalLink}
            fullWidth
            onPress={() => openInBrowser(TEST_MODE_URL, colors)}
            accessibilityHint="Opens the website's test mode page, where you switch it on and buy"
          />
        </View>
        <TestCardCard />
        {body}
      </Screen>
      <ConfirmSheet
        visible={confirmPurge}
        onClose={() => setConfirmPurge(false)}
        title="Delete all test data?"
        message={status ? purgeConfirmMessage(status.counts) : ''}
        confirmLabel="Hold to delete all test data"
        pendingLabel="Deleting"
        tone="signal"
        onConfirm={() => purge.mutateAsync()}
      />
    </>
  );
}

/** The status sections' shape while they load (after showAfterMs). */
function StatusSkeleton() {
  return (
    <SkeletonGroup>
      {[112, 168, 208, 216].map((height, i) => (
        <View key={i} style={styles.skeletonGroup}>
          <Skeleton width={120} height={20} />
          <Skeleton shape="block" height={height} style={styles.skeletonCard} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space[4], marginBottom: space[4] },
  refetchError: { marginBottom: space[4] },
  skeletonGroup: { gap: space[3], marginBottom: space[7] },
  skeletonCard: { borderRadius: radius.card },
});
