import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The small set of buttons the form sheets need ("Done", "Clear", "Restore").
 * Local actions only: anything that talks to the server uses PendingButton.
 */
export function ActionButton({ label, onPress, variant = 'primary', disabled, accessibilityHint, style, testID }: ActionButtonProps) {
  const { colors } = useTheme();
  const primary = variant === 'primary';
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={[
        styles.button,
        primary ? { backgroundColor: colors.ink } : { borderColor: colors.lineStrong, borderWidth: 1 },
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text variant="button" color={primary ? 'onInk' : 'ink'} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  disabled: {
    opacity: 0.4,
  },
});
