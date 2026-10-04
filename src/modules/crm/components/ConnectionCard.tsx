import { CircleCheck, CircleX, ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { CrmConnection, CrmMeta, CrmProbeResult } from '@/api/schemas/crm';
import { JobProgress } from '@/components/automation/JobProgress';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Icon } from '@/components/Icon';
import { PendingButton } from '@/components/PendingButton';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import type { LongJob } from '../hooks';
import { healthBadge, lastCheckedLine, LONG_JOB_NOTE, VERIFYING } from '../logic';

type ConnectionCardProps = {
  connection: CrmConnection;
  meta: Partial<CrmMeta> | undefined;
  now: Date;
  verify: LongJob;
  /** Another long job is running: one at a time. */
  busy: boolean;
  /** `crm.write`: "Verify connection". Without it the card only reads. */
  canWrite: boolean;
};

/**
 * The Connection card: the status badge with its one-line explanation, the
 * Verify checklist (each probe's plain sentence, and why it failed), "Last
 * checked <time>" and "Verify connection" (a long job, about 20 seconds,
 * `crm.write` only).
 */
export function ConnectionCard({ connection, meta, now, verify, busy, canWrite }: ConnectionCardProps) {
  const badge = healthBadge(meta, connection.health);
  const results = connection.probe?.results ?? [];
  const checked = lastCheckedLine(connection.probe?.checkedAt, now);

  return (
    <Card style={styles.card}>
      <View style={styles.status} accessible accessibilityLabel={`${badge.label}. ${connection.explanation}`} accessibilityLiveRegion="polite">
        <Badge label={badge.label} tone={badge.tone} dot size="md" style={styles.badge} />
        <Text variant="body" color="ink2" importantForAccessibility="no">
          {connection.explanation}
        </Text>
      </View>

      {verify.running ? (
        <JobProgress variant="inline" active title={VERIFYING} startedAt={verify.startedAt} note={LONG_JOB_NOTE} />
      ) : results.length > 0 ? (
        <View style={styles.checklist}>
          <Divider />
          {results.map((result) => (
            <ProbeRow key={result.key} result={result} />
          ))}
        </View>
      ) : null}

      <Text variant="small" color="ink4">
        {checked}
      </Text>

      {canWrite ? (
        <PendingButton
          label="Verify connection"
          icon={ShieldCheck}
          variant="secondary"
          size="sm"
          disabled={busy || verify.running || !connection.configured}
          onPress={() => {
            // The job reports through its own progress row and toasts; the button only starts it.
            void verify.start();
          }}
          accessibilityHint={connection.configured ? 'Runs every check against the CRM. About 20 seconds.' : 'Add the CRM token on the website first.'}
          style={styles.button}
        />
      ) : null}
    </Card>
  );
}

function ProbeRow({ result }: { result: CrmProbeResult }) {
  const detail = !result.ok && result.detail?.trim() ? result.detail.trim() : null;
  const spoken = [result.ok ? 'Passed' : 'Failed', result.sentence, detail].filter(Boolean).join('. ');
  return (
    <View style={styles.probe} accessible accessibilityLabel={spoken}>
      <View style={styles.probeIcon} importantForAccessibility="no-hide-descendants">
        <Icon icon={result.ok ? CircleCheck : CircleX} size={18} tone={result.ok ? 'ok' : 'signal'} />
      </View>
      <View style={styles.probeText} importantForAccessibility="no-hide-descendants">
        <Text variant="body">
          {result.sentence}
        </Text>
        {detail ? (
          <Text variant="small" tone="signal">
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  status: { gap: space[2] },
  badge: { alignSelf: 'flex-start' },
  checklist: { gap: space[3] },
  probe: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  // Centres the 18dp icon on the 22dp first line.
  probeIcon: { paddingTop: 2 },
  probeText: { flex: 1, gap: 2 },
  button: { alignSelf: 'flex-start' },
});
