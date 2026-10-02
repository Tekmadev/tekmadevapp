import { router, useLocalSearchParams } from 'expo-router';
import { Tags } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';

import { OwnerOnly } from '@/auth/OwnerOnly';
import { Fab } from '@/components/Fab';
import { Menu } from '@/components/Menu';
import { ScrollTabs, type ScrollTabItem } from '@/components/ScrollTabs';
import type { ActionSheetItem } from '@/components/sheet/ActionSheet';
import { space } from '@/design/tokens';
import { BLOG_COPY } from '@/modules/blog/list/logic';
import { TabHeaderActions } from '@/modules/shell/TabHeaderActions';

import { BlogSegment } from './segments/BlogSegment';
import { CrmSegment } from './segments/CrmSegment';
import { EmailSegment } from './segments/EmailSegment';
import { LinksSegment } from './segments/LinksSegment';
import {
  MARKETING_SEGMENT_LABELS,
  MARKETING_SEGMENTS,
  toMarketingSegment,
  type MarketingParams,
  type MarketingSegment,
  type MarketingSegmentChrome,
} from './segments/types';

const TABS: readonly ScrollTabItem<MarketingSegment>[] = MARKETING_SEGMENTS.map((value) => ({ value, label: MARKETING_SEGMENT_LABELS[value] }));

/** The Fab is 56dp and floats 16dp above the tab bar; rows get this much extra room under them. */
const FAB_CLEARANCE = 56 + space[4] + space[2];

/** Each section's header menu (after search and the bell). A section without items shows no menu. */
const SEGMENT_MENUS: Record<MarketingSegment, ActionSheetItem[]> = {
  blog: [
    {
      label: BLOG_COPY.categories,
      icon: Tags,
      hint: 'Rename, add or delete categories',
      onPress: () => router.push('/blog/categories'),
    },
  ],
  email: [],
  links: [],
  crm: [],
};

const newPost = () => router.push({ pathname: '/blog/[id]', params: { id: 'new' } });

/**
 * The Marketing tab (brief 7 and 8.11, owner only): Blog, Email, Links and CRM,
 * switched by tabs under the title and bound to the route param `segment`
 * (default blog), so deep links (/admin/blog, /admin/email...) land on the
 * right one. Each segment owns its list and states; this shell owns the title,
 * the header actions (search, Inbox bell, the section's menu) and Blog's gold
 * "New post" button.
 */
export function MarketingScreen() {
  return (
    <OwnerOnly>
      <MarketingBody />
    </OwnerOnly>
  );
}

function MarketingBody() {
  const params = useLocalSearchParams<MarketingParams>();
  const segment = toMarketingSegment(params.segment);
  const keyboardVisible = useKeyboardState((s) => s.isVisible);

  // A segment's one-shot action belongs to it: leaving it drops the action.
  const switchTo = (next: MarketingSegment) => router.setParams({ segment: next, action: undefined });

  const headerRight = (
    <View style={styles.actions}>
      <TabHeaderActions />
      <Menu title={MARKETING_SEGMENT_LABELS[segment]} items={SEGMENT_MENUS[segment]} />
    </View>
  );

  const chrome: MarketingSegmentChrome = {
    screen: { title: 'Marketing', headerRight },
    switcher: <ScrollTabs items={TABS} active={segment} onChange={switchTo} accessibilityLabel="Marketing sections" style={styles.switcher} />,
    fabClearance: FAB_CLEARANCE,
  };

  return (
    <View style={styles.fill}>
      {segment === 'blog' ? (
        <BlogSegment chrome={chrome} params={params} />
      ) : segment === 'email' ? (
        <EmailSegment chrome={chrome} params={params} />
      ) : segment === 'links' ? (
        <LinksSegment chrome={chrome} params={params} />
      ) : (
        <CrmSegment chrome={chrome} params={params} />
      )}
      {/* Out of the way while typing in a search box; the tab bar hides then too. */}
      {segment === 'blog' && !keyboardVisible ? (
        <Fab onPress={newPost} accessibilityLabel={BLOG_COPY.newPost} accessibilityHint="Opens the editor" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  switcher: { marginBottom: space[4] },
});
