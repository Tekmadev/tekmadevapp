import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { layout, radius, type Palette, type Tone } from '@/design/tokens';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

export type IconButtonProps = {
  icon: LucideIcon;
  /** Required: what TalkBack reads ("Search", "Back"). */
  accessibilityLabel: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** plain: icon only; tonal: a soft filled circle behind the icon. */
  variant?: 'plain' | 'tonal';
  /** Icon size, 20 to 22dp (default 22). */
  size?: number;
  /** A palette colour (default ink2). */
  color?: Exclude<keyof Palette, 'goldGradient'>;
  tone?: Tone;
  strokeWidth?: number;
  /** A small dot on the top right: gold, or signal for something urgent. */
  badge?: boolean | 'gold' | 'signal';
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A 48dp icon-only button. The label is mandatory so TalkBack never says "button". */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  onLongPress,
  variant = 'plain',
  size = 22,
  color = 'ink2',
  tone,
  strokeWidth,
  badge,
  disabled,
  accessibilityHint,
  style,
  testID,
}: IconButtonProps) {
  const { colors } = useTheme();
  const dot = badge === true ? 'gold' : badge || null;
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      testID={testID}
      style={[styles.target, disabled ? styles.disabled : null, style]}
    >
      <View
        style={[
          styles.face,
          variant === 'tonal' ? { backgroundColor: colors.bg3, borderColor: colors.line, borderWidth: 1 } : null,
        ]}
      >
        <Icon icon={icon} size={size} color={color} tone={tone} strokeWidth={strokeWidth} />
      </View>
      {dot ? (
        <View
          pointerEvents="none"
          style={[styles.dot, { backgroundColor: dot === 'signal' ? colors.signal : colors.gold, borderColor: colors.bg }]}
        />
      ) : null}
    </PressableScale>
  );
}

const FACE = 40;

const styles = StyleSheet.create({
  target: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  dot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
