import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityRole, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';

import { Field } from './Field';
import { FieldBox, FloatingLabel, useFloatProgress, useInputMetrics, type FieldFill } from './InputChrome';

export type FieldTriggerProps = {
  label: string;
  /** The chosen value as text; empty or null when nothing is chosen. */
  valueText?: string | null;
  /** Custom value content instead of valueText (e.g. chips). */
  children?: ReactNode;
  /** Whether the field holds a value (defaults to a non-empty valueText). */
  hasValue?: boolean;
  /** Shown in ink4 under the floated label when nothing is chosen ("All plans"). */
  placeholder?: string;
  /** Trailing icon (chevron, calendar, clock). */
  icon: LucideIcon;
  /** The picker is open: the border turns gold like a focused input. */
  open: boolean;
  onPress: () => void;
  help?: string | null;
  error?: string | null;
  disabled?: boolean;
  fill?: FieldFill;
  accessibilityRole?: AccessibilityRole;
  /** What a double tap does ("Opens a calendar"). */
  accessibilityHint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A field that looks like a TextField but opens a picker (Select, DateField,
 * DateTimeField). TalkBack reads it as one control: "Plan, Grow".
 */
export function FieldTrigger({
  label,
  valueText,
  children,
  hasValue,
  placeholder,
  icon,
  open,
  onPress,
  help,
  error,
  disabled = false,
  fill,
  accessibilityRole = 'button',
  accessibilityHint,
  containerStyle,
  testID,
}: FieldTriggerProps) {
  const metrics = useInputMetrics(true);
  const filled = hasValue ?? !!valueText;
  const floated = filled || open || !!placeholder;
  const progress = useFloatProgress(floated);
  const spoken = filled ? (valueText ?? '') : (placeholder ?? 'Not set');

  return (
    <Field help={help} error={error} disabled={disabled} style={containerStyle}>
      <PressableScale
        onPress={onPress}
        disabled={disabled}
        pressedScale={0.99}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={spoken ? `${label}, ${spoken}` : label}
        accessibilityHint={error ?? accessibilityHint}
        accessibilityState={{ disabled, expanded: open }}
        testID={testID}
      >
        <FieldBox focused={open} error={!!error} fill={fill} minHeight={metrics.minHeight}>
          <View style={styles.column}>
            <FloatingLabel label={label} progress={progress} restTop={metrics.restTop - 1} active={open} error={!!error} />
            <View
              style={[
                styles.value,
                { paddingTop: metrics.padTop, paddingBottom: metrics.padBottom - 1, minHeight: metrics.minHeight - 2 },
              ]}
            >
              {filled && children ? (
                children
              ) : filled ? (
                <Text variant="body" numberOfLines={2}>
                  {valueText}
                </Text>
              ) : placeholder ? (
                <Text variant="body" color="ink4" numberOfLines={1}>
                  {placeholder}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.icon}>
            <Icon icon={icon} size={20} color={open ? 'gold' : 'ink3'} />
          </View>
        </FieldBox>
      </PressableScale>
    </Field>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
  },
  value: {
    justifyContent: 'center',
  },
  icon: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
});
