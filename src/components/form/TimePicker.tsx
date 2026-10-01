import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';

import { TextField } from './TextField';
import { formatClockTime, from12h, parseTimeInput, QUICK_MINUTES, to12h, type ClockTime, type Meridiem } from './time';

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  role?: 'radio' | 'button';
};

function GridChip({ label, selected, onPress, accessibilityLabel, role = 'radio' }: ChipProps) {
  const { colors, isDark } = useTheme();
  return (
    <PressableScale
      haptic={false}
      pressedScale={0.94}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={role === 'radio' ? { checked: selected } : { expanded: selected }}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.gold, borderColor: colors.gold }
          : { backgroundColor: colors.bg2, borderColor: colors.line },
      ]}
    >
      <Text
        variant="bodyStrong"
        tabular
        numberOfLines={1}
        style={{ color: selected ? (isDark ? colors.bg : colors.surface) : colors.ink }}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export type TimePickerProps = {
  /** Toronto wall-clock time, 24 hour. */
  value: ClockTime;
  onChange: (next: ClockTime) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * One-thumb time picker: AM/PM, a 12-hour grid and quarter-hour minutes, all
 * one tap each with no scrolling. Any other minute is typed in "Other time"
 * ("2:41 PM", "14:41").
 */
export function TimePicker({ value, onChange, style }: TimePickerProps) {
  const { hour12, meridiem } = to12h(value.hour);
  const quick = (QUICK_MINUTES as readonly number[]).includes(value.minute);
  const [otherOpen, setOtherOpen] = useState(!quick);
  const [otherText, setOtherText] = useState(quick ? '' : formatClockTime(value));
  const [otherError, setOtherError] = useState<string | null>(null);

  const setMeridiem = (next: Meridiem) => onChange({ hour: from12h(hour12, next), minute: value.minute });

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.sectionHead}>
        <Text variant="eyebrow" style={styles.flex}>
          Time
        </Text>
        <View style={styles.meridiem} accessibilityRole="radiogroup" accessibilityLabel="AM or PM">
          {(['am', 'pm'] as const).map((m) => (
            <GridChip
              key={m}
              label={m === 'am' ? 'AM' : 'PM'}
              selected={meridiem === m}
              onPress={() => setMeridiem(m)}
              accessibilityLabel={m === 'am' ? 'AM' : 'PM'}
            />
          ))}
        </View>
      </View>

      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Hour">
        {[HOURS.slice(0, 6), HOURS.slice(6)].map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((h) => (
              <GridChip
                key={h}
                label={String(h)}
                selected={h === hour12}
                onPress={() => onChange({ hour: from12h(h, meridiem), minute: value.minute })}
                accessibilityLabel={`${h} ${meridiem === 'am' ? 'AM' : 'PM'}`}
              />
            ))}
          </View>
        ))}
      </View>

      <Text variant="eyebrow">Minute</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Minute">
        {QUICK_MINUTES.map((m) => (
          <GridChip
            key={m}
            label={`:${String(m).padStart(2, '0')}`}
            selected={!otherOpen && value.minute === m}
            onPress={() => {
              setOtherOpen(false);
              setOtherError(null);
              onChange({ hour: value.hour, minute: m });
            }}
            accessibilityLabel={m === 0 ? 'On the hour' : `${m} past`}
          />
        ))}
        <GridChip
          label={!quick ? `:${String(value.minute).padStart(2, '0')}` : 'Other'}
          selected={otherOpen}
          role="button"
          onPress={() => {
            setOtherOpen(true);
            if (!otherText) setOtherText(formatClockTime(value));
          }}
          accessibilityLabel="Other time"
        />
      </View>

      {otherOpen ? (
        <TextField
          label="Other time"
          placeholder="e.g. 2:41 PM"
          value={otherText}
          autoFocus={quick}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          returnKeyType="done"
          error={otherError}
          onChangeText={(text) => {
            setOtherText(text);
            const parsed = parseTimeInput(text, meridiem);
            if (parsed) {
              setOtherError(null);
              onChange(parsed);
            }
          }}
          onBlur={() => {
            if (otherText.trim() && !parseTimeInput(otherText, meridiem)) setOtherError('Use a time like 2:41 PM.');
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space[3],
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  flex: {
    flex: 1,
  },
  meridiem: {
    flexDirection: 'row',
    gap: space[2],
    width: 136,
  },
  grid: {
    gap: space[2],
  },
  row: {
    flexDirection: 'row',
    gap: space[2],
  },
  chip: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.input,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
});
