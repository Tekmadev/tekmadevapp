import { useId } from 'react';
import { StyleSheet, View } from 'react-native';

import { MESSAGES } from '@/api/errors';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';

import { Button, type ButtonProps } from './Button';
import { reportSubmitError, useSubmitGroup, type SubmitGroupHandle } from './SubmitGroup';
import { Text } from './Text';

export type PendingButtonProps = Omit<ButtonProps, 'onPress' | 'onLongPress' | 'pending'> & {
  /** The action. The button is pending until the returned promise settles. */
  onPress: () => Promise<unknown> | unknown;
  /** Shown next to the spinner while the action runs ("Saving"). Defaults to the label. */
  pendingLabel?: string;
  /** Disabled offline with the hint "You are offline" (default true). Local-only actions pass false. */
  requiresNetwork?: boolean;
  /** Show the offline hint under this button (default true). In a row of buttons, keep it on one of them. */
  offlineHint?: boolean;
  /** A group handle for controls that live outside this button's <SubmitGroup> subtree. */
  group?: SubmitGroupHandle;
  /**
   * Own the failure (inline field errors, custom copy). Without it the API's
   * message is shown as a notice. The button returns to idle either way.
   */
  onError?: (error: unknown) => void;
};

/**
 * The mobile PendingSubmit. While its action runs, only this button shows the
 * black hole and its pending label, and every other submit control of the same
 * SubmitGroup (every sheet is one) is disabled, so nothing is sent twice.
 *
 *   <PendingButton label="Save changes" pendingLabel="Saving" onPress={() => save.mutateAsync(values)} />
 */
export function PendingButton({
  onPress,
  pendingLabel,
  requiresNetwork = true,
  offlineHint = true,
  group,
  onError,
  disabled = false,
  fullWidth = false,
  accessibilityHint,
  style,
  ...button
}: PendingButtonProps) {
  const id = useId();
  const { pendingId, busy, run } = useSubmitGroup(group);
  const online = useIsOnline();
  const offline = requiresNetwork && !online;
  const pending = pendingId === id;

  const press = () => {
    const task = run(id, async () => onPress());
    task?.catch((error: unknown) => reportSubmitError(error, onError));
  };

  return (
    <View style={[styles.wrap, fullWidth ? styles.full : null, style]}>
      <Button
        {...button}
        onPress={press}
        pending={pending}
        pendingLabel={pendingLabel}
        disabled={disabled || offline || (busy && !pending)}
        accessibilityHint={offline ? MESSAGES.offline : accessibilityHint}
      />
      {offline && offlineHint ? (
        <Text variant="small" color="ink3" align="center" style={styles.hint}>
          {MESSAGES.offline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The wrapper takes the caller's layout style; the button fills it.
  wrap: { alignItems: 'stretch' },
  full: { alignSelf: 'stretch' },
  hint: { marginTop: space[1] + 2 },
});
