import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { type as typeScale } from '@/design/typography';
import { ButtonSpinner } from '@/loader/ButtonSpinner';

export type ActionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  /** Shows the black hole and `pendingLabel`; the button keeps its width. */
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** The spinner is sized to the label, as the brief asks (about 1.15x the font size). */
const SPINNER = Math.round(typeScale.button.fontSize * 1.15);

/**
 * The buttons used by ApprovalCard and JobProgress. It follows the PendingButton
 * rules from the brief: only the pressed button shows the spinner and its
 * pending label, the caller disables the others, and nothing changes width
 * while it runs (an invisible copy of the wider label holds the size).
 * Kept local to automation so these components do not depend on kit files
 * that are still being built; swap to PendingButton once it lands.
 */
export function ActionButton({
  label,
  onPress,
  variant = 'secondary',
  pending = false,
  pendingLabel,
  disabled = false,
  icon,
  accessibilityLabel,
  style,
  testID,
}: ActionButtonProps) {
  const { colors } = useTheme();
  const busyLabel = pendingLabel ?? label;
  const inert = disabled || pending;

  const palette: Record<ActionButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.ink, fg: colors.onInk, border: colors.ink },
    secondary: { bg: 'transparent', fg: colors.ink, border: colors.lineStrong },
    ghost: { bg: 'transparent', fg: colors.ink2, border: 'transparent' },
    destructive: { bg: colors.signal, fg: colors.onInk, border: colors.signal },
  };
  const { bg, fg, border } = palette[variant];

  const idle = (
    <View style={styles.inner}>
      {icon ? <Icon icon={icon} size={18} rawColor={fg} /> : null}
      <Text variant="button" numberOfLines={1} style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
  const busy = (
    <View style={styles.inner}>
      <ButtonSpinner size={SPINNER} color={fg} />
      <Text variant="button" numberOfLines={1} style={{ color: fg }}>
        {busyLabel}
      </Text>
    </View>
  );

  return (
    <PressableScale
      onPress={onPress}
      disabled={inert}
      accessibilityLabel={pending ? busyLabel : (accessibilityLabel ?? label)}
      accessibilityState={{ disabled: inert, busy: pending }}
      testID={testID}
      style={[
        styles.button,
        { backgroundColor: bg, borderColor: border },
        variant === 'ghost' ? styles.ghost : null,
        disabled && !pending ? styles.disabled : null,
        style,
      ]}
    >
      <View>
        <View style={pending ? styles.hidden : null}>{idle}</View>
        {/* Zero-height copy of the pending row: it only lends its width, so the button never jumps. */}
        <View style={styles.sizer} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {busy}
        </View>
        {pending ? <View style={[StyleSheet.absoluteFill, styles.centre]}>{busy}</View> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: layout.minTouch,
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { paddingHorizontal: space[3] },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  hidden: { opacity: 0 },
  sizer: { height: 0, opacity: 0, overflow: 'hidden' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
