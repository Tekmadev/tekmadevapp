import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { chipLabel } from '@/components/parts/logic';
import { haptics } from '@/design/haptics';
import { springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

export type InboxSegment<V extends string> = { value: V; label: string; count?: number | null };

type Props<V extends string> = {
  items: readonly InboxSegment<V>[];
  value: V;
  onChange: (value: V) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

type SegmentLayout = { x: number; width: number };

const TRACK = 44;
const PAD = 3;

/**
 * The kit's SegmentedControl look (bg3 track, surface pill sliding on the
 * default spring, selection haptic, tab semantics), with segments sized to
 * their labels instead of equal thirds. "Needs action (12)" needs about 108dp
 * at 13sp (140dp at font scale 1.3), more than a third of a 360dp phone, while
 * "All" needs 17dp; content-weighted widths keep every label whole.
 */
export function InboxSegments<V extends string>({ items, value, onChange, accessibilityLabel, style }: Props<V>) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const [layouts, setLayouts] = useState<Partial<Record<V, SegmentLayout>>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const placed = useSharedValue(false);

  const target = layouts[value];
  const targetX = target?.x;
  const targetWidth = target?.width;

  useEffect(() => {
    if (targetX === undefined || targetWidth === undefined) return;
    // First placement (and reduced motion) jumps; later changes glide.
    if (!placed.get() || reduceMotion) {
      x.set(targetX);
      width.set(targetWidth);
      placed.set(true);
      return;
    }
    x.set(withSpring(targetX, springs.default));
    width.set(withSpring(targetWidth, springs.default));
  }, [targetX, targetWidth, reduceMotion, x, width, placed]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: placed.get() ? 1 : 0,
    width: width.get(),
    transform: [{ translateX: x.get() }],
  }));

  const measure = (key: V) => (e: LayoutChangeEvent) => {
    const { x: lx, width: lw } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const old = prev[key];
      return old && old.x === lx && old.width === lw ? prev : { ...prev, [key]: { x: lx, width: lw } };
    });
  };

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.bg3, borderColor: colors.line }, style]}
    >
      <View style={styles.inner}>
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.lineStrong }, pillStyle]}
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
              onLayout={measure(item.value)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: PAD - 1,
  },
  inner: { flex: 1, flexDirection: 'row' },
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  // Natural label width plus an equal share of the spare room.
  segment: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[3],
  },
});
