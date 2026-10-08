import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { createLead } from '@/api/endpoints/leads';
import { ApiError, fieldErrors } from '@/api/errors';
import type { Lead, LeadsMeta } from '@/api/schemas/leads';
import { useCan } from '@/auth/permissions';
import { SwitchRow } from '@/components/form/Switch';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { useIntentKey } from '@/modules/clients/sections/sectionData';

import { applyLead, refreshAfterLeadWrite } from './cache';
import { LeadFormFields, useLeadForm } from './LeadFormFields';
import { sourceLabel } from './logic';
import { addLeadErrors, addLeadInput, EMPTY_ADD_LEAD } from './outreach';

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
 * "They want a demo" (off by default, for people with `demos.request`, shown
 * under Need once the need is a website): after the lead is added, "Request a
 * demo" opens for it instead of the lead, like "Client wants a demo" on New
 * client. Not part of the intent: the same lead
 * sent again keeps its key whether the switch is on or off.
 */
export function AddLeadSheet({ meta, onClose, onAdded, onFindExisting }: AddLeadSheetProps) {
  const queryClient = useQueryClient();
  const { keyFor } = useIntentKey();
  const { form, errors, setErrors, set } = useLeadForm(EMPTY_ADD_LEAD);
  const canRequestDemo = useCan('demos.request');
  const [wantsDemo, setWantsDemo] = useState(false);
  // "They want a demo" appears under Need once the need is a website (Webline).
  const offerDemo = canRequestDemo && form.need === 'website';

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
    onAdded(lead, { wantsDemo: wantsDemo && offerDemo });
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
        <LeadFormFields
          form={form}
          errors={errors}
          meta={meta}
          onChange={set}
          afterNeed={
            offerDemo ? (
              <SwitchRow
                label="They want a demo"
                description="After the lead is added, the demo request opens so you can add what they want to see."
                value={wantsDemo}
                onValueChange={setWantsDemo}
              />
            ) : null
          }
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
