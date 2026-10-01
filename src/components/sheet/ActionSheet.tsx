import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { Text } from '../Text';
import { Sheet } from './Sheet';

export type ActionSheetItem = {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** One line under the label. */
  hint?: string;
};

export type ActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  items: ActionSheetItem[];
};

/** STUB (replaced by the component kit): a list of actions in a sheet. Closes before running the action. */
export function ActionSheet({ visible, onClose, title, items }: ActionSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {items.map((item) => (
        <Pressable key={item.label} disabled={item.disabled} onPress={() => { onClose(); item.onPress(); }} style={{ paddingVertical: 14 }}>
          <Text variant="bodyStrong" color={item.destructive ? 'signal' : 'ink'}>{item.label}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}
