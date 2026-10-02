import { useState } from 'react';
import { StyleSheet } from 'react-native';

import type { NewActivityInput } from '@/api/endpoints/clients';
import type { Activity } from '@/api/schemas/clients';
import { Card } from '@/components/Card';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { withoutField } from '../formText';
import { showSaveError, useIntentKey } from '../sectionData';
import { activityInput, NOTE_HINT, TEXT_REQUIRED, UPDATE_HINT, type ComposerKind } from './activityText';

const KINDS = [
  { value: 'note' as const, label: 'Internal note' },
  { value: 'update' as const, label: 'Update to client' },
];

export type ActivityComposerProps = {
  /** Sends the entry with this Idempotency-Key; resolves with the saved entry. */
  onPost: (input: NewActivityInput, idempotencyKey: string) => Promise<Activity>;
};

/**
 * The composer under the timeline: an internal note (staff only) or an update
 * to the client (shown in their portal; no email is sent).
 */
export function ActivityComposer({ onPost }: ActivityComposerProps) {
  const { keyFor, done } = useIntentKey();
  const [kind, setKind] = useState<ComposerKind>('note');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = kind === 'update';

  const post = async () => {
    if (!text.trim()) {
      setErrors({ text: TEXT_REQUIRED });
      haptics.error();
      return;
    }
    const input = activityInput(kind, { subject, text, link });
    await onPost(input, keyFor(input));
    done();
    setSubject('');
    setText('');
    setLink('');
    setErrors({});
    haptics.success();
    notice.ok(update ? 'Update posted to the portal.' : 'Note added.');
  };

  const onError = (error: unknown) => showSaveError(error, setErrors);

  return (
    <Card style={styles.card}>
      <SegmentedControl
        items={KINDS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setErrors({});
        }}
        accessibilityLabel="What to write"
      />
      {update ? (
        <TextField
          label="Subject"
          value={subject}
          onChangeText={(v) => {
            setSubject(v);
            setErrors((e) => withoutField(e, 'subject'));
          }}
          error={errors.subject}
          maxLength={200}
          showCount={false}
        />
      ) : null}
      <TextArea
        label={update ? 'Update' : 'Note'}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setErrors((e) => withoutField(e, 'text'));
        }}
        error={errors.text}
        minLines={3}
        maxLength={5000}
        showCount={false}
      />
      {update ? (
        <TextField
          label="Link (optional)"
          value={link}
          onChangeText={(v) => {
            setLink(v);
            setErrors((e) => withoutField(e, 'actionUrl'));
          }}
          error={errors.actionUrl}
          placeholder="https://"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}
      <Text variant="small" color="ink3">
        {update ? UPDATE_HINT : NOTE_HINT}
      </Text>
      <PendingButton
        label={update ? 'Post update' : 'Add note'}
        pendingLabel={update ? 'Posting' : 'Adding'}
        fullWidth
        onPress={post}
        onError={onError}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
});
