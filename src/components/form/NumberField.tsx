import { forwardRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { BaseInput, type BaseInputProps } from './BaseInput';
import {
  numberRangeError,
  numberToInput,
  parseNumberInput,
  sanitizeIntegerInput,
  sanitizeMoneyInput,
  type NumberMode,
} from './numberInput';

export { numberRangeError } from './numberInput';
export type { NumberMode, RangeRule } from './numberInput';

export type NumberFieldProps = Omit<
  BaseInputProps,
  'value' | 'defaultValue' | 'onChange' | 'onChangeText' | 'keyboardType' | 'inputMode' | 'maxLength' | 'softLimit' | 'showCount'
> & {
  /** 'integer' (default) or 'money' (dollars typed, cents stored). */
  mode?: NumberMode;
  /** Whole number, or integer cents in money mode. null when empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Range in the same units as value (cents in money mode). */
  min?: number;
  max?: number;
  /** Empty shows "Enter a number." / "Enter an amount." after leaving the field. */
  required?: boolean;
  /**
   * Show the range error by itself (default true): over the max as soon as it
   * is typed, under the min or empty-but-required once the field loses focus.
   * An `error` prop always wins.
   */
  validate?: boolean;
  /** Integer mode only: accept a leading minus. */
  allowNegative?: boolean;
};

/**
 * Number input. Money mode shows a "$" prefix, accepts dollars with up to 2
 * decimals and reports integer cents: "77.5" is 7750 and shows as "77.50" once
 * the field loses focus; nothing is ever rounded.
 *
 *   <NumberField label="Percent" suffix="%" value={pct} onChange={setPct} min={1} max={100} />
 *   <NumberField label="Amount" mode="money" value={cents} onChange={setCents} min={100} />
 */
export const NumberField = forwardRef<TextInput, NumberFieldProps>(function NumberField(
  { mode = 'integer', value, onChange, min, max, required = false, validate = true, allowNegative = false, prefix, error, onBlur, ...rest },
  ref,
) {
  const money = mode === 'money';
  const [text, setText] = useState(() => numberToInput(value, mode));
  const [seenValue, setSeenValue] = useState(value);
  const [touched, setTouched] = useState(false);

  // A new value from outside (reset, server data) replaces the text, unless the
  // text already means that value (then the user is mid-typing "77." or "77.5").
  if (value !== seenValue) {
    setSeenValue(value);
    if (parseNumberInput(text, mode) !== value) setText(numberToInput(value, mode));
  }

  const change = (raw: string) => {
    const clean = money ? sanitizeMoneyInput(raw) : sanitizeIntegerInput(raw, allowNegative);
    setText(clean);
    const next = parseNumberInput(clean, mode);
    if (next !== value) onChange(next);
  };

  const rangeError = validate ? numberRangeError(value, { mode, min, max, required }) : null;
  const overMax = value != null && max != null && value > max;
  const shownError = error ?? (rangeError && (touched || overMax) ? rangeError : null);

  return (
    <BaseInput
      ref={ref}
      {...rest}
      value={text}
      onChangeText={change}
      onBlur={(e) => {
        setTouched(true);
        // Settle the text into its canonical form: "77.5" becomes "77.50", "." becomes empty.
        setText(numberToInput(parseNumberInput(text, mode), mode));
        onBlur?.(e);
      }}
      error={shownError}
      prefix={prefix ?? (money ? '$' : undefined)}
      keyboardType={money ? 'decimal-pad' : allowNegative ? 'numbers-and-punctuation' : 'number-pad'}
      autoCorrect={false}
      spellCheck={false}
      showCount={false}
    />
  );
});
