import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LayoutTemplate, Users } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteCampaign, emailKeys, emailMetaQuery, emailOverviewQuery, setCampaignActive } from '@/api/endpoints/email';
import { sessionKeys } from '@/api/endpoints/session';
import { MESSAGES } from '@/api/errors';
import type { Campaign, EngagementEvent } from '@/api/schemas/email';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListRow } from '@/components/ListRow';
import { ScreenList } from '@/components/ScreenList';
import { Section } from '@/components/Section';
import { reportSubmitError } from '@/components/SubmitGroup';
import { haptics } from '@/design/haptics';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { formatCount } from '@/lib/format';
import { notice } from '@/lib/notice';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { CampaignCard } from '@/modules/email/components/CampaignCard';
import { EmailSegmentSkeleton } from '@/modules/email/components/EmailSkeleton';
import { EmailStatsRow } from '@/modules/email/components/EmailStatsRow';
import { EngagementRow } from '@/modules/email/components/EngagementRow';
import { NewCampaignSheet } from '@/modules/email/components/NewCampaignSheet';
import { dropCampaign, putCampaign } from '@/modules/email/data';
import { campaignTitle, EMAIL_COPY } from '@/modules/email/logic';
import { useMinuteClock } from '@/modules/overview/hooks';

import type { MarketingSegmentProps } from './types';

/** Rows of the segment's one list: campaign cards, then the latest opens and clicks. */
type Item =
  | { kind: 'campaignsHead' }
  | { kind: 'campaign'; campaign: Campaign; index: number }
  | { kind: 'campaignsEmpty' }
  | { kind: 'eventsHead' }
  | { kind: 'event'; event: EngagementEvent; index: number }
  | { kind: 'eventsEmpty' };

const itemKey = (item: Item) =>
  item.kind === 'campaign' ? `c:${item.campaign.id}` : item.kind === 'event' ? `e:${item.event.id}` : item.kind;
const itemType = (item: Item) => item.kind;

const openTemplates = () => router.push('/email/templates');
const openSubscribers = () => router.push('/email/subscribers');

/**
 * Marketing, Email (brief 8.11, GET /email/overview): the four KPIs, links to
 * Templates and Subscribers, the campaigns (tracking registrations for emails
 * the CRM sends: Pause / Resume, Delete with HoldToConfirm, "New campaign"),
 * then Recent engagement (the latest opens and clicks). A failed read is an
 * ErrorState with Retry, never zeros; offline keeps the cached page under the
 * banner and disables every write.
 */
export function EmailSegment(props: MarketingSegmentProps) {
  return (
    <OwnerOnly>
      <EmailBody {...props} />
    </OwnerOnly>
  );
}

function EmailBody({ chrome }: MarketingSegmentProps) {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const now = useMinuteClock();

  const overview = useQuery(emailOverviewQuery());
  const meta = useQuery(emailMetaQuery());
  useRefreshOnFocus([emailKeys.overview(), sessionKeys.meta]);

  // Count up from zero only on a first load with nothing cached; later changes count from the old value.
  const [countFromZero] = useState(() => overview.data === undefined);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [toggling, setToggling] = useState<ReadonlySet<string>>(() => new Set());

  const data = overview.data;
  // Offline with nothing cached the read waits for the connection: say so, not a skeleton that never ends.
  const pausedWithoutData = overview.isPending && overview.fetchStatus === 'paused';

  /* ---------- writes (wait for the server: never optimistic) ---------- */

  const toggle = async (campaign: Campaign, active: boolean) => {
    if (toggling.has(campaign.id)) return;
    setToggling((s) => new Set(s).add(campaign.id));
    try {
      putCampaign(queryClient, await setCampaignActive(campaign.id, active));
      haptics.success();
      notice.ok(active ? 'Campaign resumed.' : 'Campaign paused.');
    } catch (error) {
      haptics.error();
      reportSubmitError(error);
    } finally {
      setToggling((s) => {
        const next = new Set(s);
        next.delete(campaign.id);
        return next;
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await deleteCampaign(deleting.id);
    dropCampaign(queryClient, deleting.id);
    notice.ok('Campaign deleted.');
  };

  /* ---------- rows ---------- */

  const items: Item[] = [];
  if (data) {
    items.push({ kind: 'campaignsHead' });
    if (data.campaigns.length === 0) items.push({ kind: 'campaignsEmpty' });
    data.campaigns.forEach((campaign, index) => items.push({ kind: 'campaign', campaign, index }));
    items.push({ kind: 'eventsHead' });
    if (data.recentEvents.length === 0) items.push({ kind: 'eventsEmpty' });
    data.recentEvents.forEach((event, index) => items.push({ kind: 'event', event, index }));
  }

  const renderItem = ({ item }: ListRenderItemInfo<Item>) => {
    switch (item.kind) {
      case 'campaignsHead':
        return (
          <View style={styles.gutter}>
            <Section
              title="Campaigns"
              spacing={0}
              action={{ label: 'New campaign', onPress: () => setCreating(true), accessibilityHint: 'Registers a campaign key' }}
            />
          </View>
        );
      case 'campaignsEmpty':
        return (
          <View style={styles.gutter}>
            <EmptyState compact message={EMAIL_COPY.campaignsEmpty} action={{ label: 'New campaign', onPress: () => setCreating(true) }} />
          </View>
        );
      case 'campaign':
        return (
          <CampaignCard
            campaign={item.campaign}
            meta={meta.data}
            toggling={toggling.has(item.campaign.id)}
            online={online}
            onToggle={toggle}
            onDelete={setDeleting}
            index={item.index}
            still={reduceMotion}
          />
        );
      case 'eventsHead':
        return (
          <View style={[styles.gutter, styles.eventsHead]}>
            <Section title="Recent engagement" spacing={0} />
          </View>
        );
      case 'eventsEmpty':
        return (
          <View style={styles.gutter}>
            <EmptyState compact message={EMAIL_COPY.engagementEmpty} />
          </View>
        );
      case 'event':
        return (
          <View>
            {item.index > 0 ? <Divider inset={layout.gutter} /> : null}
            <EngagementRow
              event={item.event}
              campaign={campaignTitle(data?.campaigns, item.event.campaignKey)}
              meta={meta.data}
              now={now}
              index={item.index}
              still={reduceMotion}
            />
          </View>
        );
    }
  };

  /* ---------- header and states ---------- */

  let stats: ReactNode = null;
  if (data) stats = <EmailStatsRow stats={data.stats} loading={false} countFromZero={countFromZero} />;
  else if (overview.isPending && !pausedWithoutData) stats = <EmailStatsRow stats={undefined} loading countFromZero={countFromZero} />;

  const header = (
    <View>
      {chrome.switcher}
      {stats ? <View style={styles.stats}>{stats}</View> : null}
      {overview.isRefetchError && data && online ? (
        <View style={styles.gutter}>
          <ErrorState compact error={overview.error} onRetry={() => overview.refetch()} style={styles.refetchError} />
        </View>
      ) : null}
      <View style={[styles.gutter, styles.links]}>
        <Card padded={false}>
          <ListRow
            title="Templates"
            subtitle="Ready-made emails to paste into the CRM"
            icon={LayoutTemplate}
            background="surface"
            onPress={openTemplates}
            accessibilityHint="Opens the email templates"
          />
          <Divider inset={72} />
          <ListRow
            title="Subscribers"
            subtitle={data ? `${formatCount(data.stats.activeSubscribers)} active` : 'Search, unsubscribe or erase'}
            icon={Users}
            background="surface"
            onPress={openSubscribers}
            accessibilityHint="Opens the subscriber list"
          />
        </Card>
      </View>
    </View>
  );

  const empty = pausedWithoutData ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => overview.refetch() : undefined} style={styles.gutter} />
  ) : overview.isPending ? (
    <EmailSegmentSkeleton />
  ) : overview.isError && !data ? (
    <ErrorState error={overview.error} onRetry={() => overview.refetch()} style={styles.gutter} />
  ) : null;

  const footer = <View style={{ height: chrome.fabClearance + space[4] }} />;

  return (
    <>
      <ScreenList<Item>
        {...chrome.screen}
        data={items}
        renderItem={renderItem}
        keyExtractor={itemKey}
        getItemType={itemType}
        extraData={{ meta: meta.data, now, toggling, online, campaigns: data?.campaigns }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onRefresh={() => Promise.all([overview.refetch(), meta.refetch()])}
        refetching={overview.isFetching && data !== undefined}
        queryKey={emailKeys.overview()}
      />
      {creating ? <NewCampaignSheet onClose={() => setCreating(false)} /> : null}
      <ConfirmSheet
        visible={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete campaign?'}
        message={EMAIL_COPY.deleteCampaign}
        confirmLabel="Hold to delete"
        pendingLabel="Deleting"
        onConfirm={confirmDelete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  stats: { marginBottom: space[4] },
  refetchError: { marginBottom: space[4] },
  links: { marginBottom: layout.sectionGap },
  eventsHead: { paddingTop: space[5] },
});
