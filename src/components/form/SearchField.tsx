import { Search, X } from 'lucide-react-native';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { caretColors } from '@/design/caret';
import { useTheme } from '@/design/theme';
import { layout, radius } from '@/design/tokens';
import { faceOf, MAX_FONT_SCALE, type } from '@/design/typography';

import { FieldBox, FieldIconButton, type FieldFill } from './InputChrome';

export type SearchFieldProps = Omit<
  TextInputProps,
  'style' | 'value' | 'defaultValue' | 'onChangeText' | 'placeholderTextColor' | 'multiline' | 'editable'
> & {
  value?: string;
  defaultValue?: string;
  /** Every keystroke. */
  onChangeText?: (text: string) => void;
  /** After typing pauses for debounceMs; immediately on clear and on submit. */
  onChangeDebounced?: (text: string) => void;
  debounceMs?: number;
  /** Default "Search". */
  placeholder?: string;
  disabled?: boolean;
  fill?: FieldFill;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Pill search input with a Search icon, a clear button and a debounced callback. The ref is the TextInput. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  {
    value,
    defaultValue,
    onChangeText,
    onChangeDebounced,
    debounceMs = 250,
    placeholder = 'Search',
    disabled = false,
    fill,
    containerStyle,
    onFocus,
    onBlur,
    onSubmitEditing,
    accessibilityLabel,
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // A pending callback must not fire after the field is gone.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const emit = (next: string, immediate: boolean) => {
    if (value === undefined) setOwnText(next);
    onChangeText?.(next);
    if (!onChangeDebounced) return;
    cancelPending();
    if (immediate) onChangeDebounced(next);
    else timer.current = setTimeout(() => onChangeDebounced(next), debounceMs);
  };

  return (
    <View style={[disabled ? styles.disabled : null, containerStyle]}>
      <PressableScale
        accessible={false}
        pressedScale={1}
        haptic={false}
        disabled={disabled}
        onPress={() => input.current?.focus()}
      >
        <FieldBox focused={focused} error={false} fill={fill} minHeight={layout.minTouch} style={styles.pill}>
          <View style={styles.icon}>
            <Icon icon={Search} size={18} color={focused ? 'ink2' : 'ink3'} />
          </View>
          <TextInput
            ref={input}
            value={text}
            onChangeText={(t) => emit(t, false)}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            onSubmitEditing={(e) => {
              if (onChangeDebounced) {
                cancelPending();
                onChangeDebounced(text);
              }
              onSubmitEditing?.(e);
            }}
            editable={!disabled}
            placeholder={placeholder}
            placeholderTextColor={colors.ink4}
            {...caretColors(colors.gold)}
            underlineColorAndroid="transparent"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityRole="search"
            accessibilityLabel={accessibilityLabel ?? placeholder}
            style={[styles.input, { color: colors.ink }]}
            {...rest}
          />
          {text.length > 0 && !disabled ? (
            <FieldIconButton
              icon={X}
              size={18}
              color="ink3"
              onPress={() => {
                emit('', true);
                input.current?.focus();
              }}
              accessibilityLabel="Clear search"
              style={styles.clear}
            />
          ) : null}
        </FieldBox>
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
  pill: {
    borderRadius: radius.pill,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    margin: 0,
    paddingHorizontal: 0,
    paddingVertical: 12,
    ...faceOf('body'),
    fontSize: type.body.fontSize,
    includeFontPadding: false,
  },
  clear: {
    marginRight: -12,
  },
});
