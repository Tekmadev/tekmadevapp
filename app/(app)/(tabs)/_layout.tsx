import { Tabs } from 'expo-router/js-tabs';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { NativeTabsContext, TabBar } from '@/components/TabBar';
import { useTheme } from '@/design/theme';
import { useVisibility, visibleTabs, type TabId } from '@/modules/registry';

/**
 * Bottom tabs, generated from the module registry and filtered by role.
 * The Inbox is not a tab: it opens from the bell in every tab header. Analytics
 * took the freed slot (owner decision).
 *
 * iPhone uses the system tab bar (UITabBarController: Liquid Glass, SF Symbols);
 * Android keeps the floating pill (TabBar). The bar does not minimise while
 * scrolling: UIKit only finds a scroll view on the first-subview chain, and our
 * Screen puts its header first (moving it would put the content before the
 * header for VoiceOver), so it stays put on every tab rather than on some.
 */
export default function TabsLayout() {
  return Platform.OS === 'ios' ? <NativeTabsLayout /> : <PillTabsLayout />;
}

function PillTabsLayout() {
  const { colors } = useTheme();
  const visibility = useVisibility();
  const tabs = visibleTabs(visibility);
  const hidden = (route: string) => !tabs.some((t) => t.route === route);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} tabs={tabs} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'fade' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="marketing" options={{ title: 'Marketing', href: hidden('marketing') ? null : undefined }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}

/** SF Symbols for the iPhone tab bar (outline, filled when selected). */
const TAB_SYMBOLS: Record<Exclude<TabId, 'inbox'>, { default: SFSymbol; selected: SFSymbol }> = {
  home: { default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' },
  customers: { default: 'person.2', selected: 'person.2.fill' },
  analytics: { default: 'chart.bar', selected: 'chart.bar.fill' },
  marketing: { default: 'paperplane', selected: 'paperplane.fill' },
  more: { default: 'ellipsis.circle', selected: 'ellipsis.circle.fill' },
};

const NATIVE_TABS: { id: Exclude<TabId, 'inbox'>; route: string; title: string }[] = [
  { id: 'home', route: 'index', title: 'Home' },
  { id: 'customers', route: 'customers', title: 'Customers' },
  { id: 'analytics', route: 'analytics', title: 'Analytics' },
  { id: 'marketing', route: 'marketing', title: 'Marketing' },
  { id: 'more', route: 'more', title: 'More' },
];

function NativeTabsLayout() {
  const { colors } = useTheme();
  const visibility = useVisibility();
  const tabs = visibleTabs(visibility);

  return (
    <NativeTabsContext value>
      <NativeTabs minimizeBehavior="never" tintColor={colors.gold}>
        {NATIVE_TABS.map((tab) => (
          <NativeTabs.Trigger key={tab.route} name={tab.route} hidden={!tabs.some((t) => t.route === tab.route)}>
            <NativeTabs.Trigger.Icon sf={TAB_SYMBOLS[tab.id]} />
            <NativeTabs.Trigger.Label>{tab.title}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    </NativeTabsContext>
  );
}
