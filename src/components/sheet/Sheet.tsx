import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';

import { Text } from '../Text';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** 'content' sizes to the content (max 92% of the screen); numbers are fractions of the screen height. */
  snapPoints?: 'content' | readonly number[];
  /** Wrap children in a scroll view that cooperates with the drag-to-close gesture. */
  scrollable?: boolean;
  /** Pinned under the content (primary actions); stays above the keyboard. */
  footer?: ReactNode;
  /** False blocks drag-to-close, backdrop tap and back (e.g. while a request runs). Default true. */
  dismissible?: boolean;
  children: ReactNode;
  testID?: string;
};

/** STUB (replaced by the component kit): bottom sheet with snap points, 28dp radius, warm scrim. */
export function Sheet({ visible, onClose, title, subtitle, scrollable, footer, children, dismissible = true }: SheetProps) {
  const { colors } = useTheme();
  const Body = scrollable ? ScrollView : View;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => dismissible && onClose()}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={() => dismissible && onClose()} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: 16, maxHeight: '92%' }}>
        {title ? <Text variant="headlineSmall">{title}</Text> : null}
        {subtitle ? <Text variant="body" color="ink3">{subtitle}</Text> : null}
        <Body>{children}</Body>
        {footer}
      </View>
    </Modal>
  );
}
