import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { getRandomBytes } from 'expo-crypto';
import { Copy, RefreshCw, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { addTeamMember, teamKeys } from '@/api/endpoints/team';
import { fieldErrors } from '@/api/errors';
import type { Team, TeamMember } from '@/api/schemas/team';
import type { Role } from '@/api/types';
import { roleCopy } from '@/auth/permissions';
import { Button } from '@/components/Button';
import { OptionList, type SelectOption } from '@/components/form/Select';
import { FieldIconButton } from '@/components/form/InputChrome';
import { TextField } from '@/components/form/TextField';
import { KeyValue } from '@/components/KeyValue';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { useIntentKey } from '@/modules/clients/sections/sectionData';

import {
  generateTempPassword,
  insertMember,
  NAME_MAX,
  newMemberInput,
  shareCredentialsText,
  TEAM_COPY,
  validateNewMember,
  type RoleOption,
} from './logic';

export type AddTeamMemberSheetProps = {
  /** The roles this person may give (addableRoles): Owner only with `team.owners`. The first is the default. */
  roles: readonly RoleOption[];
  onClose: () => void;
};

type Added = { member: TeamMember; password: string };

const newPassword = () => generateTempPassword(getRandomBytes);

async function copy(value: string) {
  try {
    await Clipboard.setStringAsync(value);
    notice.ok('Copied.');
  } catch {
    notice.err('Could not copy that.');
  }
}

/**
 * "Add a team member" (brief 8.16, `team.write`): name, email, a temporary
 * password (filled in with a generated one, "Generate" draws another, copy
 * button) and the role with its help line: Staff (the default, the least
 * access), Manager, and Owner only for someone with `team.owners`. Creating
 * the sign-in account waits for the server and sends an Idempotency-Key, so a
 * retry never adds the person twice. After it lands the sheet shows the
 * sign-in details with "Share sign-in details".
 */
export function AddTeamMemberSheet({ roles, onClose }: AddTeamMemberSheetProps) {
  const queryClient = useQueryClient();
  const { keyFor } = useIntentKey();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(newPassword);
  const [role, setRole] = useState<Role>(() => roles[0]?.value ?? 'staff');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Added | null>(null);

  const clear = (field: string) =>
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });

  const submit = async () => {
    const draft = { name, email, password, role };
    const found = validateNewMember(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      haptics.error();
      return;
    }
    const input = newMemberInput(draft);
    const member = await addTeamMember(input, keyFor(input));
    queryClient.setQueryData<Team>(teamKeys.list(), (old) => (old ? insertMember(old, member) : old));
    void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    haptics.success();
    notice.ok(TEAM_COPY.added);
    setAdded({ member, password: input.tempPassword });
  };

  const onError = (error: unknown) => {
    const fields = fieldErrors(error);
    setErrors(fields);
    haptics.error();
    if (Object.keys(fields).length === 0) reportSubmitError(error);
  };

  if (added) {
    return (
      <Sheet
        visible
        onClose={onClose}
        title={TEAM_COPY.addedTitle}
        subtitle={added.member.name ?? added.member.email}
        scrollable
        footer={<AddedFooter added={added} onClose={onClose} />}
      >
        <AddedBody added={added} />
      </Sheet>
    );
  }

  const roleOptions: SelectOption<Role>[] = roles.map((r) => ({ value: r.value, label: r.label, hint: r.help }));

  return (
    <Sheet
      visible
      onClose={onClose}
      title={TEAM_COPY.add}
      scrollable
      footer={
        <PendingButton label={TEAM_COPY.addButton} pendingLabel={TEAM_COPY.adding} fullWidth onPress={submit} onError={onError} />
      }
    >
      <View style={styles.body}>
        <TextField
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            clear('name');
          }}
          error={errors.name}
          maxLength={NAME_MAX}
          showCount={false}
          autoCapitalize="words"
          autoComplete="off"
          textContentType="none"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            clear('email');
          }}
          error={errors.email}
          help="Their login for the admin."
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
        />
        <View style={styles.password}>
          <TextField
            label="Temporary password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              clear('tempPassword');
            }}
            error={errors.tempPassword}
            help={TEAM_COPY.passwordHelp}
            monospace
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            spellCheck={false}
            trailing={
              <FieldIconButton
                icon={Copy}
                onPress={() => void copy(password)}
                disabled={password === ''}
                accessibilityLabel="Copy the temporary password"
              />
            }
          />
          <Button
            label="Generate"
            icon={RefreshCw}
            size="sm"
            variant="secondary"
            accessibilityHint="Fills in a new random password"
            onPress={() => {
              setPassword(newPassword());
              clear('tempPassword');
            }}
            style={styles.generate}
          />
        </View>
        <View style={styles.role}>
          <Text variant="label" color="ink2">
            Role
          </Text>
          <OptionList
            options={roleOptions}
            value={role}
            onChange={(v) => {
              setRole(v);
              clear('role');
            }}
            accessibilityLabel="Role"
          />
          {errors.role ? (
            <Text variant="small" tone="signal">
              {errors.role}
            </Text>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

/** After the server added them: the sign-in details to pass on. */
function AddedBody({ added }: { added: Added }) {
  const { member, password } = added;
  return (
    <View style={styles.body}>
      <Text variant="body" color="ink2">
        Share the temporary password so they can sign in and change it.
      </Text>
      <KeyValue
        inset={0}
        items={[
          { label: 'Email', value: member.email, copyable: true },
          { label: 'Temporary password', value: password, copyable: true, mono: true },
          { label: 'Role', value: roleCopy(member.role).label },
        ]}
      />
    </View>
  );
}

/** "Share sign-in details" opens the system share sheet (React Native Share: Android and iOS), then "Done". */
function AddedFooter({ added, onClose }: { added: Added; onClose: () => void }) {
  const share = () => {
    const { member, password } = added;
    const message = shareCredentialsText({ email: member.email, password, role: member.role });
    // `message` works on both platforms; dialogTitle is Android only and subject is used by iOS mail.
    Share.share({ message }, { dialogTitle: TEAM_COPY.share, subject: 'Your Tekmadev Admin sign-in' }).catch(() =>
      notice.err('Could not open the share sheet.'),
    );
  };
  return (
    <View style={styles.footer}>
      <Button label={TEAM_COPY.share} icon={Share2} fullWidth onPress={share} />
      <Button label={TEAM_COPY.done} variant="ghost" fullWidth onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
  password: { gap: space[2] },
  generate: { alignSelf: 'flex-start' },
  role: { gap: space[2] },
  footer: { gap: space[2] },
});
