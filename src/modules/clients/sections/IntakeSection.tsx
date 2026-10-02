import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { reviewIntake } from '@/api/endpoints/clients';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PendingButton } from '@/components/PendingButton';
import { Section } from '@/components/Section';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { radius, space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { clientWriteKey, setBundle, settleClientWrite } from '../detail/cache';
import { IntakeAnswers } from '../detail/intake/IntakeAnswers';
import { INTAKE_STATUS, intakeAnswerGroups, intakeTimeline } from '../detail/intake/logic';
import { useMeta } from '../detail/meta';
import type { SectionProps } from './types';

/**
 * Intake (brief 8.5, section 2): the latest version's status, vN and its
 * submitted and reviewed times, "Mark reviewed" while it waits on us, and
 * every answer rendered from the intake schema in GET /meta. The answers are
 * open while the intake waits for review and folded otherwise, so a long
 * intake does not bury the sections below it.
 */
export function IntakeSection({ clientId, bundle }: SectionProps) {
  const queryClient = useQueryClient();
  const meta = useMeta();
  const intake = bundle.intake;
  // null: follow the status (open while submitted); true/false once the person chose.
  const [expanded, setExpanded] = useState<boolean | null>(null);

  const review = useMutation({
    mutationKey: clientWriteKey(clientId),
    mutationFn: (intakeId: string) => reviewIntake(intakeId),
    onSuccess: (next) => {
      // Reviewing also closes the "Review the intake" task: the page refetch brings the run.
      setBundle(queryClient, clientId, (b) => ({ ...b, intake: next }));
      haptics.success();
      notice.ok('Intake marked reviewed.');
    },
    onSettled: () => settleClientWrite(queryClient, clientId),
  });

  if (!intake) {
    return (
      <Section title="Intake">
        <EmptyState compact message="The client has not started the intake yet." />
      </Section>
    );
  }

  const status = INTAKE_STATUS[intake.status];
  const open = expanded ?? intake.status === 'submitted';
  const schema = meta.data?.intakeSchema;
  const groups = schema ? intakeAnswerGroups(schema, intake.answers) : null;
  const answered = groups?.reduce((n, g) => n + g.answered, 0) ?? 0;
  const total = groups?.reduce((n, g) => n + g.rows.length, 0) ?? 0;

  let answers: ReactNode = null;
  if (open) {
    if (groups) answers = <IntakeAnswers groups={groups} />;
    else if (meta.isError) answers = <ErrorState compact error={meta.error} onRetry={() => meta.refetch()} />;
    else {
      answers = (
        <SkeletonGroup style={styles.skeleton}>
          <Skeleton width="36%" />
          <Skeleton shape="block" height={180} style={styles.skeletonCard} />
        </SkeletonGroup>
      );
    }
  }

  return (
    <Section title="Intake">
      <Card style={styles.summary}>
        <View style={styles.statusRow}>
          <Badge label={status.label} tone={status.tone} size="md" dot />
          <Text variant="label" color="ink3" tabular accessibilityLabel={`Version ${intake.version}`}>
            {`v${intake.version}`}
          </Text>
        </View>
        <View style={styles.timeline}>
          {intakeTimeline(intake).map((line) => (
            <Text key={line} variant="small" color="ink3">
              {line}
            </Text>
          ))}
        </View>
        {intake.status === 'submitted' ? (
          <PendingButton
            label="Mark reviewed"
            pendingLabel="Saving"
            icon={ClipboardCheck}
            fullWidth
            onPress={() => review.mutateAsync(intake.id)}
          />
        ) : null}
      </Card>

      <Button
        label={open ? 'Hide answers' : groups ? `Show answers (${answered} of ${total})` : 'Show answers'}
        variant="ghost"
        size="sm"
        icon={open ? ChevronUp : ChevronDown}
        accessibilityHint={open ? 'Folds the answers away' : 'Shows every answer'}
        onPress={() => setExpanded(!open)}
        style={styles.toggle}
      />
      {answers}
    </Section>
  );
}

const styles = StyleSheet.create({
  summary: { gap: space[3] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  timeline: { gap: 2 },
  toggle: { alignSelf: 'flex-start', marginVertical: space[2] },
  skeleton: { gap: space[2] },
  skeletonCard: { borderRadius: radius.card },
});
