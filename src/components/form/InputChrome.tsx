import type { LucideIcon } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { durations, fade } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, type Palette } from '@/design/tokens';
import { MAX_FONT_SCALE, type } from '@/design/typography';

/**
 * The shared look of every boxed form control (TextField, TextArea, Select,
 * DateField...): a 14dp box with a 1px border that turns gold on focus and
 * signal on error, and a label that floats from the placeholder position to a
 * small label above the value.
 *
 * Metrics follow the font scale (capped at 1.3) so a large system font never
 * clips the label against the value.
 */

export const INPUT_PAD_H = 14;
/** Top of the floated label inside the box. */
export const FLOAT_TOP = 7;
/** Floated label size relative to the resting label (15sp to 12sp). */
export const LABEL_SCALE = 0.8;
/** Gap between a leading or trailing adornment and the value. */
export const ADORNMENT_GAP = 8;

export type FieldFill = 'bg2' | 'surface';

export type InputMetrics = {
  fontScale: number;
  /** Body line height at the current font scale. */
  lineHeight: number;
  /** Space above the value: room for the floated label. */
  padTop: number;
  padBottom: number;
  /** Where a resting label sits in a single line box (vertically centred). */
  restTop: number;
  /** Single line box height (56dp at the default font size, 48dp without a label). */
  minHeight: number;
};

export function useInputMetrics(hasLabel: boolean): InputMetrics {
  const { fontScale } = useWindowDimensions();
  const fs = Math.min(fontScale || 1, MAX_FONT_SCALE);
  const lineHeight = type.body.lineHeight * fs;
  if (!hasLabel) {
    const pad = 13;
    const minHeight = Math.max(layout.minTouch, Math.round(pad * 2 + lineHeight));
    return { fontScale: fs, lineHeight, padTop: pad, padBottom: pad, restTop: pad, minHeight };
  }
  const padTop = Math.round(FLOAT_TOP + lineHeight * LABEL_SCALE + 1);
  const padBottom = 8;
  const minHeight = Math.max(56, Math.round(padTop + lineHeight + padBottom));
  return { fontScale: fs, lineHeight, padTop, padBottom, restTop: (minHeight - lineHeight) / 2, minHeight };
}

/** 0 = resting label, 1 = floated. 180ms on the standard easing; jumps when motion is reduced. */
export function useFloatProgress(floated: boolean): SharedValue<number> {
  const progress = useSharedValue(floated ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(floated ? 1 : 0, fade(durations.fast)));
  }, [floated, progress]);
  return progress;
}

type FieldBoxProps = {
  focused: boolean;
  error: boolean;
  fill?: FieldFill;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** The bordered box. The border colour eases to gold on focus; an error holds it at signal. */
export function FieldBox({ focused, error, fill = 'bg2', minHeight, style, children }: FieldBoxProps) {
  const { colors } = useTheme();
  const focus = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    focus.set(withTiming(focused ? 1 : 0, fade(durations.fast)));
  }, [focused, focus]);

  const line = colors.line;
  const gold = colors.gold;
  const signal = colors.signal;
  const border = useAnimatedStyle(() => ({
    borderColor: error ? signal : interpolateColor(focus.get(), [0, 1], [line, gold]),
  }));

  return (
    <Animated.View style={[styles.box, { backgroundColor: colors[fill], minHeight }, border, style]}>{children}</Animated.View>
  );
}

type FloatingLabelProps = {
  label: string;
  progress: SharedValue<number>;
  /** Resting top inside the value column (centre of a single line box, or the first line of a text area). */
  restTop: number;
  active: boolean;
  error: boolean;
};

/**
 * Purely visual: the input itself carries the label for TalkBack, so this is
 * hidden from accessibility to avoid reading the label twice.
 */
export function FloatingLabel({ label, progress, restTop, active, error }: FloatingLabelProps) {
  const lift = FLOAT_TOP - restTop;
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return { transform: [{ translateY: lift * p }, { scale: 1 - (1 - LABEL_SCALE) * p }] };
  });
  return (
    <Animated.View
      style={[styles.label, { top: restTop }, style]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text variant="body" numberOfLines={1} color={error ? 'signal' : 'ink3'} tone={!error && active ? 'gold' : undefined}>
        {label}
      </Text>
    </Animated.View>
  );
}

type FieldIconButtonProps = {
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  color?: keyof Palette;
  size?: number;
  disabled?: boolean;
  /** Use a selection tick instead of the default light press haptic. */
  selectionHaptic?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** A 48dp icon-only button for the inside of a field (clear, show password, month arrows). */
export function FieldIconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  color = 'ink3',
  size = 20,
  disabled,
  testID,
  style,
}: FieldIconButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      pressedScale={0.88}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={[styles.iconButton, disabled ? styles.iconDisabled : null, style]}
    >
      <Icon icon={icon} size={size} color={color} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: INPUT_PAD_H,
    overflow: 'hidden',
  },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    transformOrigin: 'left top',
    pointerEvents: 'none',
  },
  iconButton: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  iconDisabled: {
    opacity: 0.4,
  },
});
