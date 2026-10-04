import { router, useLocalSearchParams } from 'expo-router';
import { ListChecks } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';

import { useCan, useCapabilities } from '@/auth/permissions';
import { Fab } from '@/components/Fab';
import { Menu } from '@/components/Menu';
import { ScrollTabs, type ScrollTabItem } from '@/components/ScrollTabs';
import { space } from '@/design/tokens';
import { quickActionsHint } from '@/modules/overview/logic';
import { PlusSheet } from '@/modules/quickActions/PlusSheet';
import { plusSheetActions, useVisibility } from '@/modules/registry';
import { TabHeaderActions } from '@/modules/shell/TabHeaderActions';

import { ClientsSegmentHost } from './segments/ClientsSegmentHost';
import { LeadsSegment } from './segments/LeadsSegment';
import { SubscriptionsSegment } from './segments/SubscriptionsSegment';
import { ToolsSegment } from './segments/ToolsSegment';
import { SEGMENT_LABELS, toSegment, visibleSegments, type CustomerSegment, type CustomersParams, type SegmentChrome } from './segments/types';

/** The Fab is 56dp and floats 16dp above the tab bar; rows get this much extra room under them. */
const FAB_CLEARANCE = 56 + space[4] + space[2];

/**
 * The Customers tab (brief section 7): Clients, Leads, Free tools and
 * Subscriptions, switched by tabs under the title and bound to the route param
 * `segment` (default clients), so deep links and Home cards land on the right
 * one. Each segment owns its list and states; this shell owns the title, the
 * header actions (search, Inbox bell, "Checklist templates" for people with
 * `clients.templates`), the gold + button and the quick actions sheet.
 * Only the sections this person may open are tabs: staff never see
 * Subscriptions (money).
 */
export function CustomersScreen() {
  const params = useLocalSearchParams<CustomersParams>();
  const caps = useCapabilities();
  const segments = visibleSegments((cap) => caps.includes(cap));
  const segment = toSegment(params.segment, segments);
  const tabs: ScrollTabItem<CustomerSegment>[] = segments.map((value) => ({ value, label: SEGMENT_LABELS[value] }));
  const canTemplates = useCan('clients.templates');
  const keyboardVisible = useKeyboardState((s) => s.isVisible);
  const [plusOpen, setPlusOpen] = useState(false);
  // The gold + lists only what this person may do; with nothing to offer it is not shown.
  const plusHint = quickActionsHint(plusSheetActions(useVisibility()).map((a) => a.title));

  // A segment's quick filter and one-shot action belong to it: leaving it drops them.
  const switchTo = (next: CustomerSegment) => router.setParams({ segment: next, view: undefined, action: undefined });

  const headerRight = (
    <View style={styles.actions}>
      <TabHeaderActions />
      {canTemplates ? (
        <Menu
          title="Customers"
          items={[{ label: 'Checklist templates', icon: ListChecks, hint: 'The onboarding checklist for new clients', onPress: () => router.push('/clients/templates') }]}
        />
      ) : null}
    </View>
  );

  const chrome: SegmentChrome = {
    screen: { title: 'Customers', headerRight },
    switcher: <ScrollTabs items={tabs} active={segment} onChange={switchTo} accessibilityLabel="Customers sections" style={styles.switcher} />,
    fabClearance: FAB_CLEARANCE,
  };

  return (
    <View style={styles.fill}>
      {segment === 'clients' ? (
        <ClientsSegmentHost chrome={chrome} params={params} />
      ) : segment === 'leads' ? (
        <LeadsSegment chrome={chrome} params={params} />
      ) : segment === 'tools' ? (
        <ToolsSegment chrome={chrome} params={params} />
      ) : (
        <SubscriptionsSegment chrome={chrome} params={params} />
      )}
      {/* Out of the way while typing in a search box; the tab bar hides then too. */}
      {keyboardVisible || !plusHint ? null : (
        <Fab onPress={() => setPlusOpen(true)} accessibilityLabel="Quick actions" accessibilityHint={plusHint} />
      )}
      <PlusSheet visible={plusOpen} onClose={() => setPlusOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  switcher: { marginBottom: space[4] },
});
