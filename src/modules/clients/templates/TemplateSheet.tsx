import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TemplateInput } from '@/api/endpoints/clients';
import { fieldErrors } from '@/api/errors';
import {
  ONBOARDING_STAGES,
  zTaskKind,
  type ClientsMeta,
  type OnboardingStage,
  type OnboardingTemplate,
  type PlanId,
  type TaskKind,
  type TaskOwner,
} from '@/api/schemas/clients';
import { Button } from '@/components/Button';
import { NumberField } from '@/components/form/NumberField';
import { Select, type SelectOption } from '@/components/form/Select';
import { SwitchRow } from '@/components/form/Switch';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { SegmentedControl, type SegmentItem } from '@/components/SegmentedControl';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { slugifyLive } from '@/lib/text';

import { kindLabel, ownerLabel, planOptionLabel, plansOf, stageLabel } from '../list/labels';
import {
  keyError,
  keyFromTitle,
  PAYLOAD_ERROR,
  parsePayloadText,
  payloadToText,
  suggestedSortOrder,
  TEMPLATE_KEY_MAX,
} from './logic';

export type TemplateSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The template to edit, or null for "New template". */
  template: OnboardingTemplate | null;
  /** Every template, for the key check and the suggested sort order. */
  templates: readonly OnboardingTemplate[];
  meta: ClientsMeta | undefined;
  /** PUT the template. Rejects with the API error so the form can show it. */
  onSave: (key: string, input: TemplateInput) => Promise<unknown>;
  /** Opens the delete confirmation for this template (editing only). */
  onDelete: (template: OnboardingTemplate) => void;
};

type Field = 'key' | 'title' | 'stage' | 'owner' | 'kind' | 'plans' | 'dueOffsetDays' | 'sortOrder' | 'description' | 'payload';
type Errors = Partial<Record<Field, string>>;

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

/**
 * Edit or create a checklist template (brief 8.5). The key is read only once
 * the template exists; a new one suggests a key from the title until the key
 * is typed by hand. The payload is a JSON editor with live validation, sent as
 * the raw text for the server to parse. Mount with a new `key` per open so
 * every open starts from the template as saved.
 */
export function TemplateSheet({ open, onClose, template, templates, meta, onSave, onDelete }: TemplateSheetProps) {
  const isNew = template === null;
  const [title, setTitle] = useState(template?.title ?? '');
  const [keyText, setKeyText] = useState(template?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(!isNew);
  const [stage, setStage] = useState<OnboardingStage>(template?.stage ?? 'welcome');
  const [owner, setOwner] = useState<TaskOwner>(template?.owner ?? 'tekmadev');
  const [kind, setKind] = useState<TaskKind>(template?.kind ?? 'general');
  const [plans, setPlans] = useState<PlanId[]>(template ? [...template.plans] : []);
  const [dueOffsetDays, setDueOffsetDays] = useState<number | null>(template?.dueOffsetDays ?? null);
  const [sortOrder, setSortOrder] = useState<number | null>(template?.sortOrder ?? null);
  const [sortTouched, setSortTouched] = useState(!isNew);
  const [description, setDescription] = useState(template?.description ?? '');
  const [payloadText, setPayloadText] = useState(() => (template ? payloadToText(template.payload) : ''));
  const [required, setRequired] = useState(template?.required ?? true);
  const [active, setActive] = useState(template?.active ?? true);
  const [errors, setErrors] = useState<Errors>({});

  // Derived while untouched: the key follows the title, the order follows the stage.
  const key = keyTouched ? keyText : keyFromTitle(title);
  const shownSortOrder = sortTouched ? sortOrder : suggestedSortOrder(templates, stage);
  const payloadValid = parsePayloadText(payloadText).ok;

  const clear = (field: Field) => {
    if (!errors[field]) return;
    const next = { ...errors };
    delete next[field];
    setErrors(next);
  };

  const stageOptions: SelectOption<OnboardingStage>[] = ONBOARDING_STAGES.map((value) => ({
    value,
    label: stageLabel(meta, value),
    hint: meta?.onboardingStages.find((s) => s.value === value)?.dayRange ?? undefined,
  }));
  const kindOptions: SelectOption<TaskKind>[] = (meta?.taskKinds.map((k) => k.value) ?? zTaskKind.options).map((value) => ({
    value,
    label: kindLabel(meta, value),
  }));
  const ownerItems: SegmentItem<TaskOwner>[] = [
    { value: 'tekmadev', label: ownerLabel(meta, 'tekmadev') },
    { value: 'client', label: ownerLabel(meta, 'client') },
  ];
  const planOptions: SelectOption<PlanId>[] = plansOf(meta).map((p) => ({
    value: p.id,
    label: planOptionLabel(p),
    hint: p.kind === 'growth' ? 'Growth plan' : 'One-time product',
  }));

  const submit = async () => {
    const local: Errors = {};
    if (isNew) {
      const problem = keyError(key, templates.map((t) => t.key));
      if (problem) local.key = problem;
    }
    if (!title.trim()) local.title = 'Enter a title.';
    if (!payloadValid) local.payload = PAYLOAD_ERROR;
    if (Object.keys(local).length > 0) {
      setErrors(local);
      haptics.error();
      return;
    }
    setErrors({});

    const input: TemplateInput = {
      title: title.trim(),
      stage,
      owner,
      kind,
      plans,
      dueOffsetDays,
      ...(shownSortOrder === null ? {} : { sortOrder: shownSortOrder }),
      description: description.trim() || null,
      // The raw editor text: the server parses it (blank clears the payload).
      payload: payloadText.trim() === '' ? null : payloadText,
      required,
      active,
    };
    await onSave(key, input);
    haptics.success();
    notice.ok(isNew ? 'Template created.' : 'Template saved.');
    onClose();
  };

  const onError = (error: unknown) => {
    const fields = fieldErrors(error) as Errors;
    if (Object.keys(fields).length > 0) {
      setErrors(fields);
      haptics.error();
    } else {
      reportSubmitError(error);
    }
  };

  return (
    <Sheet
      visible={open}
      onClose={onClose}
      title={isNew ? 'New template' : 'Edit template'}
      subtitle="Changes apply to new onboarding runs only."
      scrollable
      snapPoints={[0.92]}
      footer={
        <PendingButton
          label={isNew ? 'Create template' : 'Save template'}
          pendingLabel={isNew ? 'Creating' : 'Saving'}
          fullWidth
          onPress={submit}
          onError={onError}
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label="Key"
          value={key}
          onChangeText={(text) => {
            setKeyTouched(true);
            setKeyText(slugifyLive(text));
            clear('key');
          }}
          disabled={!isNew}
          help={isNew ? 'Lowercase letters, numbers and dashes. It cannot be changed later.' : 'The key cannot be changed.'}
          error={errors.key}
          monospace
          maxLength={TEMPLATE_KEY_MAX}
          showCount={false}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Title"
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            clear('title');
            if (!keyTouched) clear('key');
          }}
          error={errors.title}
          maxLength={TITLE_MAX}
          showCount={false}
          autoCapitalize="sentences"
        />
        <Select<OnboardingStage>
          label="Stage"
          options={stageOptions}
          value={stage}
          onChange={(next) => {
            setStage(next);
            clear('stage');
          }}
          error={errors.stage}
        />
        <View style={styles.group}>
          <Text variant="label" color="ink2">
            Owner
          </Text>
          <SegmentedControl<TaskOwner>
            items={ownerItems}
            value={owner}
            onChange={(next) => {
              setOwner(next);
              clear('owner');
            }}
            accessibilityLabel="Owner"
          />
          {errors.owner ? (
            <Text variant="small" color="signal">
              {errors.owner}
            </Text>
          ) : null}
        </View>
        <Select<TaskKind>
          label="Kind"
          options={kindOptions}
          value={kind}
          onChange={(next) => {
            setKind(next);
            clear('kind');
          }}
          error={errors.kind}
        />
        <Select<PlanId>
          multiple
          label="Plans"
          options={planOptions}
          value={plans}
          onChange={(next) => {
            setPlans([...next]);
            clear('plans');
          }}
          placeholder="All plans"
          help="None means every plan."
          error={errors.plans}
        />
        <NumberField
          label="Due offset"
          suffix="days"
          value={dueOffsetDays}
          onChange={(next) => {
            // NumberField's onChange also carries TextInput's event type; only numbers are values.
            if (next !== null && typeof next !== 'number') return;
            setDueOffsetDays(next);
            clear('dueOffsetDays');
          }}
          min={0}
          max={365}
          help="Days after the onboarding starts. Empty means no due date."
          error={errors.dueOffsetDays}
        />
        <NumberField
          label="Sort order"
          value={shownSortOrder}
          onChange={(next) => {
            if (next !== null && typeof next !== 'number') return;
            setSortTouched(true);
            setSortOrder(next);
            clear('sortOrder');
          }}
          min={-10000}
          max={10000}
          allowNegative
          help="Lower numbers come first within the stage."
          error={errors.sortOrder}
        />
        <TextArea
          label="Description"
          value={description}
          onChangeText={(text) => {
            setDescription(text);
            clear('description');
          }}
          help="Shown to the client for client-owned tasks."
          error={errors.description}
          maxLength={DESCRIPTION_MAX}
          showCount={false}
        />
        <TextArea
          label="Payload"
          value={payloadText}
          onChangeText={(text) => {
            setPayloadText(text);
            clear('payload');
          }}
          help="JSON the portal reads for this task. Leave empty for none."
          error={payloadValid ? errors.payload : PAYLOAD_ERROR}
          monospace
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          minLines={4}
          maxLines={12}
        />
        <SwitchRow
          label="Required"
          description="Counts toward progress and holds the stage until it is done."
          value={required}
          onValueChange={setRequired}
        />
        <SwitchRow
          label="Active"
          description="Inactive templates are left out of new onboarding runs."
          value={active}
          onValueChange={setActive}
        />
        {template ? (
          <Button
            label="Delete template"
            variant="ghost"
            icon={Trash2}
            onPress={() => onDelete(template)}
            accessibilityHint="Asks you to confirm first"
            style={styles.delete}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4], paddingBottom: space[2] },
  group: { gap: space[2] },
  delete: { alignSelf: 'center', marginTop: space[2] },
});
