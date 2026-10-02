import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PendingButton } from '@/components/PendingButton';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

export type LeaveSheetProps = {
  visible: boolean;
  /** Keep editing (also back, a tap on the scrim, a drag down). */
  onClose: () => void;
  onSave: () => Promise<unknown>;
  onSaveError: (error: unknown) => void;
  onDiscard: () => void;
};

/**
 * The unsaved-changes guard (brief 8.11): leaving with changes asks first.
 * Save saves and then leaves, Discard drops the changes and the copy kept on
 * this phone, Keep editing stays.
 */
export function LeaveSheet({ visible, onClose, onSave, onSaveError, onDiscard }: LeaveSheetProps) {
  const footer = (
    <View style={styles.footer}>
      <PendingButton label="Save" pendingLabel="Saving" fullWidth onPress={onSave} onError={onSaveError} />
      <Button label="Discard" variant="secondary" fullWidth onPress={onDiscard} />
      <Button label="Keep editing" variant="ghost" fullWidth onPress={onClose} />
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Save your changes?" footer={footer}>
      <Text variant="body" color="ink2" style={styles.message}>
        This post has changes that are not saved yet. Discarding them cannot be undone.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space[2] },
  message: { paddingBottom: space[2] },
});
