import { CircleCheck, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { OnboardingPatch } from '@/api/endpoints/clients';
import {
  ONBOARDING_STAGES,
  zTaskKind,
  type OnboardingStage,
  type OnboardingTask,
  type TaskKind,
  type TaskOwner,
  type TaskStatus,
} from '@/api/schemas/clients';
import { useCan } from '@/auth/permissions';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { EmptyState } from '@/components/EmptyState';
import type { SelectOption } from '@/components/form/Select';
import { Section } from '@/components/Section';
import type { SegmentItem } from '@/components/SegmentedControl';
import { StageTracker } from '@/components/StageTracker';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { formatDate } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { badgeFor, labelFor, stageLabel } from '../detail/logic';
import { useMeta } from '../detail/meta';
import { AddTaskSheet } from '../detail/onboarding/AddTaskSheet';
import {
  isRunComplete,
  statusToast,
  TASK_KIND_FALLBACK,
  TASK_OWNER_FALLBACK,
  TASK_STAGES,
  TASK_STATUS_FALLBACK,
  TASK_STATUSES,
} from '../detail/onboarding/logic';
import { RunControls } from '../detail/onboarding/RunControls';
import { RunSummary } from '../detail/onboarding/RunSummary';
import { TaskList, type TaskLabels } from '../detail/onboarding/TaskList';
import { TaskStatusSheet } from '../detail/onboarding/TaskStatusSheet';
import { useOnboardingWrites } from '../detail/onboarding/useOnboardingWrites';
import type { SectionProps } from './types';

const TASK_KINDS: readonly TaskKind[] = zTaskKind.options;
const TASK_OWNERS: readonly TaskOwner[] = ['client', 'tekmadev'];

const COMPLETE_MESSAGE = 'Mark onboarding complete. A completed run cannot be reopened.';

/** Fields of a PATCH, for the "Saving" line under the control being saved. */
const patchFields = (patch: OnboardingPatch | undefined): (keyof OnboardingPatch)[] =>
  patch ? (Object.keys(patch) as (keyof OnboardingPatch)[]) : [];

/**
 * Onboarding (brief 8.5, section 1): the stage tracker with the derived stage
 * and progress, the run's own controls (stage, target go-live, kickoff,
 * blocked), the checklist grouped by stage with one-tap status changes
 * (optimistic, with Undo), "Add a task" and "Mark onboarding complete".
 * A completed run is read only.
 *
 * Roles: the run's controls and "Mark onboarding complete" need
 * `clients.onboarding` (without it the settings show read only), "Add a task"
 * needs `clients.tasks.create`, and the status chips `clients.tasks.status`.
 */
export function OnboardingSection({ clientId, bundle }: SectionProps) {
  const meta = useMeta().data;
  const online = useIsOnline();
  const canRun = useCan('clients.onboarding');
  const canAddTask = useCan('clients.tasks.create');
  const canTaskStatus = useCan('clients.tasks.status');
  const writes = useOnboardingWrites(clientId);
  // The task is kept after closing, so the sheet's text stays while it slides away.
  const [statusSheet, setStatusSheet] = useState<{ open: boolean; task: OnboardingTask | null }>({ open: false, task: null });
  // A new key per open, so the form starts empty with a fresh idempotency key.
  const [adding, setAdding] = useState({ open: false, key: 0 });
  const [completing, setCompleting] = useState(false);

  const onboarding = bundle.onboarding;
  if (!onboarding) {
    return (
      <Section title="Onboarding">
        <EmptyState compact message="No active onboarding run." />
      </Section>
    );
  }

  const { run, tasks } = onboarding;
  const complete = isRunComplete(run);
  const locked = complete || !online;

  const stagesMeta = meta?.onboardingStages;
  const labels: TaskLabels = {
    stage: (s) => stageLabel(s, stagesMeta),
    dayRange: (s) => stagesMeta?.find((m) => m.value === s)?.dayRange ?? null,
    status: (s) => badgeFor(meta?.taskStatuses, s, TASK_STATUS_FALLBACK),
    owner: (o) => labelFor(meta?.taskOwners, o, TASK_OWNER_FALLBACK),
    kind: (k) => labelFor(meta?.taskKinds, k, TASK_KIND_FALLBACK),
  };

  const stageOption = (s: OnboardingStage): SelectOption<OnboardingStage> => {
    const range = labels.dayRange(s);
    return range ? { value: s, label: labels.stage(s), hint: range } : { value: s, label: labels.stage(s) };
  };
  const stageOptions = ONBOARDING_STAGES.map(stageOption);
  const taskStageOptions = TASK_STAGES.map(stageOption);
  const kindOptions: SelectOption<TaskKind>[] = TASK_KINDS.map((k) => ({ value: k, label: labels.kind(k) }));
  const ownerItems: SegmentItem<TaskOwner>[] = TASK_OWNERS.map((o) => ({ value: o, label: labels.owner(o) }));
  const statusOptions: SelectOption<TaskStatus>[] = TASK_STATUSES.map((s) => ({ value: s, label: labels.status(s).label }));

  const current = complete ? 'complete' : run.derivedStage;
  const currentRange = labels.dayRange(current);
  const defaultTaskStage = TASK_STAGES.includes(run.derivedStage) ? run.derivedStage : 'optimizing';
  const saving = writes.patchRun.isPending ? patchFields(writes.patchRun.variables?.patch) : [];

  const changeStatus = (task: OnboardingTask, next: TaskStatus) => {
    const previous = task.status;
    writes.setTaskStatus(task, next);
    notice.ok(statusToast(labels.status(next).label), {
      action: { label: 'Undo', onPress: () => writes.undoTaskStatus(task, previous) },
    });
  };

  return (
    <Section
      title="Onboarding"
      right={
        complete ? (
          <Badge label="Complete" tone="ok" dot />
        ) : run.blocked ? (
          <Badge label="Blocked" tone="signal" />
        ) : null
      }
    >
      <View style={styles.body}>
        <Card style={styles.tracker}>
          <StageTracker
            stages={ONBOARDING_STAGES.map((s) => ({ value: s, label: labels.stage(s) }))}
            current={current}
            percent={run.percentRequiredDone}
          />
          <View style={styles.trackerFoot}>
            <Text variant="small" color="ink3" tabular>
              {`${run.requiredDone} of ${run.requiredTotal} required tasks done`}
            </Text>
            {currentRange && !complete ? (
              <Text variant="caption" color="ink4">
                {`${labels.stage(current)}: ${currentRange}`}
              </Text>
            ) : null}
            {complete && run.completedAt ? (
              <Text variant="caption" color="ink4">
                {`Completed ${formatDate(run.completedAt)}. A completed run cannot be reopened.`}
              </Text>
            ) : null}
          </View>
        </Card>

        <Card>
          {canRun ? (
            <RunControls
              run={run}
              stageOptions={stageOptions}
              stageLabel={labels.stage}
              locked={complete}
              offline={!online}
              saving={saving}
              onPatch={(patch) => writes.patchRun.mutateAsync({ runId: run.id, patch })}
              onAskComplete={() => setCompleting(true)}
            />
          ) : (
            <RunSummary run={run} stageLabel={labels.stage} />
          )}
        </Card>

        <View style={styles.checklistHead}>
          <Text variant="eyebrow" accessibilityRole="header">
            Checklist
          </Text>
          {complete || !canAddTask ? null : (
            <Button
              label="Add a task"
              variant="secondary"
              size="sm"
              icon={Plus}
              disabled={!online}
              accessibilityHint={online ? 'Opens the new task form' : 'You are offline'}
              onPress={() => setAdding((a) => ({ open: true, key: a.key + 1 }))}
            />
          )}
        </View>

        <TaskList
          tasks={tasks}
          labels={labels}
          locked={locked || !canTaskStatus}
          onPressStatus={(task) => setStatusSheet({ open: true, task })}
        />

        {complete || !canRun ? null : (
          <Button
            label="Mark onboarding complete"
            variant="secondary"
            icon={CircleCheck}
            fullWidth
            disabled={!online}
            accessibilityHint={online ? 'Asks you to confirm' : 'You are offline'}
            onPress={() => setCompleting(true)}
            style={styles.complete}
          />
        )}
      </View>

      <TaskStatusSheet
        open={statusSheet.open}
        task={statusSheet.task}
        options={statusOptions}
        onClose={() => setStatusSheet((s) => ({ ...s, open: false }))}
        onChoose={changeStatus}
      />
      <AddTaskSheet
        key={adding.key}
        open={adding.open}
        onClose={() => setAdding((a) => ({ ...a, open: false }))}
        defaultStage={defaultTaskStage}
        stageOptions={taskStageOptions}
        kindOptions={kindOptions}
        ownerItems={ownerItems}
        onSubmit={(input, idempotencyKey) => writes.addTask.mutateAsync({ runId: run.id, input, idempotencyKey })}
      />
      <ConfirmSheet
        visible={completing}
        onClose={() => setCompleting(false)}
        title="Mark onboarding complete?"
        message={COMPLETE_MESSAGE}
        confirmLabel="Hold to mark complete"
        pendingLabel="Completing"
        tone="ink"
        onConfirm={() => writes.complete.mutateAsync(run.id)}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4] },
  tracker: { gap: space[3] },
  trackerFoot: { gap: 2 },
  checklistHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space[3],
    marginTop: space[2],
  },
  complete: { marginTop: space[2] },
});
