import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { createCampaign, emailTemplatesQuery } from '@/api/endpoints/email';
import { fieldErrors } from '@/api/errors';
import { Chip } from '@/components/Chip';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { putCampaign, useIntentKey } from '../data';
import {
  applyTemplatePick,
  CAMPAIGN_KEY_MAX,
  campaignBody,
  campaignFormErrors,
  campaignKeyLive,
  EMAIL_COPY,
  EMPTY_CAMPAIGN_FORM,
  templateSuggestions,
  type CampaignForm,
} from '../logic';

type Field = keyof CampaignForm;

/** Server field names for our form fields (the note is `description`). */
const SERVER_FIELD: Record<string, Field> = { key: 'key', name: 'name', subject: 'subject', template: 'template', description: 'note' };

export type NewCampaignSheetProps = {
  onClose: () => void;
};

/**
 * "New campaign" (brief 8.11): Key (required, lowercased and dashed live),
 * Name (required), Subject, Template (suggestions from the templates list;
 * picking one also fills an empty key, name and subject), Note. One
 * Idempotency-Key per intent, so a retry never registers the key twice. The
 * new campaign goes straight into the list from the server's answer.
 */
export function NewCampaignSheet({ onClose }: NewCampaignSheetProps) {
  const queryClient = useQueryClient();
  const keyFor = useIntentKey();
  const templates = useQuery(emailTemplatesQuery());
  const [form, setForm] = useState<CampaignForm>(EMPTY_CAMPAIGN_FORM);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const set = (field: Field, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  };

  const suggestions = templateSuggestions(templates.data, form.template === '' || templates.data?.some((t) => t.key === form.template) ? '' : form.template);

  const submit = async () => {
    const local = campaignFormErrors(form);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      haptics.error();
      return;
    }
    const body = campaignBody(form);
    const created = await createCampaign(body, keyFor(body));
    putCampaign(queryClient, created);
    haptics.success();
    notice.ok('Campaign added.');
    onClose();
  };

  const onError = (error: unknown) => {
    haptics.error();
    const fields = fieldErrors(error);
    const mapped: Partial<Record<Field, string>> = {};
    for (const [name, message] of Object.entries(fields)) {
      const field = SERVER_FIELD[name];
      if (field) mapped[field] = message;
    }
    setErrors(mapped);
    if (Object.keys(mapped).length === 0) reportSubmitError(error);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="New campaign"
      subtitle="Registers a key so opens and clicks are counted. This app never sends email."
      scrollable
      footer={<PendingButton label="Add campaign" pendingLabel="Adding" fullWidth onPress={submit} onError={onError} />}
    >
      <View style={styles.body}>
        <TextField
          label="Key"
          value={form.key}
          onChangeText={(v) => set('key', campaignKeyLive(v))}
          error={errors.key}
          help={EMAIL_COPY.keyHelp}
          placeholder="newsletter-2026-07"
          monospace
          maxLength={CAMPAIGN_KEY_MAX}
          showCount={false}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          // Android: no suggestions bar fighting the live lowercasing. iOS: plain ASCII keyboard.
          keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
        />
        <TextField label="Name" value={form.name} onChangeText={(v) => set('name', v)} error={errors.name} autoCapitalize="sentences" />
        <TextField label="Subject" value={form.subject} onChangeText={(v) => set('subject', v)} error={errors.subject} autoCapitalize="sentences" />
        <View style={styles.template}>
          <TextField
            label="Template"
            value={form.template}
            onChangeText={(v) => set('template', v)}
            error={errors.template}
            help="Pick a ready-made email, or type your own name for it."
            autoCapitalize="none"
            autoCorrect={false}
            clearable
          />
          {suggestions.length > 0 ? (
            <View style={styles.suggestions} accessibilityRole="radiogroup" accessibilityLabel="Templates">
              {suggestions.map((t) => (
                <Chip
                  key={t.key}
                  label={t.name}
                  selected={form.template === t.key}
                  role="radio"
                  onPress={() => {
                    setForm((f) => applyTemplatePick(f, t));
                    setErrors({});
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
        <TextArea label="Note" value={form.note} onChangeText={(v) => set('note', v)} error={errors.note} minLines={2} maxLines={5} />
        <Text variant="small" color="ink3">
          Opens and clicks count from the moment you add the campaign.
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
  template: { gap: space[3] },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
