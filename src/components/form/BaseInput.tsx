import { CircleX } from 'lucide-react-native';
import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { caretColors } from '@/design/caret';
import { faceOf, fontFace, MAX_FONT_SCALE, type } from '@/design/typography';

import { Field } from './Field';
import {
  ADORNMENT_GAP,
  FieldBox,
  FieldIconButton,
  FloatingLabel,
  useFloatProgress,
  useInputMetrics,
  type FieldFill,
} from './InputChrome';

export type BaseInputProps = Omit<
  TextInputProps,
  'style' | 'editable' | 'placeholderTextColor' | 'multiline' | 'numberOfLines' | 'children'
> & {
  /** Floating label; also the accessible name of the input. */
  label?: string;
  help?: string | null;
  error?: string | null;
  disabled?: boolean;
  /** Fixed text before the value, shown once the label floats ("tekmadev.com/", "$"). */
  prefix?: string;
  /** Fixed text after the value ("%", "days"). */
  suffix?: string;
  /** Always-visible element at the start of the box (an icon). */
  leading?: ReactNode;
  /** Always-visible element at the end of the box (an icon button). */
  trailing?: ReactNode;
  /** Show a clear button while the field has text. */
  clearable?: boolean;
  /**
   * A limit the text should stay under ("aim for 60 or fewer"). Typing past it
   * is allowed; the count turns signal. Use maxLength for a hard limit.
   */
  softLimit?: number;
  /** Show "42/60". Defaults to on when softLimit or maxLength is set. */
  showCount?: boolean;
  /** Box fill: bg2 (default) works on screens and on sheets. */
  fill?: FieldFill;
  /** Monospace value (codes, slugs, ids). */
  monospace?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  /** Called after the clear button empties the field (onChangeText('') is called first). */
  onClear?: () => void;
};

type InternalProps = BaseInputProps & {
  multiline?: boolean;
  minLines?: number;
  maxLines?: number;
};

/**
 * The input behind TextField, TextArea, NumberField and PasswordField: floating
 * label, 14dp box, gold focus border, adornments, clear button, count and error.
 */
export const BaseInput = forwardRef<TextInput, InternalProps>(function BaseInput(
  {
    label,
    help,
    error,
    disabled = false,
    prefix,
    suffix,
    leading,
    trailing,
    clearable = false,
    softLimit,
    showCount,
    fill,
    monospace = false,
    containerStyle,
    inputStyle,
    onClear,
    multiline = false,
    minLines = 3,
    maxLines = 8,
    value,
    defaultValue,
    onChangeText,
    onFocus,
    onBlur,
    maxLength,
    placeholder,
    readOnly,
    accessibilityLabel,
    accessibilityHint,
    ...rest
  },
  ref,
) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput, []);

  const [focused, setFocused] = useState(false);
  const [ownText, setOwnText] = useState(defaultValue ?? '');
  const text = value ?? ownText;

  const hasLabel = !!label;
  const metrics = useInputMetrics(hasLabel);
  const floated = focused || text.length > 0;
  const progress = useFloatProgress(floated);
  const editable = !disabled && !readOnly;
  const hasError = !!error;

  // Prefix and suffix appear with the value, never under a resting label.
  const adornment = useAnimatedStyle(() => ({ opacity: hasLabel ? progress.get() : 1 }));

  const change = (next: string) => {
    if (value === undefined) setOwnText(next);
    onChangeText?.(next);
  };

  const clear = () => {
    change('');
    onClear?.();
    input.current?.focus();
  };

  const limit = softLimit ?? maxLength;
  const count = limit != null && (showCount ?? true) ? { length: text.length, limit } : undefined;

  const lineBox = {
    paddingTop: metrics.padTop,
    paddingBottom: metrics.padBottom,
  };
  const inputSize: TextStyle = multiline
    ? {
        minHeight: metrics.padTop + metrics.padBottom + metrics.lineHeight * minLines,
        maxHeight: metrics.padTop + metrics.padBottom + metrics.lineHeight * maxLines,
      }
    : { minHeight: metrics.minHeight - 2 };
  // Positions inside the 1px border.
  const restTop = multiline ? metrics.padTop : metrics.restTop - 1;
  const sideAlign: ViewStyle = multiline ? { justifyContent: 'flex-start', paddingTop: metrics.padTop - 13 } : {};
  // Prefix and suffix share the value's text line: centred on it, or on the first line of a text area.
  const adornmentAlign: ViewStyle = multiline
    ? { justifyContent: 'flex-start', paddingTop: metrics.padTop }
    : { justifyContent: 'center', paddingTop: metrics.padTop - metrics.padBottom };

  return (
    <Field help={help} error={error} count={count} disabled={disabled} style={containerStyle}>
      <PressableScale
        accessible={false}
        pressedScale={1}
        haptic={false}
        disabled={!editable}
        onPress={() => input.current?.focus()}
      >
        <FieldBox focused={focused} error={hasError} fill={fill} minHeight={multiline ? undefined : metrics.minHeight}>
          {leading ? <View style={[styles.side, styles.leading, sideAlign]}>{leading}</View> : null}
          <View style={styles.column}>
            {label ? (
              <FloatingLabel label={label} progress={progress} restTop={restTop} active={focused} error={hasError} />
            ) : null}
            <View style={styles.valueRow}>
              {prefix ? (
                <Animated.View style={[styles.adornment, adornmentAlign, adornment]}>
                  <Text variant="body" color="ink3" family={monospace ? 'mono' : undefined}>
                    {prefix}
                  </Text>
                </Animated.View>
              ) : null}
              <TextInput
                ref={input}
                value={value}
                defaultValue={value === undefined ? defaultValue : undefined}
                onChangeText={change}
                onFocus={(e) => {
                  setFocused(true);
                  onFocus?.(e);
                }}
                onBlur={(e) => {
                  setFocused(false);
                  onBlur?.(e);
                }}
                editable={editable}
                readOnly={readOnly}
                multiline={multiline}
                maxLength={maxLength}
                placeholder={!hasLabel || floated ? placeholder : undefined}
                placeholderTextColor={colors.ink4}
                {...caretColors(colors.gold)}
                underlineColorAndroid="transparent"
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                textAlignVertical={multiline ? 'top' : 'center'}
                accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
                accessibilityHint={error ?? accessibilityHint ?? help ?? undefined}
                accessibilityState={{ disabled: !editable }}
                style={[
                  styles.input,
                  multiline ? styles.multiline : null,
                  lineBox,
                  inputSize,
                  { color: colors.ink },
                  monospace ? styles.mono : null,
                  inputStyle,
                ]}
                {...rest}
              />
              {suffix ? (
                <Animated.View style={[styles.adornment, styles.suffix, adornmentAlign, adornment]}>
                  <Text variant="body" color="ink3">
                    {suffix}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
          </View>
          {clearable && editable && text.length > 0 ? (
            <View style={[styles.side, styles.trailing, sideAlign]}>
              <FieldIconButton
                icon={CircleX}
                size={18}
                color="ink4"
                onPress={clear}
                accessibilityLabel={label ? `Clear ${label}` : 'Clear'}
              />
            </View>
          ) : null}
          {trailing ? <View style={[styles.side, styles.trailing, sideAlign]}>{trailing}</View> : null}
        </FieldBox>
      </PressableScale>
    </Field>
  );
});

const styles = StyleSheet.create({
  column: {
    flex: 1,
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  input: {
    flex: 1,
    margin: 0,
    paddingHorizontal: 0,
    ...faceOf('body'),
    fontSize: type.body.fontSize,
    includeFontPadding: false,
  },
  // No line height on a single line: on Android it pushes the cursor off centre.
  multiline: {
    lineHeight: type.body.lineHeight,
  },
  // Geist Mono at the body weight (400).
  mono: fontFace('mono'),
  adornment: {
    pointerEvents: 'none',
  },
  suffix: {
    paddingLeft: 6,
  },
  side: {
    justifyContent: 'center',
  },
  leading: {
    marginRight: ADORNMENT_GAP,
  },
  trailing: {
    // The 48dp button keeps its touch target but sits visually at the box edge.
    marginRight: -10,
    marginLeft: 2,
  },
});
