import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { sessionKeys, updateProfile } from '@/api/endpoints/session';
import { teamKeys } from '@/api/endpoints/team';
import { ApiError, errorMessage, fieldErrors } from '@/api/errors';
import { queryClient as appQueryClient } from '@/api/query';
import type { Me } from '@/api/schemas/session';
import { changePassword, hasPasswordErrors, PASSWORD_COPY, validateNewPassword, type PasswordErrors } from '@/auth/password';
import { roleCopy } from '@/auth/permissions';
import { session, useMe, useSession } from '@/auth/session';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { ErrorState } from '@/components/ErrorState';
import { PasswordField } from '@/components/form/PasswordField';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { SubmitGroup, reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { enterPull, useReduceMotion } from '@/design/motion';
import { space } from '@/design/tokens';
import { connectivity } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import { DISPLAY_NAME_MAX, isNameChanged, nameSavedMessage, nameToSave, PROFILE_COPY } from './logic';

/** /me is refreshed on focus at most this often (the name and role rarely change). */
const ME_FRESH_MS = 60_000;

function refreshMeIfStale() {
  if (!connectivity.isOnline()) return;
  const updatedAt = appQueryClient.getQueryState(sessionKeys.me)?.dataUpdatedAt ?? 0;
  if (Date.now() - updatedAt < ME_FRESH_MS) return;
  session.refreshMe().catch(() => undefined);
}

/** Pull to refresh: a failed pull keeps what is shown and says why. */
async function refreshMe() {
  if (!connectivity.isOnline()) return;
  try {
    await session.refreshMe();
  } catch (e) {
    // Session, owner-only and version problems are already handled by the API client.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 426 || e.kind === 'aborted')) return;
    notice.err(errorMessage(e));
  }
}

/**
 * Profile (brief 8.17, everyone): who you are signed in as (email, read only,
 * and your role), your display name, and changing your password. The profile
 * comes from GET /me, which is cached on the phone, so it shows at once and
 * offline; saving needs the connection.
 */
export function ProfileScreen() {
  const me = useMe();
  useFocusEffect(refreshMeIfStale);

  return (
    <Screen title={PROFILE_COPY.title} back keyboardAware onRefresh={refreshMe} queryKey={sessionKeys.me}>
      {me ? (
        <ProfileBody me={me} />
      ) : (
        <ErrorState message={PROFILE_COPY.loadFailed} onRetry={() => session.refreshMe().catch(() => undefined)} />
      )}
    </Screen>
  );
}

function ProfileBody({ me }: { me: Me }) {
  const still = useReduceMotion();
  const enter = (index: number) => (still ? undefined : enterPull(index));

  return (
    <View>
      <Animated.View entering={enter(0)} style={styles.block}>
        <IdentityCard me={me} />
      </Animated.View>
      <Animated.View entering={enter(1)}>
        <Section title="Account">
          <TextField label="Email" value={me.user.email} readOnly help={PROFILE_COPY.emailHelp} selectTextOnFocus={false} />
        </Section>
      </Animated.View>
      <Animated.View entering={enter(2)}>
        <DisplayNameForm me={me} />
      </Animated.View>
      <Animated.View entering={enter(3)}>
        <PasswordForm />
      </Animated.View>
    </View>
  );
}

function IdentityCard({ me }: { me: Me }) {
  // Owner gold, Manager neutral, Staff muted (the app's role table, like the More screen).
  const badge = roleCopy(me.role);
  const name = me.user.name?.trim() || null;
  const display = name ?? me.user.email;

  return (
    <Card accessibilityLabel={[display, name ? me.user.email : null, `Role: ${badge.label}`].filter(Boolean).join(', ')}>
      <View style={styles.identity} importantForAccessibility="no-hide-descendants">
        <Avatar name={display} size="lg" />
        <View style={styles.identityText}>
          <Text variant="title" numberOfLines={2}>
            {display}
          </Text>
          {name ? (
            <Text variant="small" color="ink3" numberOfLines={1}>
              {me.user.email}
            </Text>
          ) : null}
          <Badge label={badge.label} tone={badge.tone} style={styles.role} />
        </View>
      </View>
    </Card>
  );
}

/**
 * The display name: PATCH /profile, then the new name is applied to the signed
 * in profile at once and GET /me confirms it (and stores it for the next launch).
 * The Team list shows names too, so it is refreshed.
 */
function DisplayNameForm({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const saved = me.user.name ?? '';
  const [draft, setDraft] = useState(saved);
  const [base, setBase] = useState(saved);
  const [error, setError] = useState<string | null>(null);

  // The name changed elsewhere (a refresh of /me): follow it unless you were already editing.
  if (base !== saved) {
    setBase(saved);
    if (!isNameChanged(draft, base)) setDraft(saved);
  }

  const changed = isNameChanged(draft, saved);

  const save = async () => {
    const result = await updateProfile({ name: nameToSave(draft) });
    const current = useSession.getState().me;
    if (current) {
      const next: Me = { ...current, user: { ...current.user, name: result.name } };
      useSession.setState({ me: next });
      queryClient.setQueryData(sessionKeys.me, next);
    }
    setDraft(result.name ?? '');
    setBase(result.name ?? '');
    setError(null);
    void session.refreshMe().catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    haptics.success();
    notice.ok(nameSavedMessage(result.name));
  };

  const onError = (e: unknown) => {
    const fields = fieldErrors(e);
    haptics.error();
    if (fields.name) setError(fields.name);
    else reportSubmitError(e);
  };

  return (
    <Section title="Your name">
      <SubmitGroup>
        <View style={styles.form}>
          <TextField
            label="Display name"
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setError(null);
            }}
            error={error}
            help={PROFILE_COPY.nameHelp}
            maxLength={DISPLAY_NAME_MAX}
            showCount={false}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
          />
          <PendingButton
            label={PROFILE_COPY.saveName}
            pendingLabel={PROFILE_COPY.saving}
            variant="secondary"
            disabled={!changed}
            onPress={save}
            onError={onError}
            style={styles.button}
          />
        </View>
      </SubmitGroup>
    </Section>
  );
}

/** New password twice, checked here first, then changed on your own sign-in session. */
function PasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});

  const submit = async () => {
    const found = validateNewPassword(password, confirm);
    if (hasPasswordErrors(found)) {
      setErrors(found);
      haptics.error();
      return;
    }
    const result = await changePassword(password);
    if (!result.ok) {
      haptics.error();
      notice.err(result.message);
      return;
    }
    setPassword('');
    setConfirm('');
    setErrors({});
    haptics.success();
    notice.ok(PASSWORD_COPY.changed);
  };

  return (
    <Section title="Password">
      <SubmitGroup>
        <View style={styles.form}>
          <PasswordField
            label="New password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              // Typing here can fix either message.
              if (errors.password || errors.confirm) setErrors({});
            }}
            error={errors.password}
            help={PROFILE_COPY.passwordHelp}
            newPassword
            returnKeyType="next"
          />
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChangeText={(v) => {
              setConfirm(v);
              if (errors.confirm) setErrors((e) => ({ password: e.password }));
            }}
            error={errors.confirm}
            newPassword
            returnKeyType="done"
          />
          <PendingButton
            label={PROFILE_COPY.changePassword}
            pendingLabel={PROFILE_COPY.changing}
            disabled={password === '' && confirm === ''}
            onPress={submit}
            style={styles.button}
          />
        </View>
      </SubmitGroup>
    </Section>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: space[6] },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  identityText: { flex: 1, gap: 2 },
  role: { marginTop: space[1], alignSelf: 'flex-start' },
  form: { gap: space[4] },
  button: { alignSelf: 'flex-start' },
});
