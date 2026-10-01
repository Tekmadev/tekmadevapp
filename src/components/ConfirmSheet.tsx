import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@/design/tokens';

import { Button } from './Button';
import { HoldToConfirm, type HoldTone } from './HoldToConfirm';
import { Sheet } from './sheet/Sheet';
import { Text } from './Text';

export type ConfirmSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** A short question or name of the action ("Move to trash?"). */
  title: string;
  /** Exactly what will happen, in the brief's words ("Move Acme Plumbing to trash. Data is kept; the portal stops working for them."). */
  message: string;
  /** The hold button's label ("Hold to move to trash"). */
  confirmLabel: string;
  /** Next to the spinner while onConfirm runs ("Moving to trash"). */
  pendingLabel?: string;
  tone?: HoldTone;
  /** The action. The sheet closes when it resolves and stays open (with the error shown) when it throws. */
  onConfirm: () => Promise<unknown> | unknown;
  /** Own the failure; without it the API's message is shown as a notice. */
  onError?: (error: unknown) => void;
  cancelLabel?: string;
  requiresNetwork?: boolean;
  /** Extra content under the message (a reason field, a list of what is affected). */
  children?: ReactNode;
  testID?: string;
};

/**
 * The confirm step for destructive or irreversible actions: a sheet that says
 * what will happen, a HoldToConfirm and "Cancel". It cannot be dismissed while
 * the action runs, and closes itself once it succeeds.
 */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  pendingLabel,
  tone = 'signal',
  onConfirm,
  onError,
  cancelLabel = 'Cancel',
  requiresNetwork = true,
  children,
  testID,
}: ConfirmSheetProps) {
  const [confirming, setConfirming] = useState(false);

  const confirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } catch (error) {
      // Stay open; HoldToConfirm shows the error.
      setConfirming(false);
      throw error;
    }
    setConfirming(false);
    onClose();
  };

  const footer = (
    <View style={styles.footer}>
      <HoldToConfirm
        label={confirmLabel}
        pendingLabel={pendingLabel}
        tone={tone}
        onConfirm={confirm}
        onError={onError}
        requiresNetwork={requiresNetwork}
      />
      <Button label={cancelLabel} variant="ghost" fullWidth disabled={confirming} onPress={onClose} />
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={title} dismissible={!confirming} footer={footer} testID={testID}>
      <View style={styles.body}>
        <Text variant="body" color="ink2">
          {message}
        </Text>
        {children}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[2] },
  footer: { gap: space[2] },
});
