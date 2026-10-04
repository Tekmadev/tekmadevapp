import { CircleAlert, Info } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import type { Role } from '@/api/types';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { PasswordField, TextField } from '@/components/form';
import { haptics } from '@/design/haptics';
import { durations, enterPull, springs } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { env } from '@/lib/env';
import { BreathingMark } from '@/loader/BreathingMark';

import { ForgotPasswordSheet } from './ForgotPasswordSheet';
import { FormSubmitButton, useFormSubmit } from './FormSubmit';
import { session, SIGN_IN_MESSAGES, useSession } from './session';
import { validateSignIn, type SignInFieldErrors } from './signInForm';

/** The hero mark: large, but leaves the form in thumb reach on a small phone. */
const MARK_SIZE = 96;
/** Keeps the Sign in button above the keyboard while either field is focused. */
const KEYBOARD_GAP = 112;
const CONTENT_MAX_WIDTH = 440;
const SUBMIT_ID = 'sign-in';

/** Dev builds with mock auth only: one tap fills a fixture staff account. */
const SHOW_MOCK_ACCOUNTS = __DEV__ && env.authMode === 'mock';

/**
 * enterPull, typed for `entering`. motion.ts declares a wider return type than the
 * function it actually returns, which `entering` rejects (reported to the lead).
 */
const pull = (index: number) => enterPull(index);

/** Things grow or shrink (a message appears) with the default spring rather than jumping. */
const settle = LinearTransition.springify()
  .damping(springs.default.damping)
  .stiffness(springs.default.stiffness)
  .mass(springs.default.mass);

export type SignInMarkAnchor = { x: number; y: number; size: number };

/**
 * Where the hero mark sits in the window (its centre, in dp). The boot splash
 * can pass this as `exitTo` so its mark lands exactly on this one when the app
 * starts signed out, instead of fading in the middle of the screen.
 */
export const useSignInMarkAnchor = create<{ anchor: SignInMarkAnchor | null }>()(() => ({ anchor: null }));

type Message = { tone: 'error' | 'info'; text: string };

/**
 * Sign in (brief 8.2): grain on bg, the slowly breathing mark, then the form
 * pulled into place under it. Errors are the exact copy from session.signIn,
 * shown inline above the button; a forced sign-out explains itself once.
 */
export function SignInScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SignInFieldErrors>({});
  // A forced sign-out message ("Your session ended. Sign in again.") is shown once, then forgotten.
  const [message, setMessage] = useState<Message | null>(() => {
    const text = useSession.getState().signOutMessage;
    return text ? { tone: 'info', text } : null;
  });
  const [forgotOpen, setForgotOpen] = useState(false);

  // The screen can already be mounted when the message arrives (it sits under the
  // boot splash while the session restores), so later ones are picked up too.
  useEffect(() => {
    if (useSession.getState().signOutMessage) useSession.setState({ signOutMessage: null });
    return useSession.subscribe((state) => {
      if (!state.signOutMessage) return;
      setMessage({ tone: 'info', text: state.signOutMessage });
      useSession.setState({ signOutMessage: null });
    });
  }, []);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const markRef = useRef<View>(null);

  const signIn = async () => {
    setMessage(null);
    const result = await session.signIn(email, password);
    if (result.ok) {
      // The navigator swaps to Home on its own; nothing to reset here.
      haptics.success();
      return;
    }
    setMessage({ tone: 'error', text: result.message });
    haptics.error();
  };

  const form = useFormSubmit(SUBMIT_ID, signIn, {
    // Offline still tries, so the person gets the brief's own network message.
    requiresNetwork: false,
    validate: () => {
      const errors = validateSignIn(email, password);
      if (!errors) return true;
      setFieldErrors(errors);
      haptics.error();
      (errors.email ? emailRef : passwordRef).current?.focus();
      return false;
    },
    // session.signIn reports failures as results; this only catches a bug in it.
    onError: () => {
      setMessage({ tone: 'error', text: SIGN_IN_MESSAGES.generic });
      haptics.error();
    },
  });

  const fillMockAccount = (role: Role) => {
    // Lazy, like mockAuth: fixture data stays out of the startup path.
    import('@/api/mock/fixtures/staff')
      .then(({ MOCK_ACCOUNTS }) => {
        const account = MOCK_ACCOUNTS.find((a) => a.role === role);
        if (!account) return;
        setEmail(account.email);
        setPassword(account.password);
        setFieldErrors({});
        setMessage(null);
      })
      .catch(() => undefined);
  };

  const onMarkLayout = () => {
    markRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      useSignInMarkAnchor.setState({ anchor: { x: x + width / 2, y: y + height / 2, size: MARK_SIZE } });
    });
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <Grain />
      <KeyboardAwareScrollView
        style={styles.fill}
        bottomOffset={KEYBOARD_GAP}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space[12], paddingBottom: insets.bottom + space[6] },
        ]}
      >
        <View style={styles.column}>
          <View style={styles.hero}>
            {/* Not pulled like the rest: the boot splash's mark lands here, so it must already be in place. */}
            <Animated.View entering={FadeIn.duration(durations.slow)}>
              <View ref={markRef} onLayout={onMarkLayout} collapsable={false}>
                <BreathingMark size={MARK_SIZE} />
              </View>
            </Animated.View>
            <Animated.View entering={pull(1)} style={styles.titles}>
              <Text variant="eyebrow">Tekmadev Admin</Text>
              <Text variant="largeTitle" accessibilityRole="header">
                Welcome back.
              </Text>
            </Animated.View>
          </View>

          <View style={styles.spacer} />

          <View style={styles.form}>
            <Animated.View entering={pull(2)} layout={settle}>
              <TextField
                ref={emailRef}
                label="Email"
                value={email}
                onChangeText={(next) => {
                  setEmail(next);
                  if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: undefined }));
                }}
                error={fieldErrors.email}
                keyboardType="email-address"
                inputMode="email"
                autoComplete="email"
                textContentType="emailAddress"
                importantForAutofill="yes"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                readOnly={form.pending}
              />
            </Animated.View>
            <Animated.View entering={pull(3)} layout={settle}>
              <PasswordField
                ref={passwordRef}
                label="Password"
                value={password}
                onChangeText={(next) => {
                  setPassword(next);
                  if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
                }}
                error={fieldErrors.password}
                returnKeyType="go"
                onSubmitEditing={form.submit}
                readOnly={form.pending}
              />
            </Animated.View>

            {message ? <InlineMessage key={message.text} message={message} /> : null}

            <Animated.View entering={pull(4)} layout={settle} style={styles.submit}>
              <FormSubmitButton form={form} label="Sign in" pendingLabel="Signing in" />
            </Animated.View>
            <Animated.View entering={pull(5)} layout={settle} style={styles.forgot}>
              <Button
                label="Forgot password?"
                variant="ghost"
                size="sm"
                disabled={form.busy}
                onPress={() => setForgotOpen(true)}
              />
            </Animated.View>
          </View>

          {SHOW_MOCK_ACCOUNTS ? (
            <Animated.View entering={pull(6)} layout={settle} style={[styles.mock, { borderTopColor: colors.lineSoft }]}>
              <Text variant="eyebrow" color="ink4">
                Mock accounts
              </Text>
              <View style={styles.chips}>
                <Chip label="Owner" role="button" disabled={form.busy} onPress={() => fillMockAccount('owner')} />
                <Chip label="Manager" role="button" disabled={form.busy} onPress={() => fillMockAccount('manager')} />
                <Chip label="Staff" role="button" disabled={form.busy} onPress={() => fillMockAccount('staff')} />
              </View>
            </Animated.View>
          ) : null}
        </View>
      </KeyboardAwareScrollView>

      <ForgotPasswordSheet visible={forgotOpen} onClose={() => setForgotOpen(false)} initialEmail={email} />
    </View>
  );
}

/** The line above the button: errors in signal, a sign-out note in plain ink. Read out when it appears. */
function InlineMessage({ message }: { message: Message }) {
  const error = message.tone === 'error';
  return (
    <Animated.View
      entering={FadeIn.duration(durations.base)}
      layout={settle}
      style={styles.message}
      accessibilityLiveRegion="polite"
      accessible
      accessibilityRole={error ? 'alert' : 'text'}
      accessibilityLabel={message.text}
    >
      <View style={styles.messageIcon}>
        <Icon icon={error ? CircleAlert : Info} size={16} color={error ? 'signal' : 'ink3'} strokeWidth={2} />
      </View>
      <Text variant="label" color={error ? 'signal' : 'ink2'} style={styles.messageText}>
        {message.text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: space[6] },
  column: { flexGrow: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  hero: { gap: space[8] },
  titles: { gap: space[3] },
  // Pushes the form toward the thumb on tall phones; never less than a section gap.
  spacer: { flexGrow: 1, minHeight: space[10] },
  form: { gap: space[3] },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], paddingHorizontal: space[1] },
  messageIcon: { paddingTop: 1 },
  messageText: { flex: 1 },
  submit: { marginTop: space[2] },
  forgot: { alignSelf: 'center' },
  mock: { marginTop: space[8], paddingTop: space[5], borderTopWidth: 1, gap: space[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
