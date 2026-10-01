import type { LucideIcon } from 'lucide-react-native';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, space } from '@/design/tokens';

import { Icon } from '../Icon';
import { PressableScale } from '../PressableScale';
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
  /** Context under the title (the record the actions apply to). */
  subtitle?: string;
  items: ActionSheetItem[];
  testID?: string;
};

/** More rows than this scroll inside the sheet. */
const SCROLL_AFTER = 7;

/**
 * A list of actions in a sheet. Choosing one closes the sheet first and runs
 * the action on the next frame, once the close animation has started, so an
 * action that opens another sheet (a ConfirmSheet) stacks cleanly on top.
 */
export function ActionSheet({ visible, onClose, title, subtitle, items, testID }: ActionSheetProps) {
  // A second tap in the same frame (before the closing sheet stops taking touches) must not run an action twice.
  const choosing = useRef(false);
  const choose = (item: ActionSheetItem) => {
    if (choosing.current) return;
    choosing.current = true;
    onClose();
    requestAnimationFrame(() => {
      choosing.current = false;
      item.onPress();
    });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      scrollable={items.length > SCROLL_AFTER}
      testID={testID}
    >
      <View style={styles.list} accessibilityRole="menu">
        {items.map((item, index) => (
          <ActionRow key={`${index}:${item.label}`} item={item} onPress={() => choose(item)} />
        ))}
      </View>
    </Sheet>
  );
}

function ActionRow({ item, onPress }: { item: ActionSheetItem; onPress: () => void }) {
  const { label, icon, destructive = false, disabled = false, hint } = item;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      pressedScale={0.98}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={[styles.row, disabled ? styles.disabled : null]}
    >
      {icon ? <Icon icon={icon} size={22} color={destructive ? 'signal' : 'ink2'} /> : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" color={destructive ? 'signal' : 'ink'}>
          {label}
        </Text>
        {hint ? (
          <Text variant="small" color="ink3">
            {hint}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  list: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    minHeight: 56,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    // Rows reach a little past the gutter so their text lines up with the title.
    marginHorizontal: -space[3],
    borderRadius: radius.input,
  },
  text: { flex: 1, gap: 2 },
  disabled: { opacity: 0.4 },
});
