import type { LucideIcon } from 'lucide-react-native';
import { BarChart3, Bell, LayoutDashboard, Menu, Send, Users } from 'lucide-react-native';
import { use, useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightCallbackContext, BottomTabBarHeightContext, type BottomTabBarProps } from 'expo-router/js-tabs';

import { haptics } from '@/design/haptics';
import { fade, springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, space, withAlpha } from '@/design/tokens';
import type { TabDef, TabId } from '@/modules/registry';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { badgeCountLabel, clamp, tabAccessibilityLabel } from './parts/logic';

export type TabBarProps = BottomTabBarProps & {
  /** Visible tabs for this user, in order (generated from the module registry). */
  tabs: TabDef[];
  /** Optional count badges per tab (gold, or signal when critical; "99+" above 99). */
  badges?: Partial<Record<TabDef['id'], { count: number; critical: boolean }>>;
};

/** Height of the floating pill itself. */
export const TAB_BAR_HEIGHT = layout.tabBarHeight;

/** Inset of the pill from the screen sides and from the bottom (plus the safe area). */
const SIDE_GAP = layout.tabBarBottomGap;
const PILL_WIDTH = 56;
const PILL_HEIGHT = 32;
const ICON_SIZE = 22;

const TAB_ICONS: Record<TabId, LucideIcon> = {
  home: LayoutDashboard,
  inbox: Bell,
  analytics: BarChart3,
  customers: Users,
  marketing: Send,
  more: Menu,
};

/**
 * Bottom padding scroll content needs so its last row clears the floating bar
 * (bar + gap + gesture area + a little breathing room).
 */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + SIDE_GAP + insets.bottom + space[4];
}

/** True inside a tab screen (the tab navigator provides its bar height there). */
export function useIsInTabs(): boolean {
  return use(BottomTabBarHeightContext) !== undefined;
}

/**
 * Distance from the bottom of the screen for something floating above the bar
 * (the + button): the top of the tab bar inside tabs, the gesture area elsewhere.
 */
export function useFloatingBottom(): number {
  const insets = useSafeAreaInsets();
  const inTabs = useIsInTabs();
  return inTabs ? TAB_BAR_HEIGHT + SIDE_GAP + insets.bottom : insets.bottom;
}

/**
 * The floating pill tab bar. Content scrolls underneath it (the bar is absolutely
 * positioned), so screens pad their content with useTabBarInset(). A gold pill
 * slides between tabs on a spring while the active icon thickens and turns gold.
 */
export function TabBar({ state, navigation, tabs, badges }: TabBarProps) {
  const { colors, tones, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const keyboardVisible = useKeyboardState((s) => s.isVisible);
  const reportHeight = use(BottomTabBarHeightCallbackContext);

  const items = tabs.flatMap((tab) => {
    const route = state.routes.find((r) => r.name === tab.route);
    return route ? [{ tab, route }] : [];
  });
  const activeKey = state.routes[state.index]?.key;
  const activeIndex = items.findIndex((i) => i.route.key === activeKey);

  const [barWidth, setBarWidth] = useState(0);
  // The tabs sit inside the bar's 1px border.
  const tabWidth = barWidth > 0 && items.length > 0 ? (barWidth - 2) / items.length : 0;

  const position = useSharedValue(Math.max(activeIndex, 0));
  useEffect(() => {
    if (activeIndex < 0) return;
    position.set(reduceMotion ? activeIndex : withSpring(activeIndex, springs.default));
  }, [activeIndex, position, reduceMotion]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: tabWidth > 0 && activeIndex >= 0 ? 1 : 0,
    transform: [{ translateX: position.get() * tabWidth + (tabWidth - PILL_WIDTH) / 2 }],
  }));

  // Out of the way while typing: the keyboard would otherwise lift the bar.
  const hidden = useSharedValue(0);
  useEffect(() => {
    hidden.set(withTiming(keyboardVisible ? 1 : 0, fade(180)));
  }, [hidden, keyboardVisible]);
  const hideStyle = useAnimatedStyle(() => ({
    opacity: 1 - hidden.get(),
    transform: [{ translateY: hidden.get() * (TAB_BAR_HEIGHT + SIDE_GAP) }],
  }));

  const onRootLayout = (e: LayoutChangeEvent) => {
    // Lets useBottomTabBarHeight() report the space the floating bar really covers.
    reportHeight?.(e.nativeEvent.layout.height + SIDE_GAP + insets.bottom);
  };

  const shadow = withAlpha(colors.shadow, isDark ? 0.5 : 0.12);

  return (
    <Animated.View
      pointerEvents={keyboardVisible ? 'none' : 'box-none'}
      onLayout={onRootLayout}
      style={[styles.root, { left: SIDE_GAP, right: SIDE_GAP, bottom: SIDE_GAP + insets.bottom }, hideStyle]}
    >
      <View
        accessibilityRole="tablist"
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={[
          styles.bar,
          {
            backgroundColor: withAlpha(colors.bg2, 0.92),
            borderColor: colors.line,
            boxShadow: [
              { offsetX: 0, offsetY: 10, blurRadius: 28, color: shadow },
              { offsetX: 0, offsetY: 1, blurRadius: 3, color: withAlpha(colors.shadow, isDark ? 0.4 : 0.06) },
            ],
          },
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: tones.gold.bg }, indicatorStyle]} />
        {items.map(({ tab, route }, index) => {
          const focused = index === activeIndex;
          const unread = badges?.[tab.id]?.count ?? 0;
          const onPress = () => {
            haptics.selection();
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };
          return (
            <TabItem
              key={route.key}
              index={index}
              icon={TAB_ICONS[tab.id]}
              title={tab.title}
              focused={focused}
              position={position}
              unread={unread}
              critical={Boolean(badges?.[tab.id]?.critical)}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

type TabItemProps = {
  index: number;
  icon: LucideIcon;
  title: string;
  focused: boolean;
  position: SharedValue<number>;
  unread: number;
  critical: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function TabItem({ index, icon, title, focused, position, unread, critical, onPress, onLongPress }: TabItemProps) {
  // The active look (gold, stroke 2.25) cross-fades with the pill as it slides past.
  const activeStyle = useAnimatedStyle(() => ({ opacity: clamp(1 - Math.abs(position.get() - index), 0, 1) }));
  const inactiveStyle = useAnimatedStyle(() => ({ opacity: 1 - clamp(1 - Math.abs(position.get() - index), 0, 1) }));

  return (
    <PressableScale
      haptic={false}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tabAccessibilityLabel(title, unread)}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}
    >
      <View style={styles.iconBox}>
        <Animated.View style={[styles.iconLayer, inactiveStyle]}>
          <Icon icon={icon} size={ICON_SIZE} color="ink3" strokeWidth={1.75} />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, activeStyle]}>
          <Icon icon={icon} size={ICON_SIZE} color="gold" strokeWidth={2.25} />
        </Animated.View>
        {unread > 0 ? <CountBadge count={unread} critical={critical} /> : null}
      </View>
      <Text variant="caption" tone={focused ? 'gold' : undefined} color={focused ? undefined : 'ink3'} numberOfLines={1}>
        {title}
      </Text>
    </PressableScale>
  );
}

function CountBadge({ count, critical }: { count: number; critical: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[styles.badge, { backgroundColor: critical ? colors.signal : colors.gold, borderColor: colors.bg2 }]}
    >
      <Text variant="caption" color="onInk" weight="700" tabular style={styles.badgeText}>
        {badgeCountLabel(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute' },
  bar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  pill: {
    position: 'absolute',
    left: 0,
    top: space[2] - 1,
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: radius.pill,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: space[2] - 1,
    gap: 2,
  },
  iconBox: { width: PILL_WIDTH, height: PILL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  iconLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -3,
    left: PILL_WIDTH / 2 + 4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12 },
});
