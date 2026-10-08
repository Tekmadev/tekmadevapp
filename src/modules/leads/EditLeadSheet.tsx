import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { leadKeys, updateLead } from '@/api/endpoints/leads';
import { ApiError, fieldErrors } from '@/api/errors';
import type { Lead, LeadsMeta } from '@/api/schemas/leads';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { applyLead, refreshAfterLeadWrite } from './cache';
import { LeadFormFields, useLeadForm } from './LeadFormFields';
import { leadTitle } from './logic';
import { editLeadErrors, editLeadPatch, LEAD_COPY, leadFormFrom } from './outreach';

export type EditLeadSheetProps = {
  lead: Lead;
  meta: LeadsMeta | undefined;
  onClose: () => void;
  /** "That email is already a lead": find that lead in the Leads list instead. */
  onFindExisting: (email: string) => void;
};

/**
 * "Edit lead" (PATCH /leads/:id with the details, `leads.update`; the
 * website's docs/admin-api/outreach.md section 4): the same fields, labels,
 * help and order as "Add a lead", filled in with what the lead shows. Offered
 * only when the server says `canEdit` (owners and managers on any lead, staff
 * on a lead they found or that is assigned to them). Sends only what changed,
 * so a business from a free tool's form or a booking's note stays as it is.
 * Waits for the server: field errors land under their fields (409 duplicate
 * under Email, with "Find it" like "Add a lead" and the website); a refusal
 * (403) or a lead that is gone (404) is said in a toast, the sheet closes and
 * the lead loads again. Mounted only while open: each opening starts from the
 * lead as it is now, and the edits are measured against that snapshot, not
 * the live lead (a refetch on focus can change it meanwhile), like the
 * website's `was_*` values: a detail left alone keeps what is stored.
 */
export function EditLeadSheet({ lead, meta, onClose, onFindExisting }: EditLeadSheetProps) {
  const queryClient = useQueryClient();
  // What the form showed when it opened: only what the person changed from it is sent.
  const [opened] = useState(lead);
  const [initial] = useState(() => leadFormFrom(opened));
  const { form, errors, setErrors, set } = useLeadForm(initial);
  const changed = Object.keys(editLeadPatch(opened, form)).length > 0;

  const submit = async () => {
    const local = editLeadErrors(opened, form);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      haptics.error();
      return;
    }
    const patch = editLeadPatch(opened, form);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    const updated = await updateLead(lead.id, patch);
    applyLead(queryClient, updated);
    // Home lists recent leads by name, and demo requests show the lead's business or name.
    refreshAfterLeadWrite(queryClient, { overview: true, demos: true });
    haptics.success();
    notice.ok('Lead updated.');
    onClose();
  };

  const onError = (error: unknown) => {
    haptics.error();
    const fields = fieldErrors(error);
    if (error instanceof ApiError && error.status === 409 && error.code === 'duplicate') {
      // The message says to find the other lead: offer exactly that, like "Add a lead".
      setErrors(fields);
      const email = form.email.trim();
      notice.err(error.message, { action: { label: 'Find it', onPress: () => onFindExisting(email) }, duration: 6000 });
      return;
    }
    if (Object.keys(fields).length > 0) {
      setErrors(fields);
      return;
    }
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      // Not theirs any more, or gone: say so, and load the lead again so the screen matches.
      // Every role holds leads.update, so a 403 `forbidden` here is the server's "not yours"
      // (the client shows its generic role copy for every `forbidden`).
      notice.err(error.status === 403 && error.code === 'forbidden' ? LEAD_COPY.editNotYours : error.message);
      void queryClient.invalidateQueries({ queryKey: leadKeys.detail(lead.id) });
      onClose();
      return;
    }
    reportSubmitError(error);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Edit lead"
      subtitle={leadTitle(lead)}
      scrollable
      snapPoints={[0.92]}
      footer={<PendingButton label="Save changes" pendingLabel="Saving" fullWidth disabled={!changed} onPress={submit} onError={onError} />}
    >
      <View style={styles.body}>
        <Text variant="small" color="ink3">
          A name or a business, and an email or a phone number.
        </Text>
        <LeadFormFields form={form} errors={errors} meta={meta} onChange={set} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
