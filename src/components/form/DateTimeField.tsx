import { CalendarClock, Globe } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { todayToronto, torontoDateOf } from '@/lib/dates';

import { ActionButton } from './ActionButton';
import { Calendar } from './Calendar';
import { clampDate } from './calendarMath';
import {
  combineToInstant,
  dateTimeRangeError,
  formatFieldDateTime,
  nextQuarterHour,
  splitInstant,
  type DateTimeDraft,
} from './dateTime';
import { FieldTrigger } from './FieldTrigger';
import type { FieldFill } from './InputChrome';
import type { ClockTime } from './time';
import { TimePicker } from './TimePicker';

export { dateTimeRangeError } from './dateTime';

export type DateTimeFieldProps = {
  label: string;
  /** An ISO UTC instant, or null when not set. */
  value: string | null;
  /** Called with the ISO instant for the Toronto date and time picked (or null after "Clear"). */
  onChange: (instant: string | null) => void;
  /** Earliest and latest allowed instants (inclusive). For "in the future" pass the current instant. */
  min?: string | null;
  max?: string | null;
  /** Adds "Clear" to the sheet while a value is set. */
  optional?: boolean;
  /** Toronto time the picker starts on when there is no value (default 9:00 AM). */
  defaultTime?: ClockTime;
  /** Shown when nothing is set ("Not booked"). */
  placeholder?: string;
  help?: string | null;
  error?: string | null;
  /** The message when the value is outside min/max. Defaults to "Pick a time after ..."; null shows nothing. */
  rangeError?: string | null;
  disabled?: boolean;
  sheetTitle?: string;
  fill?: FieldFill;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

const NINE_AM: ClockTime = { hour: 9, minute: 0 };

/** The note every date and time carries: the phone may be in another zone. */
const TORONTO_NOTE = 'Toronto time';

/**
 * A date and time field (kickoff call, a scheduled send). The sheet has the
 * month calendar and a one-thumb time picker; "Done" sends the ISO instant for
 * that Toronto wall time, computed in America/Toronto whatever zone the phone
 * is in. Dismissing the sheet keeps the old value.
 *
 *   <DateTimeField label="Kickoff" value={kickoffAt} onChange={setKickoffAt} optional placeholder="Not booked" />
 */
export function DateTimeField({
  label,
  value,
  onChange,
  min,
  max,
  optional = false,
  defaultTime = NINE_AM,
  placeholder,
  help,
  error,
  rangeError,
  disabled,
  sheetTitle,
  fill,
  containerStyle,
  testID,
}: DateTimeFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateTimeDraft | null>(null);

  const minDate = min ? torontoDateOf(min) : null;
  const maxDate = max ? torontoDateOf(max) : null;

  const start = () => {
    let initial = splitInstant(value);
    if (!initial) {
      initial = { date: clampDate(todayToronto(), minDate, maxDate), time: defaultTime };
      // "In the future" fields: 9:00 AM today may already be gone, so start on the next quarter hour instead.
      const guess = combineToInstant(initial.date, initial.time);
      if (min && guess && dateTimeRangeError(guess, min, max)) initial = nextQuarterHour(min);
    }
    setDraft(initial);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const instant = draft ? combineToInstant(draft.date, draft.time) : null;
  const draftError = dateTimeRangeError(instant, min, max);

  const outOfRange = dateTimeRangeError(value, min, max);
  const shownError = error ?? (outOfRange ? (rangeError === undefined ? outOfRange : rangeError) : null);

  const footer = (
    <View style={styles.footer}>
      {optional && value ? (
        <ActionButton
          label="Clear"
          variant="secondary"
          onPress={() => {
            onChange(null);
            close();
          }}
        />
      ) : null}
      <ActionButton
        label="Done"
        disabled={!instant || !!draftError}
        onPress={() => {
          if (!instant || draftError) return;
          onChange(instant);
          close();
        }}
      />
    </View>
  );

  return (
    <>
      <FieldTrigger
        label={label}
        valueText={value && splitInstant(value) ? formatFieldDateTime(value) : null}
        placeholder={placeholder}
        icon={CalendarClock}
        open={open}
        onPress={start}
        help={[help, TORONTO_NOTE].filter(Boolean).join(' · ')}
        error={shownError}
        disabled={disabled}
        fill={fill}
        accessibilityHint="Opens a calendar and a time picker. Times are Toronto time."
        containerStyle={containerStyle}
        testID={testID}
      />
      <Sheet visible={open} onClose={close} title={sheetTitle ?? label} snapPoints="content" scrollable footer={footer}>
        {draft ? (
          <View style={styles.body}>
            <Calendar
              value={draft.date}
              min={minDate}
              max={maxDate}
              onSelect={(date) => setDraft({ date, time: draft.time })}
            />
            <TimePicker value={draft.time} onChange={(time) => setDraft({ date: draft.date, time })} />
            <View
              style={[styles.summary, { backgroundColor: colors.bg2, borderColor: draftError ? colors.signal : colors.line }]}
              accessibilityLiveRegion="polite"
            >
              <Icon icon={Globe} size={16} color={draftError ? 'signal' : 'ink3'} />
              <View style={styles.summaryText}>
                {instant ? (
                  <Text variant="bodyStrong" tabular>
                    {formatFieldDateTime(instant)}
                  </Text>
                ) : null}
                <Text variant="small" color={draftError ? 'signal' : 'ink3'}>
                  {draftError ?? `${TORONTO_NOTE}, whatever zone this phone is in.`}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space[5],
    paddingTop: space[1],
    paddingBottom: space[2],
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: space[4] - 2,
    paddingVertical: space[3],
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: space[3],
  },
});
