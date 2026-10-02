import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addMember, type NewMemberInput } from '@/api/endpoints/clients';
import type { MemberRole } from '@/api/schemas/clients';
import { Select } from '@/components/form/Select';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { isValidEmail } from '@/lib/text';

import { optionsOf, type ClientLabels } from '../labels';
import { textOrNull, withoutField } from '../formText';
import { refreshClient, showSaveError, updateBundle, upsertById, useIntentKey } from '../sectionData';
import { addedMessage } from './teamText';

/** The brief's message for the `email` code. */
const EMAIL_INVALID = 'Enter a valid email.';

export type AddMemberSheetProps = {
  clientId: string;
  businessName: string;
  labels: ClientLabels;
  onClose: () => void;
};

/** "Add a person": email, name, title, role (default member). The portal invite goes out on save. */
export function AddMemberSheet({ clientId, businessName, labels, onClose }: AddMemberSheetProps) {
  const queryClient = useQueryClient();
  const { keyFor } = useIntentKey();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<MemberRole>('member');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clear = (field: string) => setErrors((e) => withoutField(e, field));

  const submit = async () => {
    if (!isValidEmail(email)) {
      setErrors({ email: EMAIL_INVALID });
      haptics.error();
      return;
    }
    const input: NewMemberInput = { email: email.trim(), name: textOrNull(name), title: textOrNull(title), role };
    const result = await addMember(clientId, input, keyFor(input));
    updateBundle(queryClient, clientId, (b) => ({ ...b, members: upsertById(b.members, result.member) }));
    refreshClient(queryClient, clientId);
    const message = addedMessage(result.invite);
    if (message.tone === 'ok') {
      haptics.success();
      notice.ok(message.text);
    } else {
      haptics.error();
      notice.err(message.text);
    }
    onClose();
  };

  const onError = (error: unknown) => showSaveError(error, setErrors);

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add a person"
      subtitle={businessName}
      scrollable
      footer={<PendingButton label="Add and invite" pendingLabel="Adding" fullWidth onPress={submit} onError={onError} />}
    >
      <View style={styles.body}>
        <TextField
          label="Email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            clear('email');
          }}
          error={errors.email}
          help="Their portal login. The invite goes here."
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <TextField
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            clear('name');
          }}
          error={errors.name}
          autoCapitalize="words"
          autoComplete="off"
        />
        <TextField
          label="Title"
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            clear('title');
          }}
          error={errors.title}
          help="Their job, like Office manager."
        />
        <Select
          label="Role"
          options={optionsOf(labels.memberRoles)}
          value={role}
          onChange={(v) => {
            setRole(v);
            clear('role');
          }}
          error={errors.role}
        />
        <Text variant="small" color="ink3">
          They get an email to set a password for the client portal.
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
});
