import { CircleCheck, Clock, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { AdsLastSync } from '@/api/schemas/ads';
import { JobProgress } from '@/components/automation/JobProgress';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { PendingButton } from '@/components/PendingButton';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import type { MetaPull } from '../hooks';
import { PULLING, syncLine } from '../logic';

type SyncCardProps = {
  lastSync: AdsLastSync | null;
  /** The minute clock, so "5 min ago" stays true while the screen sits open. */
  now: Date;
  pull: MetaPull;
};

/**
 * The sync status line ("Synced 5 min ago", or "Last sync failed" in signal
 * with the server's reason) and "Refresh from Meta". While the pull runs, the
 * black hole and "Pulling from Meta…" take the status line's place with the
 * elapsed time; the rest of the screen stays usable and the button is disabled.
 */
export function SyncCard({ lastSync, now, pull }: SyncCardProps) {
  return (
    <Card style={styles.card}>
      {pull.running ? (
        <JobProgress variant="inline" active title={PULLING} startedAt={pull.startedAt} note="Up to 2 minutes. You can keep using the app." />
      ) : (
        <SyncStatus lastSync={lastSync} now={now} />
      )}
      <PendingButton
        label="Refresh from Meta"
        icon={RefreshCw}
        variant="secondary"
        size="sm"
        disabled={pull.running}
        onPress={() => {
          // The job reports through its own progress row and toasts; the button only starts it.
          void pull.start();
        }}
        accessibilityHint="Pulls the latest spend and clicks from Meta. Up to 2 minutes."
        style={styles.button}
      />
    </Card>
  );
}

function SyncStatus({ lastSync, now }: { lastSync: AdsLastSync | null; now: Date }) {
  const line = syncLine(lastSync, now);

  if (line.kind === 'failed') {
    const spoken = [line.label, line.when, line.error].filter(Boolean).join(', ');
    return (
      <View style={styles.status} accessible accessibilityLabel={spoken} accessibilityLiveRegion="polite">
        <View style={styles.row} importantForAccessibility="no-hide-descendants">
          <Icon icon={TriangleAlert} size={18} tone="signal" />
          <Text variant="bodyStrong" tone="signal" style={styles.label}>
            {line.label}
          </Text>
          {line.when ? (
            <Text variant="small" color="ink4" tabular>
              {line.when}
            </Text>
          ) : null}
        </View>
        {line.error ? (
          <Text variant="small" color="ink2" style={styles.error} importantForAccessibility="no">
            {line.error}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.status} accessible accessibilityLabel={line.label} accessibilityLiveRegion="polite">
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        <Icon icon={line.kind === 'ok' ? CircleCheck : Clock} size={18} tone={line.kind === 'ok' ? 'ok' : 'muted'} />
        <Text variant="bodyStrong" color={line.kind === 'ok' ? 'ink' : 'ink3'} style={styles.label}>
          {line.label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3], marginBottom: space[6] },
  status: { minHeight: 56, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  label: { flex: 1 },
  // Lines up under the label, past the 18dp icon and its gap.
  error: { marginTop: space[1], marginLeft: 18 + space[2] },
  button: { alignSelf: 'flex-start' },
});
