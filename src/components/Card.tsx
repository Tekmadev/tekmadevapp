import type { ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityRole, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { PressableScale } from './PressableScale';

export type CardProps = {
  children?: ReactNode;
  /** 16dp inner padding (default true). Turn off for edge to edge rows inside. */
  padded?: boolean;
  /** Makes the whole card a button (press scale + light haptic). */
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A surface with a 1px hairline border and 20dp corners. No shadow: depth comes
 * from the border, plus a faint lineSoft highlight along the top edge in dark mode.
 */
export function Card({
  children,
  padded = true,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  disabled,
  style,
  testID,
}: CardProps) {
  const { colors, isDark } = useTheme();
  const surface = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, padded ? styles.padded : null, style];
  const highlight = isDark ? (
    <View pointerEvents="none" style={[styles.highlight, { borderColor: colors.lineSoft }]} />
  ) : null;

  if (onPress || onLongPress) {
    return (
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: Boolean(disabled) }}
        testID={testID}
        style={surface}
      >
        {highlight}
        {children}
      </PressableScale>
    );
  }

  return (
    <View
      style={surface}
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel ? true : undefined}
    >
      {highlight}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  padded: { padding: space[4] },
  // A top border on a rounded box tapers into the corners: a soft inner light, not a line.
  highlight: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.card - 1,
    borderTopWidth: 1,
  },
});
