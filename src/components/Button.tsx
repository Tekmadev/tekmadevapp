import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { durations } from '@/design/motion';
import { useTheme, type Theme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { type as typeScale, type TypeVariant } from '@/design/typography';
import { ButtonSpinner } from '@/loader/ButtonSpinner';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'gold';
export type ButtonSize = 'md' | 'sm';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** primary: ink pill; secondary: hairline border; ghost: text only; destructive: signal; gold: the rare hero action. */
  variant?: ButtonVariant;
  /** md is 48dp tall; sm is 40dp but keeps a 48dp touch target. */
  size?: ButtonSize;
  /** Leading icon. */
  icon?: LucideIcon;
  /** Stretch across the parent (alignSelf: stretch). */
  fullWidth?: boolean;
  disabled?: boolean;
  /** Shows the black hole and `pendingLabel` in place of the label. The button keeps its size. */
  pending?: boolean;
  pendingLabel?: string;
  /** Light haptic on press (default true). */
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type ButtonColors = { bg: string; fg: string; border: string };

/**
 * Text on the filled variants is `onInk` in both themes: warm white on light
 * ink, signal and deep gold; near black on the light dark-theme fills. Plain
 * white on the dark-theme signal would be about 3.6:1, below the 4.5:1 rule.
 */
export function buttonColors({ colors, isDark }: Theme, variant: ButtonVariant): ButtonColors {
  switch (variant) {
    case 'primary':
      return { bg: colors.ink, fg: colors.onInk, border: colors.ink };
    case 'secondary':
      return { bg: 'transparent', fg: colors.ink, border: colors.lineStrong };
    case 'ghost':
      return { bg: 'transparent', fg: colors.ink2, border: 'transparent' };
    case 'destructive':
      return { bg: colors.signal, fg: colors.onInk, border: colors.signal };
    case 'gold': {
      const bg = isDark ? colors.gold : colors.goldDeep;
      return { bg, fg: colors.onInk, border: bg };
    }
  }
}

type SizeSpec = { height: number; padding: number; text: TypeVariant; icon: number; hitSlop?: Insets };

const SIZES: Record<ButtonSize, SizeSpec> = {
  md: { height: layout.minTouch, padding: space[5], text: 'button', icon: 18 },
  sm: { height: 40, padding: space[4], text: 'label', icon: 16, hitSlop: { top: 4, bottom: 4 } },
};

/** The black hole is sized to the label: about 1.15x the font size (brief section 5). */
export function spinnerSizeFor(text: TypeVariant): number {
  return Math.round((typeScale[text].fontSize ?? typeScale.button.fontSize) * 1.15);
}

/**
 * The app's button: a pill on PressableScale (0.97 press, light haptic).
 * Disabled is 40% opacity. While `pending`, only this button shows the
 * spinner and its pending label, and it never changes size: both rows are
 * laid out, so the button is as wide as the wider of the two from the start.
 * For server actions use PendingButton, which runs the action and handles
 * the submit group, offline and errors.
 */
export function Button({
  label,
  onPress,
  onLongPress,
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth = false,
  disabled = false,
  pending = false,
  pendingLabel,
  haptic = true,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const { bg, fg, border } = buttonColors(theme, variant);
  const spec = SIZES[size];
  const busyLabel = pendingLabel ?? label;
  const spinner = spinnerSizeFor(spec.text);
  const inert = disabled || pending;
  const textStyle = { color: fg };

  const idleRow = (
    <View style={styles.row}>
      {icon ? <Icon icon={icon} size={spec.icon} rawColor={fg} /> : null}
      <Text variant={spec.text} weight="600" numberOfLines={1} style={textStyle}>
        {label}
      </Text>
    </View>
  );

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={inert}
      haptic={haptic}
      hitSlop={spec.hitSlop}
      accessibilityRole="button"
      accessibilityLabel={pending ? busyLabel : (accessibilityLabel ?? label)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: pending }}
      testID={testID}
      style={[
        styles.button,
        { minHeight: spec.height, paddingHorizontal: variant === 'ghost' ? space[3] : spec.padding },
        { backgroundColor: bg, borderColor: border },
        fullWidth ? styles.full : null,
        disabled && !pending ? styles.disabled : null,
        style,
      ]}
    >
      <View>
        <View style={pending ? styles.hidden : null}>{idleRow}</View>
        {/* Zero-height copy of the pending row: it only lends its width, so nothing jumps. */}
        <View style={styles.sizer} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={styles.row}>
            <View style={{ width: spinner, height: spinner }} />
            <Text variant={spec.text} weight="600" numberOfLines={1}>
              {busyLabel}
            </Text>
          </View>
        </View>
        {pending ? (
          <Animated.View entering={FadeIn.duration(durations.fast)} style={[StyleSheet.absoluteFill, styles.centre]}>
            <View style={styles.row}>
              <ButtonSpinner size={spinner} color={fg} />
              <Text variant={spec.text} weight="600" numberOfLines={1} style={textStyle}>
                {busyLabel}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  hidden: { opacity: 0 },
  sizer: { height: 0, opacity: 0, overflow: 'hidden' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
