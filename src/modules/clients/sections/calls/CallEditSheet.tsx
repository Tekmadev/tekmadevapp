import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { updateCall } from '@/api/endpoints/clients';
import type { Call, CallStatus, DisqualifyReason } from '@/api/schemas/clients';
import { Field } from '@/components/form/Field';
import { Select } from '@/components/form/Select';
import { TextArea } from '@/components/form/TextArea';
import { KeyValue } from '@/components/KeyValue';
import { PendingButton } from '@/components/PendingButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Sheet } from '@/components/sheet/Sheet';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { formatDateTime } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { labelOf, optionsOf, type ClientLabels } from '../labels';
import { withoutField } from '../formText';
import { applyCallResult, refreshClient, showSaveError } from '../sectionData';
import { callPatch, QUALIFIED_ITEMS, REASON_REQUIRED, toQualified, type Qualified } from './callForm';
import { callTitle } from './callText';

export type CallEditSheetProps = {
  clientId: string;
  call: Call;
  labels: ClientLabels;
  onClose: () => void;
};

/**
 * Edit a call: status, qualified (yes / no), the disqualify reason when it
 * does not count, and notes. Mounted only while open, so it always starts
 * from the server's copy.
 */
export function CallEditSheet({ clientId, call, labels, onClose }: CallEditSheetProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CallStatus>(call.status);
  const [qualified, setQualified] = useState<Qualified>(toQualified(call.qualified));
  const [reason, setReason] = useState<DisqualifyReason | null>(call.disqualifiedReason);
  const [notes, setNotes] = useState(call.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const patch = callPatch(call, { status, qualified, reason, notes });
  const changed = Object.keys(patch).length > 0;

  const save = async () => {
    if (qualified === 'no' && !reason) {
      setErrors({ disqualifiedReason: REASON_REQUIRED });
      haptics.error();
      return;
    }
    const result = await updateCall(call.id, patch);
    applyCallResult(queryClient, clientId, result);
    refreshClient(queryClient, clientId, { lists: true, overview: true });
    haptics.success();
    notice.ok('Call saved.');
    onClose();
  };

  const onError = (error: unknown) => showSaveError(error, setErrors);

  const footer = (
    <PendingButton label="Save" pendingLabel="Saving" fullWidth disabled={!changed} onPress={save} onError={onError} />
  );

  return (
    <Sheet
      visible
      onClose={onClose}
      title={callTitle(call)}
      subtitle={`Booked ${formatDateTime(call.bookedAt)}`}
      scrollable
      footer={footer}
    >
      <View style={styles.body}>
        <KeyValue
          inset={0}
          items={[
            { label: 'Phone', value: call.phone, link: 'phone' },
            { label: 'Email', value: call.email, link: 'email' },
            { label: 'Service', value: call.serviceRequested },
            { label: 'Source', value: labelOf(labels.callSources, call.source) },
            call.bookedFor ? { label: 'Booked for', value: formatDateTime(call.bookedFor) } : null,
          ]}
        />
        <Select
          label="Status"
          options={optionsOf(labels.callStatuses)}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setErrors((e) => withoutField(e, 'status'));
          }}
          error={errors.status}
        />
        <Field label="Qualified" error={errors.qualified} inset="none">
          <SegmentedControl
            items={QUALIFIED_ITEMS}
            value={qualified}
            accessibilityLabel="Qualified"
            onChange={(next) => {
              setQualified(next);
              setErrors((e) => withoutField(withoutField(e, 'qualified'), 'disqualifiedReason'));
            }}
          />
        </Field>
        {qualified === 'no' ? (
          <Select
            label="Disqualify reason"
            placeholder="Pick a reason"
            options={optionsOf(labels.disqualifyReasons)}
            value={reason}
            onChange={(next) => {
              setReason(next);
              setErrors((e) => withoutField(e, 'disqualifiedReason'));
            }}
            error={errors.disqualifiedReason}
          />
        ) : null}
        <TextArea
          label="Notes"
          value={notes}
          onChangeText={(text) => {
            setNotes(text);
            setErrors((e) => withoutField(e, 'notes'));
          }}
          error={errors.notes}
          maxLength={4000}
          showCount={false}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
