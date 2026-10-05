import { Play, TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { CrmLastReconcile } from '@/api/schemas/crm';
import { JobProgress } from '@/components/automation/JobProgress';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { PendingButton } from '@/components/PendingButton';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import type { LongJob } from '../hooks';
import { LONG_JOB_NOTE, NO_RECONCILE, RECONCILING, reconcileLine, VERIFY_FIRST } from '../logic';

type ReconcileCardProps = {
  last: CrmLastReconcile | null;
  now: Date;
  reconcile: LongJob;
  busy: boolean;
  verified: boolean;
  /** `crm.write`: "Run now". Without it the card only reads. */
  canWrite: boolean;
};

/**
 * The last reconcile: "<time>: checked N contacts, corrected M." or the safety
 * stop's explanation in red, then "Run now" (a long job, "Checking every
 * contact", `crm.write` only).
 */
export function ReconcileCard({ last, now, reconcile, busy, verified, canWrite }: ReconcileCardProps) {
  const line = last ? reconcileLine(last, now) : null;

  return (
    <Card style={styles.card}>
      {reconcile.running ? (
        <JobProgress variant="inline" active title={RECONCILING} startedAt={reconcile.startedAt} note={LONG_JOB_NOTE} />
      ) : line === null ? (
        <Text variant="body" color="ink3">
          {NO_RECONCILE}
        </Text>
      ) : line.kind === 'ok' ? (
        <Text variant="body" tabular>
          {line.text}
        </Text>
      ) : (
        <View style={styles.halted} accessible accessibilityLabel={`${line.text} ${line.reason}`}>
          <View style={styles.haltedTop} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Icon icon={TriangleAlert} size={18} tone="signal" />
            <Text variant="bodyStrong" tone="signal" style={styles.flex}>
              {line.text}
            </Text>
          </View>
          <Text variant="small" color="ink2" importantForAccessibility="no">
            {line.reason}
          </Text>
        </View>
      )}
      {canWrite && !verified && !reconcile.running ? (
        <Text variant="small" color="ink4">
          {VERIFY_FIRST}
        </Text>
      ) : null}
      {canWrite ? (
        <PendingButton
          label="Run now"
          icon={Play}
          variant="secondary"
          size="sm"
          disabled={busy || reconcile.running || !verified}
          onPress={() => {
            void reconcile.start();
          }}
          accessibilityHint="Checks every contact on both sides. Up to 2 minutes."
          style={styles.button}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  halted: { gap: space[1] },
  haltedTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  flex: { flex: 1 },
  button: { alignSelf: 'flex-start' },
});
