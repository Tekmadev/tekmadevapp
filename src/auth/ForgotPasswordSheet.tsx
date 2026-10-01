import { MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { TextField } from '@/components/form';
import { Sheet } from '@/components/sheet';
import { haptics } from '@/design/haptics';
import { durations } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';

import { FormSubmitButton, useFormSubmit } from './FormSubmit';
import { session } from './session';
import { emailProblem } from './signInForm';

/** Always the same answer, whether or not the account exists (brief 8.2). */
export const RESET_SENT_MESSAGE = 'If an account exists for that email, a reset link is on its way. Check your inbox.';

const SUBMIT_ID = 'reset-password';

export type ForgotPasswordSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** What is already typed on the sign-in screen, so it rarely needs typing twice. */
  initialEmail?: string;
};

/**
 * "Forgot password?": one email field, then the same confirmation for every
 * address so the sheet never reveals who has an account. The reset itself
 * happens on the website, from the link in the email.
 */
export function ForgotPasswordSheet({ visible, onClose, initialEmail = '' }: ForgotPasswordSheetProps) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Each opening starts fresh from the sign-in email (state adjusted during render, not in an effect).
  const [openedFor, setOpenedFor] = useState(visible);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) {
      setEmail(initialEmail.trim());
      setError(null);
      setSent(false);
    }
  }

  const validate = () => {
    const problem = emailProblem(email);
    setError(problem);
    if (problem) haptics.error();
    return problem === null;
  };

  const send = async () => {
    await session.sendPasswordReset(email.trim());
    setSent(true);
    haptics.success();
  };

  // sendPasswordReset never rejects; this only guards a bug from leaving the sheet silent.
  const onError = () => setSent(true);
  const submit = { action: send, validate, onError };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Reset your password"
      subtitle={sent ? undefined : "Enter your email. We'll send a link to set a new one."}
      footer={sent ? <Button label="Done" fullWidth onPress={onClose} /> : <SendButton {...submit} />}
    >
      {sent ? (
        <Sent />
      ) : (
        <EmailField
          value={email}
          error={error}
          {...submit}
          onChangeText={(next) => {
            setEmail(next);
            if (error) setError(null);
          }}
        />
      )}
    </Sheet>
  );
}

/*
 * The field and the button are rendered inside the sheet, so both join the
 * sheet's submit group and the keyboard's Send key runs the very same submit.
 */

type SubmitProps = { action: () => Promise<void>; validate: () => boolean; onError: (error: unknown) => void };

function SendButton({ action, validate, onError }: SubmitProps) {
  const form = useFormSubmit(SUBMIT_ID, action, { validate, onError });
  return <FormSubmitButton form={form} label="Send reset link" pendingLabel="Sending" />;
}

function EmailField({
  value,
  error,
  onChangeText,
  action,
  validate,
  onError,
}: SubmitProps & { value: string; error: string | null; onChangeText: (next: string) => void }) {
  const form = useFormSubmit(SUBMIT_ID, action, { validate, onError });
  return (
    <TextField
      label="Email"
      value={value}
      onChangeText={onChangeText}
      error={error}
      keyboardType="email-address"
      inputMode="email"
      autoComplete="email"
      textContentType="emailAddress"
      importantForAutofill="yes"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      returnKeyType="send"
      onSubmitEditing={form.submit}
      readOnly={form.pending}
    />
  );
}

function Sent() {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(durations.base)} style={styles.sent}>
      <View style={[styles.badge, { backgroundColor: colors.goldTint }]}>
        <Icon icon={MailCheck} size={22} color="gold" />
      </View>
      <Text variant="body" color="ink2" style={styles.sentText} accessibilityLiveRegion="polite">
        {RESET_SENT_MESSAGE}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sent: { flexDirection: 'row', alignItems: 'flex-start', gap: space[4], paddingTop: space[1], paddingBottom: space[2] },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sentText: { flex: 1, paddingTop: 1 },
});
