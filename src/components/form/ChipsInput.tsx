import { X } from 'lucide-react-native';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputKeyPressEvent,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space, withAlpha } from '@/design/tokens';
import { MAX_FONT_SCALE, type } from '@/design/typography';

import { addChips, removeChip, splitChipText } from './chips';
import { Field } from './Field';
import { FieldBox, FloatingLabel, useFloatProgress, useInputMetrics, type FieldFill } from './InputChrome';

export { addChips, removeChip, splitChipText } from './chips';

export type ChipsInputProps = {
  label: string;
  value: readonly string[];
  onChange: (chips: string[]) => void;
  /** The list stops growing here; the count shows "3/10". */
  maxItems?: number;
  /** Longest single chip; longer text is cut. */
  maxLength?: number;
  /** Shape each chip before it is added (e.g. lowercase keywords). */
  normalize?: (raw: string) => string;
  /** What one chip is ("keyword"), for messages and TalkBack. Default "item". */
  noun?: string;
  /** Plural of noun (default noun + "s"). */
  nounPlural?: string;
  /** Shown in the empty input once the label floats. Default "Type, then comma or enter". */
  placeholder?: string;
  help?: string | null;
  error?: string | null;
  disabled?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  fill?: FieldFill;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A list of short strings (keywords, tags). A comma or enter turns the typed
 * text into a chip (pasting "a, b, c" adds three), the x removes one, and
 * backspace in the empty input marks the last chip, then removes it on a second
 * press. Duplicates (any case) are ignored with a short note. The ref is the
 * TextInput.
 *
 *   <ChipsInput label="Keywords" value={keywords} onChange={setKeywords} noun="keyword" maxItems={10} />
 */
export const ChipsInput = forwardRef<TextInput, ChipsInputProps>(function ChipsInput(
  {
    label,
    value,
    onChange,
    maxItems,
    maxLength,
    normalize,
    noun = 'item',
    nounPlural,
    placeholder = 'Type, then comma or enter',
    help,
    error,
    disabled = false,
    autoCapitalize = 'none',
    fill,
    containerStyle,
    testID,
  },
  ref,
) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput, []);

  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  // The last chip, marked by a first backspace in the empty input.
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const plural = nounPlural ?? `${noun}s`;
  const metrics = useInputMetrics(true);
  const floated = focused || value.length > 0 || text.length > 0;
  const progress = useFloatProgress(floated);
  const full = maxItems != null && value.length >= maxItems;
  // One row of chips (or the empty input) sets the box height; the resting label centres in it.
  const rowHeight = Math.max(CHIP_H, Math.ceil(metrics.lineHeight + 6));
  const boxHeight = metrics.padTop + rowHeight + metrics.padBottom;

  const add = (incoming: string[]) => {
    if (incoming.length === 0) return;
    const result = addChips(value, incoming, { maxItems, maxLength, normalize });
    if (result.chips.length !== value.length) {
      haptics.selection();
      onChange(result.chips);
    }
    if (result.overflow.length > 0) setNote(`Up to ${maxItems} ${plural}.`);
    else if (result.duplicates.length > 0) setNote(`Already added: ${result.duplicates.join(', ')}.`);
    else setNote(null);
  };

  const changeText = (next: string) => {
    setArmed(false);
    const { complete, rest } = splitChipText(next);
    if (complete.length > 0) add(complete);
    else if (note) setNote(null);
    setText(rest);
  };

  const commitText = () => {
    const chip = text.trim();
    if (chip) add([chip]);
    setText('');
  };

  const remove = (index: number) => {
    haptics.selection();
    setArmed(false);
    setNote(null);
    onChange(removeChip(value, index));
  };

  const onKeyPress = (e: TextInputKeyPressEvent) => {
    if (e.nativeEvent.key !== 'Backspace' || text.length > 0 || value.length === 0) return;
    if (armed) remove(value.length - 1);
    else {
      haptics.selection();
      setArmed(true);
    }
  };

  const count = maxItems != null ? { length: value.length, limit: maxItems, noun: plural } : undefined;

  return (
    <Field help={note ?? help} error={error} count={count} disabled={disabled} style={containerStyle}>
      <PressableScale
        accessible={false}
        pressedScale={1}
        haptic={false}
        disabled={disabled}
        onPress={() => input.current?.focus()}
        testID={testID}
      >
        <FieldBox focused={focused} error={!!error} fill={fill} minHeight={boxHeight}>
          <View style={styles.column}>
            <FloatingLabel
              label={label}
              progress={progress}
              restTop={(boxHeight - metrics.lineHeight) / 2 - 1}
              active={focused}
              error={!!error}
            />
            <View style={[styles.wrap, { paddingTop: metrics.padTop, paddingBottom: metrics.padBottom }]}>
              {value.map((chip, i) => {
                const marked = armed && i === value.length - 1;
                return (
                  <View
                    key={`${chip}-${i}`}
                    style={[
                      styles.chip,
                      marked
                        ? { backgroundColor: withAlpha(colors.gold, 0.15), borderColor: colors.gold }
                        : { backgroundColor: colors.bg3, borderColor: colors.line },
                    ]}
                  >
                    <Text variant="label" color="ink2" numberOfLines={1} style={styles.chipText}>
                      {chip}
                    </Text>
                    {!disabled ? (
                      <PressableScale
                        haptic={false}
                        pressedScale={0.85}
                        hitSlop={{ top: 10, bottom: 10, left: 4, right: 8 }}
                        onPress={() => remove(i)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${noun} ${chip}`}
                        style={styles.remove}
                      >
                        <Icon icon={X} size={14} color={marked ? 'gold' : 'ink3'} strokeWidth={2.25} />
                      </PressableScale>
                    ) : null}
                  </View>
                );
              })}
              <TextInput
                ref={input}
                value={text}
                onChangeText={changeText}
                onKeyPress={onKeyPress}
                onSubmitEditing={commitText}
                submitBehavior="submit"
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  setArmed(false);
                  // A word left in the box when leaving is kept, as if enter was pressed.
                  commitText();
                }}
                editable={!disabled}
                placeholder={floated ? (full ? `Up to ${maxItems} ${plural}` : placeholder) : undefined}
                placeholderTextColor={colors.ink4}
                cursorColor={colors.gold}
                selectionHandleColor={colors.gold}
                selectionColor={withAlpha(colors.gold, 0.3)}
                underlineColorAndroid="transparent"
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                autoCapitalize={autoCapitalize}
                autoCorrect={false}
                returnKeyType="done"
                accessibilityLabel={value.length > 0 ? `${label}, ${value.length} ${value.length === 1 ? noun : plural}` : label}
                accessibilityHint={error ?? 'Type, then a comma or enter to add.'}
                accessibilityState={{ disabled }}
                style={[styles.input, { color: colors.ink, height: rowHeight }]}
              />
            </View>
          </View>
        </FieldBox>
      </PressableScale>
    </Field>
  );
});

const CHIP_H = 32;

const styles = StyleSheet.create({
  column: {
    flex: 1,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[2] - 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: CHIP_H,
    maxWidth: '100%',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingLeft: space[3],
    paddingRight: 2,
  },
  chipText: {
    flexShrink: 1,
  },
  remove: {
    width: 28,
    height: 28,
    marginLeft: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flexGrow: 1,
    minWidth: 120,
    margin: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontFamily: type.body.fontFamily,
    fontWeight: type.body.fontWeight,
    fontSize: type.body.fontSize,
    includeFontPadding: false,
  },
});
