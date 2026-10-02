import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { updateClient } from '@/api/endpoints/clients';
import { EDITABLE_CLIENT_STATUSES, type Client, type ClientStatus, type GuaranteeCountRule, type PlanId } from '@/api/schemas/clients';
import { DateField } from '@/components/form/DateField';
import { Field } from '@/components/form/Field';
import { FormSection } from '@/components/form/FormSection';
import { NumberField } from '@/components/form/NumberField';
import { Select, type SelectOption } from '@/components/form/Select';
import { SwitchRow } from '@/components/form/Switch';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Sheet } from '@/components/sheet/Sheet';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { labelOf, optionsOf, type ClientLabels } from '../labels';
import { withoutField } from '../formText';
import { refreshClient, showSaveError, updateBundle } from '../sectionData';
import { accountErrors, accountFormFrom, accountPatch, TARGET_RANGE, WINDOW_RANGE, type AccountForm } from './accountForm';

export type AccountEditSheetProps = {
  clientId: string;
  client: Client;
  labels: ClientLabels;
  onClose: () => void;
};

/**
 * The Account edit sheet: every account field and the guarantee terms. Saves
 * a PATCH with only what changed. Mounted only while open, so each opening
 * starts from the server's copy.
 */
export function AccountEditSheet({ clientId, client, labels, onClose }: AccountEditSheetProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AccountForm>(() => accountFormFrom(client));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => withoutField(e, key));
  };

  const patch = accountPatch(client, form);
  const changed = Object.keys(patch).length > 0;

  const save = async () => {
    const local = accountErrors(form);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      haptics.error();
      notice.err('Check the highlighted fields.');
      return;
    }
    const saved = await updateClient(clientId, patch);
    updateBundle(queryClient, clientId, (b) => ({ ...b, client: saved }));
    // Status, plan and guarantee terms change the list rows and Home's counts.
    refreshClient(queryClient, clientId, { lists: true, overview: true });
    haptics.success();
    notice.ok('Saved.');
    onClose();
  };

  const onError = (error: unknown) => showSaveError(error, setErrors, true);

  // A lead becomes a client through checkout, so "Lead" only shows (locked) while it is the current status.
  const statusOptions: SelectOption<ClientStatus>[] = [
    ...(client.status === 'lead' ? [{ value: 'lead' as const, label: labelOf(labels.clientStatuses, 'lead'), disabled: true, hint: 'Becomes a client at checkout' }] : []),
    ...EDITABLE_CLIENT_STATUSES.map((value) => ({ value, label: labelOf(labels.clientStatuses, value) })),
  ];
  const planOptions: SelectOption<PlanId>[] = labels.planOptions.map((p) => ({
    value: p.id,
    label: p.name,
    hint: p.kind === 'growth' ? (p.guarantee ? 'Growth plan, with the guarantee' : 'Growth plan') : 'One-time product',
  }));
  const countRules = optionsOf(labels.guaranteeCountRules);

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Edit account"
      subtitle={client.businessName}
      scrollable
      snapPoints={[0.92]}
      footer={<PendingButton label="Save changes" pendingLabel="Saving" fullWidth disabled={!changed} onPress={save} onError={onError} />}
    >
      <View style={styles.body}>
        <FormSection title="Business">
          <TextField
            label="Business name"
            value={form.businessName}
            onChangeText={(v) => set('businessName', v)}
            error={errors.businessName}
            help="Required."
            autoCapitalize="words"
          />
          <TextField label="Contact name" value={form.contactName} onChangeText={(v) => set('contactName', v)} error={errors.contactName} autoCapitalize="words" />
          <TextField label="Legal name" value={form.legalName} onChangeText={(v) => set('legalName', v)} error={errors.legalName} />
          <TextField
            label="Website"
            value={form.website}
            onChangeText={(v) => set('website', v)}
            error={errors.website}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Primary email"
            value={form.primaryEmail}
            onChangeText={(v) => set('primaryEmail', v)}
            error={errors.primaryEmail}
            help="Required."
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField label="Phone" value={form.phone} onChangeText={(v) => set('phone', v)} error={errors.phone} keyboardType="phone-pad" />
          <TextField label="Industry" value={form.industry} onChangeText={(v) => set('industry', v)} error={errors.industry} />
        </FormSection>

        <FormSection title="Account">
          <Select label="Status" options={statusOptions} value={form.status} onChange={(v) => set('status', v)} error={errors.status} />
          <Select
            label="Plan"
            placeholder="No plan yet"
            options={planOptions}
            value={form.planId}
            onChange={(v) => set('planId', v)}
            onClear={() => set('planId', null)}
            error={errors.planId}
            help="Changing the plan resets guarantee eligibility to match it, unless you change eligibility too."
          />
          <TextField
            label="Time zone"
            value={form.timezone}
            onChangeText={(v) => set('timezone', v)}
            error={errors.timezone}
            help="The client's own zone, like America/Vancouver. Times here stay in Toronto time."
            monospace
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Assigned strategist"
            value={form.assignedStrategist}
            onChangeText={(v) => set('assignedStrategist', v)}
            error={errors.assignedStrategist}
            help="Their email."
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <DateField label="Live date" value={form.liveDate} onChange={(v) => set('liveDate', v)} optional placeholder="Not live yet" error={errors.liveDate} rangeError={null} />
          <TextArea label="Service area" value={form.serviceArea} onChangeText={(v) => set('serviceArea', v)} error={errors.serviceArea} minLines={2} />
        </FormSection>

        <FormSection title="Guarantee">
          <SwitchRow
            label="Eligible"
            description="Counts qualified booked calls toward the guarantee."
            value={form.guaranteeEligible}
            onValueChange={(v) => set('guaranteeEligible', v)}
          />
          <NumberField
            label="Target"
            value={form.guaranteeTarget}
            onChange={(v) => set('guaranteeTarget', v)}
            min={TARGET_RANGE.min}
            max={TARGET_RANGE.max}
            required
            suffix="calls"
            error={errors.guaranteeTarget}
          />
          <NumberField
            label="Window"
            value={form.guaranteeWindowDays}
            onChange={(v) => set('guaranteeWindowDays', v)}
            min={WINDOW_RANGE.min}
            max={WINDOW_RANGE.max}
            required
            suffix="days"
            error={errors.guaranteeWindowDays}
          />
          <Field label="Count rule" error={errors.guaranteeCountRule} inset="none">
            <SegmentedControl<GuaranteeCountRule>
              items={countRules}
              value={form.guaranteeCountRule}
              onChange={(v) => set('guaranteeCountRule', v)}
              accessibilityLabel="Count rule"
            />
          </Field>
          <Select
            label="Guarantee status"
            options={optionsOf(labels.guaranteeStatuses)}
            value={form.guaranteeStatus}
            onChange={(v) => set('guaranteeStatus', v)}
            error={errors.guaranteeStatus}
          />
          <DateField
            label="Clock started"
            value={form.guaranteeClockStartedOn}
            onChange={(v) => set('guaranteeClockStartedOn', v)}
            optional
            placeholder="Not started"
            error={errors.guaranteeClockStartedOn}
            rangeError={null}
          />
        </FormSection>

        <FormSection title="Internal notes">
          <TextArea
            label="Internal notes"
            value={form.internalNotes}
            onChangeText={(v) => set('internalNotes', v)}
            error={errors.internalNotes}
            help="Never shown to the client."
            minLines={3}
            maxLength={5000}
            showCount={false}
          />
        </FormSection>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[7], paddingBottom: space[2] },
});
