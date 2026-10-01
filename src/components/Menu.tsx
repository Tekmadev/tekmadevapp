import { MoreVertical, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { layout } from '@/design/tokens';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { ActionSheet, type ActionSheetItem } from './sheet/ActionSheet';

export type MenuProps = {
  items: ActionSheetItem[];
  /** Sheet title (often the record's name). */
  title?: string;
  subtitle?: string;
  /** What TalkBack reads for the trigger (default "More options"). */
  accessibilityLabel?: string;
  icon?: LucideIcon;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Overflow menu: a 48dp "More options" trigger that opens an ActionSheet.
 * Renders nothing when there are no items (a manager may see none).
 */
export function Menu({
  items,
  title,
  subtitle,
  accessibilityLabel = 'More options',
  icon = MoreVertical,
  disabled = false,
  style,
  testID,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, expanded: open }}
        testID={testID}
        style={[styles.trigger, disabled ? styles.disabled : null, style]}
      >
        <Icon icon={icon} size={22} color="ink2" />
      </PressableScale>
      <ActionSheet visible={open} onClose={() => setOpen(false)} title={title} subtitle={subtitle} items={items} />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
