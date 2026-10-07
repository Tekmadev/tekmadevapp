import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { createLead } from '@/api/endpoints/leads';
import { ApiError, fieldErrors } from '@/api/errors';
import type { Lead, LeadNeed, LeadsMeta } from '@/api/schemas/leads';
import { useCan } from '@/auth/permissions';
import { Select } from '@/components/form/Select';
import { SwitchRow } from '@/components/form/Switch';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { useIntentKey } from '@/modules/clients/sections/sectionData';

import { applyLead, refreshAfterLeadWrite } from './cache';
import { needOptions, sourceLabel } from './logic';
import { addLeadErrors, addLeadInput, EMPTY_ADD_LEAD, LIMITS, type AddLeadForm } from './outreach';

/** A name or a business answers one rule, an email or a phone the other: typing in one clears the rule's error. */
const LINKED: Partial<Record<keyof AddLeadForm, string>> = { business: 'name', phone: 'email' };

export type AddLeadSheetProps = {
  meta: LeadsMeta | undefined;
  onClose: () => void;
  /** The lead the server created: the caller opens it, or the demo request for it when `wantsDemo`. */
  onAdded: (lead: Lead, options: { wantsDemo: boolean }) => void;
  /** "That email is already a lead": find that lead in the list instead. */
  onFindExisting: (email: string) => void;
};

/**
 * "Add a lead" (POST /leads, `leads.create`): someone found by hand. A name or
 * a business, and an email or a phone number, like the server; the need and a
 * note are optional. The source is always Outreach and the lead is assigned to
 * whoever adds it. Waits for the server and sends an Idempotency-Key, so a
 * retry never adds the lead twice. Mounted only while open: each opening is a
 * fresh form and a fresh intent.
 *
 * "They want a demo" (off by default, for people with `demos.request`): after
 * the lead is added, "Request a demo" opens for it instead of the lead, like
 * "Client wants a demo" on New client. Not part of the intent: the same lead
 * sent again keeps its key whether the switch is on or off.
 */
export function AddLeadSheet({ meta, onClose, onAdded, onFindExisting }: AddLeadSheetProps) {
  const queryClient = useQueryClient();
  const { keyFor } = useIntentKey();
  const [form, setForm] = useState<AddLeadForm>(EMPTY_ADD_LEAD);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canRequestDemo = useCan('demos.request');
  const [wantsDemo, setWantsDemo] = useState(false);

  const set = <K extends keyof AddLeadForm>(key: K, value: AddLeadForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((current) => {
      const drop = [key, LINKED[key]].filter((f): f is string => !!f && f in current);
      if (drop.length === 0) return current;
      const next = { ...current };
      for (const f of drop) delete next[f];
      return next;
    });
  };

  const submit = async () => {
    const local = addLeadErrors(form);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      haptics.error();
      return;
    }
    const input = addLeadInput(form);
    const lead = await createLead(input, keyFor(input));
    applyLead(queryClient, lead);
    refreshAfterLeadWrite(queryClient, { overview: true });
    haptics.success();
    notice.ok('Lead added.');
    onAdded(lead, { wantsDemo: wantsDemo && canRequestDemo });
  };

  const onError = (error: unknown) => {
    const fields = fieldErrors(error);
    setErrors(fields);
    haptics.error();
    if (error instanceof ApiError && error.code === 'duplicate') {
      // The message says to find the existing lead: offer exactly that.
      const email = form.email.trim();
      notice.err(error.message, { action: { label: 'Find it', onPress: () => onFindExisting(email) }, duration: 6000 });
      return;
    }
    if (Object.keys(fields).length === 0) reportSubmitError(error);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add a lead"
      subtitle="Someone you found or met"
      scrollable
      snapPoints={[0.92]}
      footer={<PendingButton label="Add lead" pendingLabel="Adding" fullWidth onPress={submit} onError={onError} />}
    >
      <View style={styles.body}>
        <Text variant="small" color="ink3">
          {`Source: ${sourceLabel(meta, 'outreach')}. Assigned to you. A name or a business, and an email or a phone number.`}
        </Text>
        <TextField
          label="Name"
          value={form.name}
          onChangeText={(v) => set('name', v)}
          error={errors.name}
          maxLength={LIMITS.name}
          showCount={false}
          autoCapitalize="words"
          autoComplete="off"
          textContentType="none"
          returnKeyType="next"
        />
        <TextField
          label="Business"
          value={form.business}
          onChangeText={(v) => set('business', v)}
          error={errors.business}
          maxLength={LIMITS.business}
          showCount={false}
          autoCapitalize="words"
          autoComplete="off"
          returnKeyType="next"
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
          textContentType="none"
        />
        <TextField
          label="Phone"
          value={form.phone}
          onChangeText={(v) => set('phone', v)}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="off"
          textContentType="none"
        />
        <TextField
          label="Website or profile"
          value={form.website}
          onChangeText={(v) => set('website', v)}
          error={errors.website}
          help="Their site, or a handle like instagram.com/name."
          maxLength={LIMITS.website}
          showCount={false}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <Select<LeadNeed>
          label="Need"
          options={needOptions(meta)}
          value={form.need}
          onChange={(v) => set('need', v)}
          onClear={() => set('need', null)}
          placeholder="Not sure yet"
          error={errors.need}
          sheetTitle="What they need"
        />
        <TextArea
          label="Note"
          value={form.message}
          onChangeText={(v) => set('message', v)}
          error={errors.message}
          help="What you know about them: where you found them, what they asked."
          maxLength={LIMITS.message}
          showCount={false}
        />
        {canRequestDemo ? (
          <SwitchRow
            label="They want a demo"
            description="After the lead is added, the demo request opens so you can add what they want to see."
            value={wantsDemo}
            onValueChange={setWantsDemo}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
