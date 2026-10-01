import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptics } from '@/design/haptics';
import { springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';

import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useGutter } from './parts/gutter';
import { chipLabel } from './parts/logic';

export type ScrollTabItem<V extends string> = { value: V; label: string; count?: number | null };

export type ScrollTabsProps<V extends string> = {
  items: readonly ScrollTabItem<V>[];
  active: V;
  onChange: (value: V) => void;
  /** Side padding so the first tab lines up with the screen gutter (default 16). */
  inset?: number;
  /** Run edge to edge by cancelling the enclosing Screen's gutter (default true). */
  bleed?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type TabLayout = { x: number; width: number };

const INDICATOR_INSET = space[3];

/**
 * Section tabs for long detail screens: a horizontally scrolling row with a gold
 * underline that springs to the active tab and keeps it in view. Controlled.
 * It paints its own background, so it can stick under the header
 * (Screen's `stickyHeaderIndices`).
 */
export function ScrollTabs<V extends string>({
  items,
  active,
  onChange,
  inset = layout.gutter,
  bleed = true,
  accessibilityLabel,
  style,
  testID,
}: ScrollTabsProps<V>) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const gutter = useGutter();
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef(new Map<V, TabLayout>());
  const [viewport, setViewport] = useState(0);
  // Bumped when a tab reports its layout, so the indicator can find the active one.
  const [measured, setMeasured] = useState(0);

  const x = useSharedValue(0);
  const width = useSharedValue(0);

  useEffect(() => {
    const l = layouts.current.get(active);
    if (!l) return;
    const targetX = l.x + INDICATOR_INSET;
    const targetW = Math.max(l.width - INDICATOR_INSET * 2, 12);
    const first = width.get() === 0;
    x.set(first || reduceMotion ? targetX : withSpring(targetX, springs.default));
    width.set(first || reduceMotion ? targetW : withSpring(targetW, springs.default));
    // Keep the active tab in view, centred when the row can scroll that far.
    if (viewport > 0) {
      scrollRef.current?.scrollTo({ x: Math.max(0, l.x + l.width / 2 - viewport / 2), animated: !reduceMotion && !first });
    }
  }, [active, measured, viewport, reduceMotion, x, width]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: width.get() > 0 ? 1 : 0,
    width: width.get(),
    transform: [{ translateX: x.get() }],
  }));

  const onTabLayout = (value: V) => (e: LayoutChangeEvent) => {
    const { x: lx, width: lw } = e.nativeEvent.layout;
    const prev = layouts.current.get(value);
    if (prev && prev.x === lx && prev.width === lw) return;
    layouts.current.set(value, { x: lx, width: lw });
    setMeasured((n) => n + 1);
  };

  return (
    <View
      testID={testID}
      style={[
        styles.bar,
        { backgroundColor: colors.bg, borderBottomColor: colors.line },
        bleed ? { marginHorizontal: -gutter } : null,
        style,
      ]}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        contentContainerStyle={{ paddingHorizontal: inset - INDICATOR_INSET }}
      >
        <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
          {items.map((item) => {
            const selected = item.value === active;
            const label = chipLabel(item.label, item.count);
            return (
              <PressableScale
                key={item.value}
                haptic={false}
                pressedScale={0.98}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                onLayout={onTabLayout(item.value)}
                onPress={() => {
                  if (selected) return;
                  haptics.selection();
                  onChange(item.value);
                }}
                style={styles.tab}
              >
                <Text variant="label" weight={selected ? '600' : '500'} color={selected ? 'ink' : 'ink3'} numberOfLines={1}>
                  {label}
                </Text>
              </PressableScale>
            );
          })}
          <Animated.View pointerEvents="none" style={[styles.indicator, { backgroundColor: colors.gold }, indicatorStyle]} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: 1 },
  row: { flexDirection: 'row' },
  tab: {
    height: layout.minTouch,
    paddingHorizontal: INDICATOR_INSET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
});
