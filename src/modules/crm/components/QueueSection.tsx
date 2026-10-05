import { RefreshCw } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CrmMeta, CrmQueueStat, CrmQueueStats, CrmRun } from '@/api/schemas/crm';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { JobProgress } from '@/components/automation/JobProgress';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { PendingButton } from '@/components/PendingButton';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { formatCount } from '@/lib/format';

import type { LongJob } from '../hooks';
import { byLabel, jobLabel, LONG_JOB_NOTE, NO_RUNS, runStatusBadge, SYNCING, VERIFY_FIRST, whenText } from '../logic';

const STATS: readonly { key: keyof CrmQueueStats; label: string }[] = [
  { key: 'waitingToPush', label: 'Waiting to push' },
  { key: 'pushed', label: 'Pushed' },
  { key: 'waitingToApply', label: 'Waiting to apply' },
  { key: 'applied', label: 'Applied from the CRM' },
];

type QueueCardProps = {
  queue: CrmQueueStats;
  sync: LongJob;
  busy: boolean;
  verified: boolean;
  /** `crm.write`: "Sync now". Without it only the figures show. */
  canWrite: boolean;
};

/**
 * The queue: four figures with the server's sub-lines (2 x 2; the labels wrap
 * rather than cut off at large font sizes), then "Sync now" (a long job,
 * `crm.write` only).
 */
export function QueueCard({ queue, sync, busy, verified, canWrite }: QueueCardProps) {
  return (
    <View style={styles.queue}>
      <View style={styles.grid}>
        <View style={styles.row}>
          <QueueTile label={STATS[0].label} stat={queue[STATS[0].key]} />
          <QueueTile label={STATS[1].label} stat={queue[STATS[1].key]} />
        </View>
        <View style={styles.row}>
          <QueueTile label={STATS[2].label} stat={queue[STATS[2].key]} />
          <QueueTile label={STATS[3].label} stat={queue[STATS[3].key]} />
        </View>
      </View>
      {canWrite ? (
        <Card style={styles.syncCard}>
          {sync.running ? (
            <JobProgress variant="inline" active title={SYNCING} startedAt={sync.startedAt} note={LONG_JOB_NOTE} />
          ) : (
            <Text variant="small" color="ink3">
              {verified ? 'Pushes what is waiting and applies what came in from the CRM, for each switch that is on.' : VERIFY_FIRST}
            </Text>
          )}
          <PendingButton
            label="Sync now"
            icon={RefreshCw}
            variant="secondary"
            size="sm"
            disabled={busy || sync.running || !verified}
            onPress={() => {
              void sync.start();
            }}
            accessibilityHint="Pushes and applies everything queued. Up to 2 minutes."
            style={styles.button}
          />
        </Card>
      ) : null}
    </View>
  );
}

function QueueTile({ label, stat }: { label: string; stat: CrmQueueStat }) {
  return (
    <Card style={styles.tile} accessibilityLabel={`${label}, ${formatCount(stat.count)}, ${stat.sub}`}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.tileBody}>
        <Text variant="eyebrow" numberOfLines={2}>
          {label}
        </Text>
        <AnimatedNumber value={stat.count} variant="number" />
        <Text variant="small" color="ink3" numberOfLines={3}>
          {stat.sub}
        </Text>
      </View>
    </Card>
  );
}

/** The run log: the latest 6 runs (job, started, by, the result line, status badge). */
export function RunLog({ runs, meta, now }: { runs: readonly CrmRun[]; meta: Partial<CrmMeta> | undefined; now: Date }) {
  if (runs.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState compact message={NO_RUNS} />
      </Card>
    );
  }
  return (
    <Card padded={false}>
      {runs.slice(0, 6).map((run, i) => (
        <Fragment key={run.id}>
          {i > 0 ? <Divider inset insetEnd /> : null}
          <RunRow run={run} meta={meta} now={now} />
        </Fragment>
      ))}
    </Card>
  );
}

function RunRow({ run, meta, now }: { run: CrmRun; meta: Partial<CrmMeta> | undefined; now: Date }) {
  const job = jobLabel(meta, run.job);
  const badge = runStatusBadge(meta, run.status);
  const when = whenText(run.startedAt, now);
  const by = byLabel(meta, run.by);
  const meta3 = [when, `by ${by}`].filter(Boolean).join(' · ');
  return (
    <View style={styles.run} accessible accessibilityLabel={`${job}, ${badge.label}. ${run.result} ${meta3}`}>
      <View style={styles.runTop} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text variant="bodyStrong" style={styles.runJob}>
          {job}
        </Text>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      <Text variant="small" color="ink2" importantForAccessibility="no">
        {run.result}
      </Text>
      <Text variant="small" color="ink4" tabular importantForAccessibility="no">
        {meta3}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  queue: { gap: space[3] },
  grid: { gap: space[3] },
  row: { flexDirection: 'row', gap: space[3] },
  tile: { flex: 1 },
  tileBody: { gap: space[2] },
  syncCard: { gap: space[3] },
  button: { alignSelf: 'flex-start' },
  run: { paddingHorizontal: space[4], paddingVertical: space[3], gap: 2 },
  runTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  runJob: { flex: 1 },
});
