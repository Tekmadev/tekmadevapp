import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { useTheme } from '@/design/theme';
import { useVisibility, visibleTabs } from '@/modules/registry';
import { inboxSummaryQuery } from '@/modules/inbox/queries';

/** Bottom tabs, generated from the module registry and filtered by role. */
export default function TabsLayout() {
  const { colors } = useTheme();
  const visibility = useVisibility();
  const tabs = visibleTabs(visibility);
  const summary = useQuery(inboxSummaryQuery());
  const badge = { count: summary.data?.unread ?? 0, critical: (summary.data?.criticalUnread ?? 0) > 0 };
  const hidden = (route: string) => !tabs.some((t) => t.route === route);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} tabs={tabs} inboxBadge={badge} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'fade' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox' }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers' }} />
      <Tabs.Screen name="marketing" options={{ title: 'Marketing', href: hidden('marketing') ? null : undefined }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
