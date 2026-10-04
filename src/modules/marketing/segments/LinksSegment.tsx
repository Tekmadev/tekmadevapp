import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { linkClicksInfiniteQuery, linkKeys, linksMetaQuery, linksQuery } from '@/api/endpoints/links';
import { sessionKeys } from '@/api/endpoints/session';
import { MESSAGES } from '@/api/errors';
import type { LinkClick, ShortLink } from '@/api/schemas/links';
import { useCan } from '@/auth/permissions';
import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { Section } from '@/components/Section';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { InlineLoader } from '@/loader/InlineLoader';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { CLICK_DIVIDER_INSET, ClickListSkeleton, ClickRow, LinkCardSkeleton } from '@/modules/links/ClickRow';
import { LinkSheets, type LinkSheet } from '@/modules/links/LinkActions';
import { LinkCard } from '@/modules/links/LinkCard';
import { flattenClicks, LINK_COPY } from '@/modules/links/logic';
import { NewLinkSheet } from '@/modules/links/NewLinkSheet';
import { useMinuteClock } from '@/modules/overview/hooks';

import type { MarketingSegmentProps } from './types';

type Row =
  | { kind: 'link'; link: ShortLink; index: number }
  | { kind: 'links-state' }
  | { kind: 'clicks-title' }
  | { kind: 'click'; click: LinkClick; index: number; last: boolean }
  | { kind: 'clicks-state' };

const rowKey = (row: Row) => {
  switch (row.kind) {
    case 'link':
      return `link-${row.link.id}`;
    case 'click':
      return `click-${row.click.id}`;
    default:
      return row.kind;
  }
};
const rowType = (row: Row) => row.kind;

const openLink = (id: string) => router.push({ pathname: '/links/[id]', params: { id } });
const openLinkRow = (link: ShortLink) => openLink(link.id);

/**
 * The Links section of the Marketing tab (brief 8.11, `links.view`): a "New
 * link" button, every branded short link as a card (GET /links), then the
 * latest visits across all links (GET /links/clicks, infinite scroll). A card
 * opens its own click history; Copy, Share and QR code sit on the card, and
 * Disable / Enable and Delete in its menu. The quick action "New link" lands
 * here with `action=new` and opens the form once. New link, Disable / Enable
 * and Delete need `links.write` (staff: Copy, Share and QR code only).
 */
export function LinksSegment({ chrome, params }: MarketingSegmentProps) {
  const online = useIsOnline();
  const canWrite = useCan('links.write');
  const reduceMotion = useReduceMotion();
  const now = useMinuteClock();

  const links = useQuery(linksQuery());
  const clicks = useInfiniteQuery(linkClicksInfiniteQuery({}));
  const meta = useQuery(linksMetaQuery());
  useRefreshOnFocus([linkKeys.all, sessionKeys.meta]);

  const [creating, setCreating] = useState(false);
  const [sheet, setSheet] = useState<LinkSheet | null>(null);

  // The quick action opens the form once; closing it clears the param, so coming back does not reopen it.
  const fromQuickAction = params.action === 'new';
  const newOpen = canWrite && (creating || fromQuickAction);
  const closeNew = () => {
    setCreating(false);
    if (fromQuickAction) router.setParams({ action: undefined });
  };

  // Offline with nothing cached the reads wait for the connection: say so, not a skeleton that never ends.
  const linksPaused = links.isPending && links.fetchStatus === 'paused';
  const clicksPaused = clicks.isPending && clicks.fetchStatus === 'paused';
  const linkList = links.data;
  const clickList = flattenClicks(clicks.data?.pages);
  const liveIds = new Set(linkList?.map((l) => l.id));
  const existingSlugs = linkList?.map((l) => l.slug) ?? [];

  const rows: Row[] = [];
  if (linkList && linkList.length > 0) linkList.forEach((link, index) => rows.push({ kind: 'link', link, index }));
  else rows.push({ kind: 'links-state' });
  // Both offline with nothing cached: one network error is enough.
  if (!(linksPaused && clicksPaused)) {
    rows.push({ kind: 'clicks-title' });
    if (clickList.length > 0) {
      clickList.forEach((click, index) => rows.push({ kind: 'click', click, index, last: index === clickList.length - 1 }));
    } else {
      rows.push({ kind: 'clicks-state' });
    }
  }

  const firstClicksPage = clicks.data?.pages[0]?.items.length ?? 0;
  const openMenu = (link: ShortLink) => setSheet({ link, kind: 'menu' });

  const linksState = linksPaused ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => links.refetch() : undefined} />
  ) : links.isPending ? (
    <LinkCardSkeleton />
  ) : links.isError ? (
    <ErrorState error={links.error} onRetry={() => links.refetch()} />
  ) : (
    <View style={styles.gutter}>
      <EmptyState compact message={canWrite ? LINK_COPY.emptyLinks : LINK_COPY.emptyLinksReadOnly} />
    </View>
  );

  const clicksState = clicksPaused ? (
    <View style={styles.gutter}>
      <ErrorState compact message={MESSAGES.network} onRetry={online ? () => clicks.refetch() : undefined} />
    </View>
  ) : clicks.isPending ? (
    <ClickListSkeleton />
  ) : clicks.isError ? (
    <View style={styles.gutter}>
      <ErrorState compact error={clicks.error} onRetry={() => clicks.refetch()} />
    </View>
  ) : (
    <View style={styles.gutter}>
      <EmptyState compact message={LINK_COPY.emptyClicks} />
    </View>
  );

  const renderItem = ({ item }: ListRenderItemInfo<Row>) => {
    switch (item.kind) {
      case 'link':
        return <LinkCard link={item.link} meta={meta.data} onOpen={openLinkRow} onMenu={openMenu} index={item.index} still={reduceMotion} />;
      case 'links-state':
        return linksState;
      case 'clicks-title':
        return (
          <View style={[styles.gutter, styles.clicksTitle]}>
            <Section title="Recent clicks" spacing={space[1]} />
            {clicks.isRefetchError && clicks.data !== undefined && online ? (
              <ErrorState compact error={clicks.error} onRetry={() => clicks.refetch()} style={styles.refetchError} />
            ) : null}
          </View>
        );
      case 'click':
        return (
          <View>
            <ClickRow
              click={item.click}
              now={now}
              showLink
              onOpenLink={liveIds.has(item.click.linkId) ? openLink : undefined}
              index={item.index}
              still={reduceMotion || item.index >= firstClicksPage}
            />
            {item.last ? null : <Divider inset={CLICK_DIVIDER_INSET} />}
          </View>
        );
      case 'clicks-state':
        return clicksState;
    }
  };

  const loadMore = () => {
    if (clicks.hasNextPage && !clicks.isFetchingNextPage && !clicks.isFetchNextPageError) void clicks.fetchNextPage();
  };

  const header = (
    <View>
      {chrome.switcher}
      <View style={styles.gutter}>
        <Section
          title="Links"
          spacing={space[3]}
          right={
            canWrite ? (
              <Button label="New link" icon={Plus} size="sm" onPress={() => setCreating(true)} accessibilityHint="Opens the new link form" />
            ) : undefined
          }
        />
        {links.isRefetchError && linkList !== undefined && online ? (
          <ErrorState compact error={links.error} onRetry={() => links.refetch()} style={styles.refetchError} />
        ) : null}
      </View>
    </View>
  );

  const footer = (
    <View>
      {clicks.isFetchingNextPage ? (
        <View style={styles.more} accessible accessibilityRole="progressbar" accessibilityLabel="Loading more clicks">
          <InlineLoader />
        </View>
      ) : null}
      {clicks.isFetchNextPageError ? (
        <View style={styles.gutter}>
          <ErrorState compact error={clicks.error} onRetry={() => clicks.fetchNextPage()} />
        </View>
      ) : null}
      <View style={{ height: chrome.fabClearance }} />
    </View>
  );

  const refresh = () => Promise.all([links.refetch(), clicks.refetch(), meta.refetch()]);
  const refetching =
    (links.isFetching && linkList !== undefined) || (clicks.isFetching && !clicks.isFetchingNextPage && clicks.data !== undefined);

  return (
    <>
      <ScreenList<Row>
        {...chrome.screen}
        data={rows}
        renderItem={renderItem}
        keyExtractor={rowKey}
        getItemType={rowType}
        extraData={{ meta: meta.data, now, links: links.status, linksFetch: links.fetchStatus, clicks: clicks.status, clicksFetch: clicks.fetchStatus, online }}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        onRefresh={refresh}
        refetching={refetching}
        queryKey={linkKeys.list()}
      />
      {newOpen ? <NewLinkSheet onClose={closeNew} meta={meta.data} existingSlugs={existingSlugs} /> : null}
      <LinkSheets sheet={sheet} onChange={setSheet} />
    </>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  clicksTitle: { marginTop: layout.sectionGap - space[3] },
  refetchError: { marginBottom: space[3] },
  more: { alignItems: 'center', justifyContent: 'center', height: 56 },
});
