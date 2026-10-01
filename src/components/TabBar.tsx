import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TabDef } from '@/modules/registry';
import { useTheme } from '@/design/theme';

import { Text } from './Text';

export type TabBarProps = BottomTabBarProps & {
  /** Visible tabs for this user, in order (generated from the module registry). */
  tabs: TabDef[];
  /** Inbox unread badge: gold, or red when a critical item is unread; "99+" above 99. */
  inboxBadge: { count: number; critical: boolean };
};

/** STUB (replaced by the component kit): the floating pill tab bar. */
export function TabBar({ state, navigation, tabs }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', paddingBottom: insets.bottom, backgroundColor: colors.bg2 }}>
      {tabs.map((t) => {
        const route = state.routes.find((r) => r.name === t.route);
        if (!route) return null;
        const focused = state.routes[state.index]?.key === route.key;
        return (
          <Pressable key={t.id} style={{ flex: 1, padding: 16 }} onPress={() => navigation.navigate(route.name)}>
            <Text variant="label" color={focused ? 'gold' : 'ink3'} align="center">
              {t.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
