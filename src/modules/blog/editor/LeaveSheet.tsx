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
  /** The post has unsaved changes (Save and Discard). Without them only an upload holds the screen (Leave). */
  dirty: boolean;
  /** An image is still uploading: leaving now drops it. */
  uploading: boolean;
  onSave: () => Promise<unknown>;
  onSaveError: (error: unknown) => void;
  onDiscard: () => void;
  /** Leave with nothing to save or discard (only an upload was running). */
  onLeave: () => void;
};

const UPLOADING_NOTE = 'An image is still uploading. If you leave now, it is not added to the post.';

/**
 * The unsaved-changes guard (brief 8.11): leaving with changes asks first.
 * Save saves and then leaves, Discard drops the changes and the copy kept on
 * this phone, Keep editing stays. An image still uploading also asks, since
 * leaving drops it; with nothing else unsaved the choice is Leave or Keep editing.
 */
export function LeaveSheet({ visible, onClose, dirty, uploading, onSave, onSaveError, onDiscard, onLeave }: LeaveSheetProps) {
  const footer = dirty ? (
    <View style={styles.footer}>
      <PendingButton label="Save" pendingLabel="Saving" fullWidth onPress={onSave} onError={onSaveError} />
      <Button label="Discard" variant="secondary" fullWidth onPress={onDiscard} />
      <Button label="Keep editing" variant="ghost" fullWidth onPress={onClose} />
    </View>
  ) : (
    <View style={styles.footer}>
      <Button label="Leave" variant="secondary" fullWidth onPress={onLeave} />
      <Button label="Keep editing" variant="ghost" fullWidth onPress={onClose} />
    </View>
  );
  const title = dirty ? 'Save your changes?' : uploading ? 'Leave before the image is added?' : 'Leave this post?';
  return (
    <Sheet visible={visible} onClose={onClose} title={title} footer={footer}>
      <View style={styles.message}>
        {dirty ? (
          <Text variant="body" color="ink2">
            This post has changes that are not saved yet. Discarding them cannot be undone.
          </Text>
        ) : null}
        {uploading ? (
          <Text variant="body" color="ink2">
            {UPLOADING_NOTE}
          </Text>
        ) : null}
        {!dirty && !uploading ? (
          <Text variant="body" color="ink2">
            Nothing here is unsaved.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space[2] },
  message: { gap: space[2], paddingBottom: space[2] },
});
