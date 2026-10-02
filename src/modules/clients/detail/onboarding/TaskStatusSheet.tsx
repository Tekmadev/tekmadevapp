import { StyleSheet, View } from 'react-native';

import type { OnboardingTask, TaskStatus } from '@/api/schemas/clients';
import { OptionList, type SelectOption } from '@/components/form/Select';
import { Sheet } from '@/components/sheet/Sheet';
import { space } from '@/design/tokens';

export type TaskStatusSheetProps = {
  open: boolean;
  /** Kept after closing, so the sheet's text stays while it slides away. */
  task: OnboardingTask | null;
  options: readonly SelectOption<TaskStatus>[];
  onClose: () => void;
  onChoose: (task: OnboardingTask, status: TaskStatus) => void;
};

/** To do, In progress, Waiting on client, Done, Skipped, Blocked. One tap changes it and closes. */
export function TaskStatusSheet({ open, task, options, onClose, onChoose }: TaskStatusSheetProps) {
  return (
    <Sheet visible={open} onClose={onClose} title="Task status" subtitle={task?.title}>
      <View style={styles.body}>
        <OptionList<TaskStatus>
          options={options}
          value={task?.status ?? null}
          accessibilityLabel="Task status"
          onChange={(status) => {
            onClose();
            if (task && status !== task.status) onChoose(task, status);
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: space[2] },
});
