import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError, MESSAGES } from '@/api/errors';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Skeleton, SkeletonGroup, SkeletonList } from '@/components/Skeleton';
import { SwitchRow } from '@/components/form/Switch';
import { space } from '@/design/tokens';
import { useConnectivity, useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import { Caption, Demo } from '../kitLayout';
import { failAfter } from '../sampleData';

const OWNER_ONLY = new ApiError({ status: 403, code: 'owner_only', message: MESSAGES.ownerOnly });

export function StatesDemos() {
  const online = useIsOnline();
  const simulatedOffline = useConnectivity((s) => s.simulatedOffline);
  const setSimulatedOffline = useConnectivity((s) => s.setSimulatedOffline);
  const [attempts, setAttempts] = useState(0);
  const [skeletonRun, setSkeletonRun] = useState(0);
  // Fixed for this visit, like a query's dataUpdatedAt: "showing what was loaded at ...".
  const [loadedAt] = useState(() => Date.now() - 7 * 60_000);

  return (
    <>
      <Demo title="Empty" note="Nothing here yet: a faint mark, one line, maybe an action. Never used for a failure.">
        <EmptyState message="No leads yet. Lead forms, booked calls, free tool submissions and portal sign-ups appear here." compact />
        <EmptyState
          message="No coupons yet."
          compact
          action={{ label: 'New coupon', icon: Plus, onPress: () => notice.ok('New coupon pressed.') }}
        />
      </Demo>

      <Demo title="Empty, full screen" note="The same, sized for a whole screen.">
        <EmptyState message="No clients match these filters." />
      </Demo>

      <Demo title="Error" note="A read failed: the message and Retry. This retry fails on purpose.">
        <ErrorState
          onRetry={() => {
            setAttempts((n) => n + 1);
            return failAfter(1200);
          }}
        />
        <Caption>{attempts > 0 ? `Retried ${attempts} time(s). Still failing, still no zeros.` : 'Press Retry: it spins, then fails again.'}</Caption>
      </Demo>

      <Demo title="Error, compact" note="For one failed card inside a working screen; shows the API's own message.">
        <ErrorState error={OWNER_ONLY} compact onRetry={() => failAfter(800, MESSAGES.ownerOnly)} />
        <ErrorState message={MESSAGES.timeout} compact retrying onRetry={() => undefined} />
        <Caption>The second one is retrying from outside (a query already refetching).</Caption>
      </Demo>

      <Demo title="Skeleton" note="Warm shimmer, only after showAfterMs so fast loads never flash it.">
        <Button label="Replay" variant="secondary" size="sm" onPress={() => setSkeletonRun((n) => n + 1)} />
        <SkeletonGroup key={`group-${skeletonRun}`} style={styles.group}>
          <View style={styles.row}>
            <Skeleton shape="circle" size={40} />
            <View style={styles.lines}>
              <Skeleton width="70%" />
              <Skeleton width="45%" />
            </View>
          </View>
          <Skeleton shape="block" height={96} />
        </SkeletonGroup>
        <SkeletonList key={`list-${skeletonRun}`} rows={3} />
      </Demo>

      <Demo title="Offline banner" note="Quiet, under the title of every screen while offline.">
        <SwitchRow label="Simulate offline" value={simulatedOffline} onValueChange={setSimulatedOffline} />
        {online ? (
          <Caption>Online: the banner renders nothing. Turn on Simulate offline.</Caption>
        ) : (
          <OfflineBanner updatedAt={loadedAt} />
        )}
      </Demo>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  lines: { flex: 1, gap: space[2] },
});
