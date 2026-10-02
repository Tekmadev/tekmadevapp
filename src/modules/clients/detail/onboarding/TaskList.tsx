import { ChevronDown } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import type { OnboardingStage, OnboardingTask, TaskKind, TaskOwner, TaskStatus } from '@/api/schemas/clients';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space, type Tone } from '@/design/tokens';

import { groupTasks, isClosedStatus, taskMetaParts } from './logic';

export type TaskLabels = {
  stage: (stage: OnboardingStage) => string;
  dayRange: (stage: OnboardingStage) => string | null;
  status: (status: TaskStatus) => { label: string; tone: Tone };
  owner: (owner: TaskOwner) => string;
  kind: (kind: TaskKind) => string;
};

export type TaskListProps = {
  tasks: readonly OnboardingTask[];
  labels: TaskLabels;
  /** The status chips do nothing (a complete run, or offline). */
  locked: boolean;
  onPressStatus: (task: OnboardingTask) => void;
};

/** The task's status as a tinted chip; tapping it opens the status sheet. */
function StatusChip({ label, tone, locked, onPress }: { label: string; tone: Tone; locked: boolean; onPress: () => void }) {
  const { tones } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={locked}
      pressedScale={0.95}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`Status: ${label}`}
      accessibilityHint={locked ? undefined : 'Changes the status'}
      accessibilityState={{ disabled: locked }}
      style={[styles.chip, { backgroundColor: tones[tone].bg }]}
    >
      <Text variant="caption" tone={tone} weight="600" numberOfLines={1}>
        {label}
      </Text>
      {locked ? null : <Icon icon={ChevronDown} size={12} tone={tone} strokeWidth={2.25} />}
    </PressableScale>
  );
}

function TaskRow({ task, labels, locked, onPressStatus }: { task: OnboardingTask; labels: TaskLabels; locked: boolean; onPressStatus: () => void }) {
  const closed = isClosedStatus(task.status);
  const status = labels.status(task.status);
  const parts = taskMetaParts(task, { owner: labels.owner(task.owner), kind: labels.kind(task.kind) });
  const spoken = [task.title, status.label, ...parts.map((p) => p.text)].join(', ');

  return (
    <View style={styles.row}>
      <View style={styles.text} accessible accessibilityLabel={spoken}>
        <Text variant="body" color={closed ? 'ink3' : 'ink'} style={closed ? styles.struck : null}>
          {task.title}
        </Text>
        <Text variant="small" color="ink3">
          {parts.map((p, i) => (
            <Text key={`${p.text}-${i}`} variant="small" color="ink3" tone={p.tone}>
              {i > 0 ? ' · ' : ''}
              {p.text}
            </Text>
          ))}
        </Text>
      </View>
      <StatusChip label={status.label} tone={status.tone} locked={locked} onPress={onPressStatus} />
    </View>
  );
}

/** Tasks grouped by stage, each group a card with its stage, internal day range and "done/total". */
export function TaskList({ tasks, labels, locked, onPressStatus }: TaskListProps) {
  const groups = groupTasks(tasks);
  if (groups.length === 0) {
    return (
      <Text variant="body" color="ink3" style={styles.none}>
        No tasks yet.
      </Text>
    );
  }
  return (
    <View style={styles.groups}>
      {groups.map((group) => {
        const range = labels.dayRange(group.stage);
        return (
          <View key={group.stage} style={styles.group}>
            <View style={styles.groupHead}>
              <View style={styles.groupTitle}>
                <Text variant="eyebrow" accessibilityRole="header">
                  {labels.stage(group.stage)}
                </Text>
                {range ? (
                  <Text variant="caption" color="ink4">
                    {range}
                  </Text>
                ) : null}
              </View>
              <Text
                variant="caption"
                color="ink4"
                tabular
                accessibilityLabel={`${group.closed} of ${group.tasks.length} closed`}
              >{`${group.closed}/${group.tasks.length}`}</Text>
            </View>
            <Card padded={false}>
              {group.tasks.map((task, i) => (
                <Fragment key={task.id}>
                  {i > 0 ? <Divider inset insetEnd /> : null}
                  <TaskRow task={task} labels={labels} locked={locked} onPressStatus={() => onPressStatus(task)} />
                </Fragment>
              ))}
            </Card>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: space[5] },
  group: { gap: space[2] },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  groupTitle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space[2], flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 64,
    paddingVertical: space[3],
    paddingHorizontal: layout.gutter,
  },
  text: { flex: 1, gap: 2 },
  struck: { textDecorationLine: 'line-through' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    minHeight: 28,
    maxWidth: 168,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
  },
  none: { paddingVertical: space[2] },
});
