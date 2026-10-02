import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { newIdempotencyKey } from '@/api/client';
import type { NewTaskInput } from '@/api/endpoints/clients';
import { fieldErrors } from '@/api/errors';
import type { OnboardingStage, TaskKind, TaskOwner } from '@/api/schemas/clients';
import { DateField } from '@/components/form/DateField';
import { Select, type SelectOption } from '@/components/form/Select';
import { SwitchRow } from '@/components/form/Switch';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { SegmentedControl, type SegmentItem } from '@/components/SegmentedControl';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { Sheet } from '@/components/sheet/Sheet';
import { space } from '@/design/tokens';
import { todayToronto } from '@/lib/dates';

import { dueDateToInstant } from './logic';

export type AddTaskSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Where a new task goes unless changed: the run's current stage. */
  defaultStage: OnboardingStage;
  stageOptions: readonly SelectOption<OnboardingStage>[];
  kindOptions: readonly SelectOption<TaskKind>[];
  ownerItems: readonly SegmentItem<TaskOwner>[];
  /** Sends the task. Rejects with the API error so the form can show it. */
  onSubmit: (input: NewTaskInput, idempotencyKey: string) => Promise<unknown>;
};

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

/**
 * "Add a task": title (required), description, stage, owner, kind, required
 * and a due date. Mount it with a new `key` for each open so it starts empty;
 * the idempotency key is made once per open and reused if the send is retried.
 */
export function AddTaskSheet({ open, onClose, defaultStage, stageOptions, kindOptions, ownerItems, onSubmit }: AddTaskSheetProps) {
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stage, setStage] = useState<OnboardingStage>(defaultStage);
  const [owner, setOwner] = useState<TaskOwner>('tekmadev');
  const [kind, setKind] = useState<TaskKind>('general');
  const [required, setRequired] = useState(true);
  const [due, setDue] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setErrors({ title: 'Enter a task title.' });
      return;
    }
    setErrors({});
    const input: NewTaskInput = {
      title: trimmed,
      description: description.trim() || null,
      stage,
      owner,
      kind,
      required,
      dueAt: due ? dueDateToInstant(due) : null,
    };
    await onSubmit(input, idempotencyKey);
    onClose();
  };

  return (
    <Sheet
      visible={open}
      onClose={onClose}
      title="Add a task"
      scrollable
      snapPoints={[0.92]}
      footer={
        <PendingButton
          label="Add task"
          pendingLabel="Adding"
          fullWidth
          onPress={submit}
          onError={(error) => {
            // Field problems show on the fields; anything else is a toast.
            const fields = fieldErrors(error);
            if (Object.keys(fields).length > 0) setErrors(fields);
            else reportSubmitError(error);
          }}
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label="Title"
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            if (errors.title) setErrors((e) => ({ ...e, title: '' }));
          }}
          maxLength={TITLE_MAX}
          showCount={false}
          autoCapitalize="sentences"
          error={errors.title || null}
        />
        <TextArea label="Description" value={description} onChangeText={setDescription} maxLength={DESCRIPTION_MAX} showCount={false} error={errors.description} />
        <Select<OnboardingStage> label="Stage" options={stageOptions} value={stage} onChange={setStage} error={errors.stage} />
        <View style={styles.owner}>
          <Text variant="label" color="ink2">
            Owner
          </Text>
          <SegmentedControl<TaskOwner> items={ownerItems} value={owner} onChange={setOwner} accessibilityLabel="Owner" />
          {owner === 'client' ? (
            <Text variant="small" color="ink3">
              A client-owned task notifies the client in their portal.
            </Text>
          ) : null}
          {errors.owner ? (
            <Text variant="small" color="signal">
              {errors.owner}
            </Text>
          ) : null}
        </View>
        <Select<TaskKind> label="Kind" options={kindOptions} value={kind} onChange={setKind} error={errors.kind} />
        <SwitchRow label="Required" description="Counts toward progress and holds the stage until it is done." value={required} onValueChange={setRequired} />
        <DateField label="Due date" value={due} onChange={setDue} min={todayToronto()} optional placeholder="No due date" error={errors.dueAt} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4], paddingBottom: space[2] },
  owner: { gap: space[2] },
});
