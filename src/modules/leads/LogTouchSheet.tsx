import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { logTouch } from '@/api/endpoints/leads';
import { fieldErrors } from '@/api/errors';
import type { Lead, LeadsMeta, TouchKind } from '@/api/schemas/leads';
import { FilterChips } from '@/components/FilterChips';
import { DateTimeField } from '@/components/form/DateTimeField';
import { Field } from '@/components/form/Field';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { useIntentKey } from '@/modules/clients/sections/sectionData';

import { applyTouchResult, refreshAfterLeadWrite } from './cache';
import { leadTitle } from './logic';
import { emptyLogTouch, LIMITS, loggedMessage, logTouchErrors, logTouchInput, touchKindOptions, type LogTouchForm } from './outreach';
import { TOUCH_KIND_ICONS } from './TouchTimeline';

const YEAR_MS = 365 * 86_400_000;

export type LogTouchSheetProps = {
  lead: Lead;
  meta: LeadsMeta | undefined;
  /** The kind it opens on (Call, or what a one-tap contact just did). */
  kind: TouchKind;
  /** A pre-filled note ("By text message." after Text). */
  note?: string;
  onClose: () => void;
};

/**
 * "Log outreach" (POST /leads/:id/touches, `leads.outreach`): what kind of
 * contact, the outcome in a few words, a note, when it happened (empty: now)
 * and the next follow-up, which starts at the lead's own and is sent only when
 * changed. The server decides what the touch does to the status and answers
 * the updated lead. Idempotency-Key per intent, so a retry never logs twice.
 * Mounted only while open.
 */
export function LogTouchSheet({ lead, meta, kind, note, onClose }: LogTouchSheetProps) {
  const queryClient = useQueryClient();
  const { keyFor } = useIntentKey();
  const [form, setForm] = useState<LogTouchForm>(() => emptyLogTouch(kind, lead.followUpAt, note));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A touch is never in the future, and at most a year back: read the clock once, when the sheet opens.
  const [bounds] = useState(() => {
    const now = Date.now();
    return { max: new Date(now).toISOString(), min: new Date(now - YEAR_MS).toISOString() };
  });

  const set = <K extends keyof LogTouchForm>(key: K, value: LogTouchForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = async () => {
    const local = logTouchErrors(form);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      haptics.error();
      return;
    }
    const input = logTouchInput(form, lead.followUpAt);
    const result = await logTouch(lead.id, input, keyFor(input));
    applyTouchResult(queryClient, result);
    refreshAfterLeadWrite(queryClient, { touches: lead.id, overview: result.lead.status !== lead.status });
    haptics.success();
    notice.ok(loggedMessage(result.touch.kind, meta));
    onClose();
  };

  const onError = (error: unknown) => {
    const fields = fieldErrors(error);
    setErrors(fields);
    haptics.error();
    if (Object.keys(fields).length === 0) reportSubmitError(error);
  };

  const kinds = touchKindOptions(meta).map((o) => ({ value: o.value, label: o.label, icon: TOUCH_KIND_ICONS[o.value] }));

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Log outreach"
      subtitle={leadTitle(lead)}
      scrollable
      snapPoints={[0.92]}
      footer={<PendingButton label="Log it" pendingLabel="Logging" fullWidth onPress={submit} onError={onError} />}
    >
      <View style={styles.body}>
        <Field label="Kind" error={errors.kind} inset="none">
          <FilterChips<TouchKind>
            items={kinds}
            value={form.kind}
            onChange={(v) => {
              if (v) set('kind', v);
            }}
            bleed={false}
            inset={0}
            accessibilityLabel="Kind of outreach"
          />
        </Field>
        <TextField
          label="Outcome"
          value={form.outcome}
          onChangeText={(v) => set('outcome', v)}
          error={errors.outcome}
          help="In a few words: Left a voicemail, Wants a quote."
          maxLength={LIMITS.outcome}
          showCount={false}
          autoCapitalize="sentences"
        />
        <TextArea
          label="Note"
          value={form.note}
          onChangeText={(v) => set('note', v)}
          error={errors.note}
          maxLength={LIMITS.note}
          showCount={false}
        />
        <DateTimeField
          label="When"
          value={form.at}
          onChange={(v) => set('at', v)}
          min={bounds.min}
          max={bounds.max}
          optional
          placeholder="Now"
          help="Leave it empty for now."
          error={errors.at}
          sheetTitle="When it happened"
        />
        <DateTimeField
          label="Next follow-up"
          value={form.followUpAt}
          onChange={(v) => set('followUpAt', v)}
          optional
          placeholder="None planned"
          help="When to reach out next."
          error={errors.followUpAt}
          rangeError={null}
          sheetTitle="Next follow-up"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
