import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { durations, fade, springs } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { todayToronto } from '@/lib/dates';

import {
  canShowMonth,
  clampDate,
  formatMonthTitle,
  formatSpokenDate,
  isDateInRange,
  monthGrid,
  monthOf,
  shiftMonth,
  weekdayInitials,
  type YearMonth,
} from './calendarMath';
import { FieldIconButton } from './InputChrome';

export type CalendarProps = {
  /** The selected Toronto calendar date, `YYYY-MM-DD`. */
  value: string | null;
  onSelect: (date: string) => void;
  /** Earliest and latest selectable dates (inclusive), `YYYY-MM-DD`. */
  min?: string | null;
  max?: string | null;
  /** Today's Toronto date (tests pass a fixed one). */
  today?: string;
  style?: StyleProp<ViewStyle>;
};

/** How far a swipe must travel (or how fast) to change the month. */
const SWIPE_DISTANCE = 48;
const SWIPE_VELOCITY = 600;
/** New month content slides in from this far on the side it came from. */
const ENTER_SHIFT = 28;
/** Built here, not inside the worklet: `fade` is a plain function and cannot run on the UI thread. */
const ENTER_FADE = fade(durations.fast);

function enterFrom(direction: number): EntryExitAnimationFunction {
  const dx = direction * ENTER_SHIFT;
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateX: dx }] },
      animations: {
        opacity: withTiming(1, ENTER_FADE),
        transform: [{ translateX: withSpring(0, springs.snappy) }],
      },
    };
  };
}

/**
 * Month calendar, Sunday first (en-CA): chevrons and a horizontal swipe change
 * the month, today has a gold ring, the selected day is filled gold, days
 * outside min/max are dimmed and cannot be chosen. Pure calendar-date math, so
 * the phone's time zone never moves a day.
 */
export function Calendar({ value, onSelect, min, max, today: todayProp, style }: CalendarProps) {
  const { colors, tones, isDark } = useTheme();
  const [today] = useState(() => todayProp ?? todayToronto());
  const [month, setMonth] = useState<YearMonth>(() => monthOf(clampDate(value ?? today, min, max)));
  const [direction, setDirection] = useState(0);

  const canPrev = canShowMonth(shiftMonth(month, -1), min, max);
  const canNext = canShowMonth(shiftMonth(month, 1), min, max);

  const go = (delta: number) => {
    const next = shiftMonth(month, delta);
    if (!canShowMonth(next, min, max)) return;
    haptics.selection();
    setDirection(delta);
    setMonth(next);
  };

  // Follows the finger with some resistance (more when there is no month that way).
  const drag = useSharedValue(0);
  const swipe = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      'worklet';
      const t = e.translationX;
      const blocked = (t < 0 && !canNext) || (t > 0 && !canPrev);
      drag.set(t * (blocked ? 0.12 : 0.35));
    })
    .onEnd((e) => {
      'worklet';
      const t = e.translationX;
      const v = e.velocityX;
      if (t < -SWIPE_DISTANCE || v < -SWIPE_VELOCITY) scheduleOnRN(go, 1);
      else if (t > SWIPE_DISTANCE || v > SWIPE_VELOCITY) scheduleOnRN(go, -1);
    })
    .onFinalize(() => {
      'worklet';
      drag.set(withSpring(0, springs.snappy));
    });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drag.get() }] }));

  const cells = monthGrid(month);
  const rows = [0, 1, 2, 3, 4, 5].map((r) => cells.slice(r * 7, r * 7 + 7));
  const onGold = isDark ? colors.bg : colors.surface;
  const monthKey = `${month.year}-${month.month}`;

  return (
    <View style={style}>
      <View style={styles.header}>
        <Text variant="title" style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">
          {formatMonthTitle(month)}
        </Text>
        <FieldIconButton icon={ChevronLeft} color="ink2" onPress={() => go(-1)} disabled={!canPrev} accessibilityLabel="Previous month" />
        <FieldIconButton icon={ChevronRight} color="ink2" onPress={() => go(1)} disabled={!canNext} accessibilityLabel="Next month" />
      </View>

      <View style={styles.weekdays} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {weekdayInitials().map((d) => (
          <View key={d.name} style={styles.weekday}>
            <Text variant="caption" color="ink4">
              {d.short}
            </Text>
          </View>
        ))}
      </View>

      <GestureDetector gesture={swipe}>
        <Animated.View style={dragStyle}>
          <Animated.View key={monthKey} entering={direction === 0 ? undefined : enterFrom(direction)}>
            {rows.map((row, r) => (
              <View key={r} style={styles.week}>
                {row.map((date, c) => {
                  if (!date) return <View key={c} style={styles.cell} />;
                  const enabled = isDateInRange(date, min, max);
                  const selected = date === value;
                  const isToday = date === today;
                  const textColor = selected ? onGold : !enabled ? colors.ink5 : isToday ? tones.gold.text : colors.ink;
                  return (
                    <PressableScale
                      key={date}
                      haptic={false}
                      pressedScale={0.9}
                      disabled={!enabled}
                      onPress={() => {
                        haptics.selection();
                        onSelect(date);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={isToday ? `${formatSpokenDate(date)}, today` : formatSpokenDate(date)}
                      accessibilityState={{ selected, disabled: !enabled }}
                      style={styles.cell}
                    >
                      <View
                        style={[
                          styles.day,
                          selected ? { backgroundColor: colors.gold } : null,
                          isToday && !selected ? { borderColor: colors.gold, borderWidth: 1 } : null,
                        ]}
                      >
                        <Text
                          variant="body"
                          tabular
                          weight={selected || isToday ? '700' : undefined}
                          style={{ color: textColor }}
                        >
                          {String(Number(date.slice(8)))}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const DAY = 40;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.minTouch,
    marginBottom: space[1],
  },
  title: {
    flex: 1,
    paddingLeft: space[1],
  },
  weekdays: {
    flexDirection: 'row',
    paddingBottom: space[1],
  },
  weekday: {
    flex: 1,
    alignItems: 'center',
  },
  week: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: DAY,
    height: DAY,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
