import { router, useLocalSearchParams } from 'expo-router';
import { Tags } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';

import { useCan, useCapabilities } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
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
  allowedMarketingSegments,
  MARKETING_SEGMENT_LABELS,
  MARKETING_SEGMENTS,
  MARKETING_TAB_CAPS,
  resolveMarketingSegment,
  type MarketingParams,
  type MarketingSegment,
  type MarketingSegmentChrome,
} from './segments/types';

const TABS: readonly ScrollTabItem<MarketingSegment>[] = MARKETING_SEGMENTS.map((value) => ({ value, label: MARKETING_SEGMENT_LABELS[value] }));

/** The Fab is 56dp and floats 16dp above the tab bar; rows get this much extra room under them. */
const FAB_CLEARANCE = 56 + space[4] + space[2];

const openCategories = () => router.push('/blog/categories');

/**
 * Each section's header menu (after search and the bell). A section without
 * items shows no menu. Categories open read only without `blog.write`.
 */
function segmentMenu(segment: MarketingSegment, canWritePosts: boolean): ActionSheetItem[] {
  if (segment !== 'blog') return [];
  return [
    {
      label: BLOG_COPY.categories,
      icon: Tags,
      hint: canWritePosts ? 'Rename, add or delete categories' : 'Every category and its post count',
      onPress: openCategories,
    },
  ];
}

const newPost = () => router.push({ pathname: '/blog/[id]', params: { id: 'new' } });

/**
 * The Marketing tab (brief 7 and 8.11): Blog, Email, Links and CRM, switched
 * by tabs under the title and bound to the route param `segment` (default the
 * first section this person may open), so deep links (/admin/blog,
 * /admin/email...) land on the right one. Each section needs its `.view`
 * capability and only allowed sections get a tab (staff: Blog, Email, Links);
 * the tab itself needs any one of them. Each segment owns its list and states;
 * this shell owns the title, the header actions (search, Inbox bell, the
 * section's menu) and Blog's gold "New post" button (`blog.write` only).
 */
export function MarketingScreen() {
  return (
    <RequireCapability caps={MARKETING_TAB_CAPS}>
      <MarketingBody />
    </RequireCapability>
  );
}

function MarketingBody() {
  const params = useLocalSearchParams<MarketingParams>();
  const capabilities = useCapabilities();
  const canWritePosts = useCan('blog.write');
  const allowed = allowedMarketingSegments(capabilities);
  const segment = resolveMarketingSegment(params.segment, allowed);
  const tabs = TABS.filter((t) => allowed.includes(t.value));
  const keyboardVisible = useKeyboardState((s) => s.isVisible);

  // A segment's one-shot action belongs to it: leaving it drops the action.
  const switchTo = (next: MarketingSegment) => router.setParams({ segment: next, action: undefined });

  const headerRight = (
    <View style={styles.actions}>
      <TabHeaderActions />
      <Menu title={MARKETING_SEGMENT_LABELS[segment]} items={segmentMenu(segment, canWritePosts)} />
    </View>
  );

  const chrome: MarketingSegmentChrome = {
    screen: { title: 'Marketing', headerRight },
    // One section only (a narrow capability list): no tabs to switch between.
    switcher:
      tabs.length > 1 ? (
        <ScrollTabs items={tabs} active={segment} onChange={switchTo} accessibilityLabel="Marketing sections" style={styles.switcher} />
      ) : (
        <View style={styles.switcher} />
      ),
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
      {segment === 'blog' && canWritePosts && !keyboardVisible ? (
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
