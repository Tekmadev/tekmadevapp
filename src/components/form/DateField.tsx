import { Calendar as CalendarIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Sheet } from '@/components/sheet/Sheet';
import { space } from '@/design/tokens';

import { ActionButton } from './ActionButton';
import { Calendar } from './Calendar';
import { dateRangeError, formatFieldDate } from './calendarMath';
import { FieldTrigger } from './FieldTrigger';
import type { FieldFill } from './InputChrome';

export { dateRangeError } from './calendarMath';

export type DateFieldProps = {
  label: string;
  /** A Toronto calendar date, `YYYY-MM-DD`, or null when not set. Sent to the API as is. */
  value: string | null;
  onChange: (date: string | null) => void;
  /** Earliest and latest selectable dates (inclusive), `YYYY-MM-DD`. For "in the future" pass tomorrow. */
  min?: string | null;
  max?: string | null;
  /** Adds "Clear" to the sheet while a date is set. */
  optional?: boolean;
  /** Shown when no date is set ("No expiry"). */
  placeholder?: string;
  help?: string | null;
  error?: string | null;
  /**
   * The message when the value is outside min/max (e.g. an old expiry loaded
   * from the server). Defaults to "Pick a date on or after Oct 2, 2026."; pass
   * null to show nothing.
   */
  rangeError?: string | null;
  disabled?: boolean;
  /** Sheet title (defaults to the label). */
  sheetTitle?: string;
  fill?: FieldFill;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A date-only field (target go-live, coupon expiry, task due date). Opens a
 * sheet with the month calendar; tapping a day picks it and closes the sheet.
 * Works on calendar dates only, so the phone's time zone can never move the day.
 *
 *   <DateField label="Expires" value={expires} onChange={setExpires} min={addDays(todayToronto(), 1)}
 *     optional placeholder="No expiry" rangeError="The expiry date must be in the future." />
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  optional = false,
  placeholder,
  help,
  error,
  rangeError,
  disabled,
  sheetTitle,
  fill,
  containerStyle,
  testID,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);

  const outOfRange = dateRangeError(value, min, max);
  const shownError = error ?? (outOfRange ? (rangeError === undefined ? outOfRange : rangeError) : null);

  const footer =
    optional && value ? (
      <View style={styles.footer}>
        <ActionButton
          label="Clear"
          variant="secondary"
          onPress={() => {
            onChange(null);
            setOpen(false);
          }}
        />
      </View>
    ) : undefined;

  return (
    <>
      <FieldTrigger
        label={label}
        valueText={value ? formatFieldDate(value) : null}
        placeholder={placeholder}
        icon={CalendarIcon}
        open={open}
        onPress={() => setOpen(true)}
        help={help}
        error={shownError}
        disabled={disabled}
        fill={fill}
        accessibilityHint="Opens a calendar"
        containerStyle={containerStyle}
        testID={testID}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title={sheetTitle ?? label} snapPoints="content" footer={footer}>
        <Calendar
          value={value}
          min={min}
          max={max}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          style={styles.calendar}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  calendar: {
    paddingTop: space[1],
    paddingBottom: space[2],
  },
  footer: {
    flexDirection: 'row',
  },
});
