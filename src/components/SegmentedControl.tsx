import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptics } from '@/design/haptics';
import { springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { chipLabel } from './parts/logic';

export type SegmentItem<V extends string> = { value: V; label: string; count?: number | null };

export type SegmentedControlProps<V extends string> = {
  items: readonly SegmentItem<V>[];
  value: V;
  onChange: (value: V) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const TRACK = 44;
const PAD = 3;

/**
 * Equal-width segments on a bg3 track with a surface pill that slides to the
 * selected one on the default spring. TalkBack reads it as a tab list.
 */
export function SegmentedControl<V extends string>({ items, value, onChange, accessibilityLabel, style, testID }: SegmentedControlProps<V>) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const count = Math.max(items.length, 1);
  const segment = width > 0 ? (width - PAD * 2) / count : 0;
  const index = Math.max(
    items.findIndex((i) => i.value === value),
    0,
  );

  const position = useSharedValue(index);
  useEffect(() => {
    position.set(reduceMotion ? index : withSpring(index, springs.default));
  }, [index, position, reduceMotion]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: segment > 0 ? 1 : 0,
    width: segment,
    transform: [{ translateX: position.get() * segment }],
  }));

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: colors.bg3, borderColor: colors.line }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          { backgroundColor: colors.surface, borderColor: colors.lineStrong },
          pillStyle,
        ]}
      />
      {items.map((item) => {
        const selected = item.value === value;
        const label = chipLabel(item.label, item.count);
        return (
          <PressableScale
            key={item.value}
            haptic={false}
            pressedScale={0.98}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            hitSlop={{ top: 2, bottom: 2 }}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(item.value);
            }}
            style={styles.segment}
          >
            <Text variant="label" weight={selected ? '600' : '500'} color={selected ? 'ink' : 'ink3'} numberOfLines={1}>
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: PAD - 1,
    flexDirection: 'row',
  },
  pill: {
    position: 'absolute',
    top: PAD - 1,
    bottom: PAD - 1,
    left: PAD - 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[2],
  },
});
