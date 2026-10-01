import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { useTheme } from '@/design/theme';
import { useVisibility, visibleTabs } from '@/modules/registry';

/**
 * Bottom tabs, generated from the module registry and filtered by role.
 * The Inbox is not a tab: it opens from the bell in every tab header. Analytics
 * took the freed slot (owner decision).
 */
export default function TabsLayout() {
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
