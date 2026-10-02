import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { logCall } from '@/api/endpoints/clients';
import { DateTimeField } from '@/components/form/DateTimeField';
import { Select } from '@/components/form/Select';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { optionsOf, type ClientLabels } from '../labels';
import { withoutField } from '../formText';
import { applyCallResult, refreshClient, showSaveError, useIntentKey } from '../sectionData';
import { EMPTY_LOG_CALL, logCallErrors, logCallInput, type LogCallForm } from './callForm';

export type LogCallSheetProps = {
  clientId: string;
  businessName: string;
  labels: ClientLabels;
  onClose: () => void;
};

/**
 * "Log a booked call". Calls logged by hand count right away (the CRM's own
 * appointments arrive through the sync and wait for review instead). Mounted
 * only while open: each opening is a fresh form and a fresh intent.
 */
export function LogCallSheet({ clientId, businessName, labels, onClose }: LogCallSheetProps) {
  const queryClient = useQueryClient();
  const { keyFor } = useIntentKey();
  const [form, setForm] = useState<LogCallForm>(EMPTY_LOG_CALL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A booking cannot be in the future; read the clock once, when the sheet opens.
  const [now] = useState(() => new Date().toISOString());

  const set = <K extends keyof LogCallForm>(key: K, value: LogCallForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = withoutField(e, key);
      // Any one of name, phone or email answers "who was it".
      return key === 'phone' || key === 'email' ? withoutField(next, 'contactName') : next;
    });
  };

  const submit = async () => {
    const local = logCallErrors(form);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      haptics.error();
      return;
    }
    const input = logCallInput(form);
    const result = await logCall(clientId, input, keyFor(input));
    applyCallResult(queryClient, clientId, result);
    refreshClient(queryClient, clientId, { lists: true, overview: true });
    haptics.success();
    notice.ok('Call logged.');
    onClose();
  };

  const onError = (error: unknown) => showSaveError(error, setErrors);

  const sources = optionsOf(labels.callSources).filter((o) => o.value !== 'crm');

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Log a booked call"
      subtitle={businessName}
      scrollable
      snapPoints={[0.92]}
      footer={<PendingButton label="Log call" pendingLabel="Logging" fullWidth onPress={submit} onError={onError} />}
    >
      <View style={styles.body}>
        <Text variant="small" color="ink3">
          Calls you log here count right away.
        </Text>
        <TextField
          label="Contact name"
          value={form.contactName}
          onChangeText={(v) => set('contactName', v)}
          error={errors.contactName}
          autoCapitalize="words"
          autoComplete="off"
          returnKeyType="next"
        />
        <TextField
          label="Phone"
          value={form.phone}
          onChangeText={(v) => set('phone', v)}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="off"
        />
        <TextField
          label="Email"
          value={form.email}
          onChangeText={(v) => set('email', v)}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <TextField
          label="Service requested"
          value={form.serviceRequested}
          onChangeText={(v) => set('serviceRequested', v)}
          error={errors.serviceRequested}
        />
        <DateTimeField
          label="Booked at"
          value={form.bookedAt}
          onChange={(v) => set('bookedAt', v)}
          max={now}
          optional
          placeholder="Now"
          help="When the appointment was booked. Leave it empty for now."
          error={errors.bookedAt}
        />
        <DateTimeField
          label="Booked for"
          value={form.bookedFor}
          onChange={(v) => set('bookedFor', v)}
          optional
          placeholder="Not set"
          help="When the appointment is."
          error={errors.bookedFor}
        />
        <Select label="Status" options={optionsOf(labels.callStatuses)} value={form.status} onChange={(v) => set('status', v)} error={errors.status} />
        <Select label="Source" options={sources} value={form.source} onChange={(v) => set('source', v)} error={errors.source} />
        <TextArea label="Notes" value={form.notes} onChangeText={(v) => set('notes', v)} error={errors.notes} maxLength={4000} showCount={false} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
