import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { ButtonSpinner } from '@/loader/ButtonSpinner';

import { Icon } from '../Icon';
import { PressableScale } from '../PressableScale';
import { Text } from '../Text';

export type PillButtonProps = {
  label: string;
  onPress: () => void;
  /** primary: ink pill; secondary: hairline pill; link: gold text only. */
  variant?: 'primary' | 'secondary' | 'link';
  icon?: LucideIcon;
  /** Shows the black hole and `pendingLabel`, and ignores presses. */
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The small local-action button the kit's own states use (Retry, an empty
 * state's action, "View all"). Forms use PendingButton; this is not a submit.
 */
export function PillButton({
  label,
  onPress,
  variant = 'secondary',
  icon,
  pending = false,
  pendingLabel,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: PillButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || pending;
  const textColor = variant === 'primary' ? colors.onInk : variant === 'link' ? colors.gold : colors.ink;
  const shown = pending && pendingLabel ? pendingLabel : label;

  return (
    <PressableScale
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityLabel={shown}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: pending }}
      testID={testID}
      hitSlop={variant === 'link' ? { top: 12, bottom: 12, left: 8, right: 8 } : undefined}
      style={[
        styles.base,
        variant === 'link' ? styles.link : styles.pill,
        variant === 'primary' ? { backgroundColor: colors.ink } : null,
        variant === 'secondary' ? { borderColor: colors.lineStrong, borderWidth: 1, backgroundColor: colors.surface } : null,
        disabled && !pending ? styles.disabled : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {pending ? (
          <ButtonSpinner size={17} color={textColor} />
        ) : icon ? (
          <Icon icon={icon} size={16} rawColor={textColor} strokeWidth={2} />
        ) : null}
        <Text variant={variant === 'link' ? 'label' : 'button'} weight={variant === 'link' ? '600' : undefined} style={{ color: textColor }}>
          {shown}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start', justifyContent: 'center' },
  pill: {
    minHeight: layout.minTouch,
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
  },
  link: { minHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  disabled: { opacity: 0.4 },
});
