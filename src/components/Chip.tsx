import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { chipLabel } from './parts/logic';

export type ChipProps = {
  label: string;
  /** Shown as "Needs action (3)". */
  count?: number | null;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  /** radio (single select) or checkbox (multi select) semantics for TalkBack. */
  role?: 'radio' | 'checkbox' | 'button';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A filter chip: a hairline pill, or gold tint with a gold border when selected.
 * A selection tick on toggle (haptics.selection), not the button press tap.
 */
export function Chip({ label, count, selected = false, onPress, icon, disabled = false, role = 'checkbox', style, testID }: ChipProps) {
  const { colors, isDark } = useTheme();
  const text = selected ? (isDark ? colors.goldMid : colors.goldDeep) : colors.ink2;
  const shown = chipLabel(label, count);
  return (
    <PressableScale
      haptic={false}
      onPress={() => {
        haptics.selection();
        onPress?.();
      }}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={shown}
      accessibilityState={role === 'button' ? { disabled } : { checked: selected, selected, disabled }}
      // 36dp pill, 48dp target.
      hitSlop={{ top: 6, bottom: 6 }}
      testID={testID}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.goldTint, borderColor: colors.gold }
          : { backgroundColor: colors.surface, borderColor: colors.line },
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon ? <Icon icon={icon} size={15} rawColor={text} strokeWidth={selected ? 2.25 : 1.75} /> : null}
        <Text variant="label" weight={selected ? '600' : '500'} numberOfLines={1} style={{ color: text }}>
          {shown}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    paddingHorizontal: space[4] - 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[1] + 2 },
  disabled: { opacity: 0.4 },
});
