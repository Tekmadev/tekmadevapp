import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MESSAGES } from '@/api/errors';
import { Button, type ButtonVariant } from '@/components/Button';
import { useSubmitGroup } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';

/**
 * Submit for the auth forms, pressable from the button AND from the keyboard's
 * action key (Go, Send). PendingButton cannot be pressed from code, so this is
 * the kit's documented custom submit pattern (useSubmitGroup + Button) with the
 * same behaviour: only the running control shows the black hole and its
 * pending label, every other control of the group is disabled, nothing is sent
 * twice, and a network-only action is disabled offline with "You are offline".
 *
 * Call the hook with the same `id` everywhere the form can be sent from. Inside
 * a Sheet every caller shares the sheet's group; on a screen, call it once and
 * pass `submit` down.
 */

export type FormSubmit = {
  /** Runs the action unless something in the group is already running (or offline when it needs the network). */
  submit: () => void;
  /** This form's action is running. */
  pending: boolean;
  /** Something in the group is running (this action or another one). */
  busy: boolean;
  /** Needs the network and there is none. */
  offline: boolean;
};

export type FormSubmitOptions = {
  /** Default true: disabled offline with "You are offline". */
  requiresNetwork?: boolean;
  /** Checked before anything runs; return false to stop (it shows its own inline errors). */
  validate?: () => boolean;
  /** The action threw. The control is idle again either way. */
  onError: (error: unknown) => void;
};

export function useFormSubmit(id: string, action: () => Promise<unknown>, options: FormSubmitOptions): FormSubmit {
  const { pendingId, busy, run } = useSubmitGroup();
  const online = useIsOnline();
  const offline = (options.requiresNetwork ?? true) && !online;
  const { validate, onError } = options;

  const submit = () => {
    if (offline || busy) return;
    // Validation runs outside the group, so an invalid form never flashes the pending state.
    if (validate && !validate()) return;
    run(id, action)?.catch(onError);
  };

  return { submit, pending: pendingId === id, busy, offline };
}

export type FormSubmitButtonProps = {
  form: FormSubmit;
  label: string;
  pendingLabel: string;
  variant?: ButtonVariant;
  /** Show "You are offline" under the button while it is disabled for that reason (default true). */
  offlineHint?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** The button half of useFormSubmit: looks and behaves exactly like PendingButton. */
export function FormSubmitButton({
  form,
  label,
  pendingLabel,
  variant = 'primary',
  offlineHint = true,
  style,
  testID,
}: FormSubmitButtonProps) {
  return (
    <View style={[styles.wrap, style]}>
      <Button
        label={label}
        pendingLabel={pendingLabel}
        variant={variant}
        fullWidth
        pending={form.pending}
        disabled={form.offline || (form.busy && !form.pending)}
        onPress={form.submit}
        accessibilityHint={form.offline ? MESSAGES.offline : undefined}
        testID={testID}
      />
      {form.offline && offlineHint ? (
        <Text variant="small" color="ink3" align="center" style={styles.hint}>
          {MESSAGES.offline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  hint: { marginTop: space[1] + 2 },
});
