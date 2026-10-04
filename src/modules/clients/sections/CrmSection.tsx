import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { clientKeys, saveCrmLocation, type CrmLocationInput } from '@/api/endpoints/clients';
import type { CrmLocation } from '@/api/schemas/clients';
import { useCan } from '@/auth/permissions';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ErrorState } from '@/components/ErrorState';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { Icon } from '@/components/Icon';
import { PendingButton } from '@/components/PendingButton';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { formatDate } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { crmChanged, crmDraftFrom, crmInput, isRemoval, pendingLine, REMOVE_INPUT, type CrmDraft } from './crm/crmForm';
import { withoutField } from './formText';
import { refreshClient, showSaveError, updateBundle } from './sectionData';
import type { SectionProps } from './types';

/**
 * CRM account (brief 8.5, section 8), for people with `clients.crm`. The shell
 * never renders it for anyone else; it also renders nothing on its own when
 * the capability is missing, and the server answers 403 anyway.
 */
export function CrmSection({ clientId, bundle }: SectionProps) {
  const canCrm = useCan('clients.crm');
  if (!canCrm) return null;
  return <CrmAccount clientId={clientId} crm={bundle.crmLocation} />;
}

function CrmAccount({ clientId, crm }: { clientId: string; crm: CrmLocation | undefined }) {
  const queryClient = useQueryClient();
  if (!crm) {
    // Someone with clients.crm always gets the key; without it the bundle is not what we expect.
    return (
      <Section title="CRM account">
        <Card padded={false}>
          <ErrorState compact onRetry={() => queryClient.refetchQueries({ queryKey: clientKeys.detail(clientId) })} />
        </Card>
      </Section>
    );
  }
  return <CrmForm clientId={clientId} crm={crm} />;
}

function CrmForm({ clientId, crm }: { clientId: string; crm: CrmLocation }) {
  const queryClient = useQueryClient();
  // null: showing the server's mapping. Typing starts a draft; saving or discarding drops it.
  const [draft, setDraft] = useState<CrmDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);

  const form = draft ?? crmDraftFrom(crm);
  const input = crmInput(form);
  const changed = crmChanged(crm, input);

  const edit = (key: keyof CrmDraft, value: string) => {
    setDraft({ ...form, [key]: value });
    setErrors((e) => withoutField(e, key === 'calendars' ? 'calendarIds' : key));
  };

  const put = async (body: CrmLocationInput) => {
    const saved = await saveCrmLocation(clientId, body);
    updateBundle(queryClient, clientId, (b) => ({ ...b, crmLocation: saved }));
    refreshClient(queryClient, clientId);
    setDraft(null);
    setErrors({});
    haptics.success();
    notice.ok(saved.locationId ? 'CRM account saved.' : 'CRM mapping removed.');
  };

  const save = async () => {
    if (isRemoval(crm, input)) {
      setConfirmRemove(true);
      return;
    }
    await put(input);
  };

  // Errors from the API are shown as notices (brief), and the field they name is marked too.
  const onError = (error: unknown) => showSaveError(error, setErrors, true);

  const pending = crm.pendingToApply;

  return (
    <Section title="CRM account">
      <Card style={styles.card}>
        <TextField
          label="Sub-account id"
          value={form.locationId}
          onChangeText={(v) => edit('locationId', v)}
          error={errors.locationId}
          help={crm.mappedAt ? `Mapped ${formatDate(crm.mappedAt)}. Clear it to remove the mapping.` : 'From the CRM. Not mapped yet.'}
          monospace
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <TextArea
          label="Qualifying calendar ids"
          value={form.calendars}
          onChangeText={(v) => edit('calendars', v)}
          error={errors.calendarIds}
          help="One per line. Empty means every calendar counts."
          monospace
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          minLines={3}
        />
        <View style={styles.pending} accessible accessibilityLabel={pendingLine(pending)}>
          <Icon icon={CalendarClock} size={18} color={pending > 0 ? 'gold' : 'ink4'} />
          <Text variant="label" color={pending > 0 ? 'ink' : 'ink3'} tabular style={styles.pendingText}>
            {pendingLine(pending)}
          </Text>
        </View>
        <View style={styles.actions}>
          {draft && changed ? (
            <Button label="Discard" variant="ghost" onPress={() => { setDraft(null); setErrors({}); }} />
          ) : null}
          <PendingButton label="Save" pendingLabel="Saving" disabled={!changed} onPress={save} onError={onError} style={styles.save} />
        </View>
      </Card>

      <ConfirmSheet
        visible={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove the CRM mapping?"
        message="Appointments from this sub-account stop arriving for this client. Calls already here stay."
        confirmLabel="Hold to remove the mapping"
        pendingLabel="Removing"
        onConfirm={() => put(REMOVE_INPUT)}
        onError={onError}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  pending: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 24 },
  pendingText: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start', gap: space[2] },
  save: { minWidth: 120 },
});
