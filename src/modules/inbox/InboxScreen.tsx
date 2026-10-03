import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { notificationKeys } from '@/api/endpoints/notifications';
import { MESSAGES } from '@/api/errors';
import type { NotificationCategory, NotificationFilter, NotificationItem } from '@/api/schemas/notifications';
import { useRole } from '@/auth/session';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { usePrefs } from '@/lib/prefs';
import { InlineLoader } from '@/loader/InlineLoader';
import { HeaderSearchButton } from '@/modules/search/HeaderSearchButton';

import { InboxFilters } from './InboxFilters';
import { INBOX_COPY, inboxSubtitle, isOpenAction, newestInstant, parseFilterParam, type InboxEntry } from './logic';
import { destinationOf, openLink } from './navigation';
import { NotificationActionsSheet } from './NotificationActionsSheet';
import { NotificationDetailSheet } from './NotificationDetailSheet';
import { NotificationRow } from './NotificationRow';
import { inboxSummaryQuery, usePushLive } from './queries';
import { resolveMutationKey, useInboxActions } from './useInboxActions';
import { useInboxList, useLiveInboxSync, useRefetchOnFocus } from './useInboxList';

/** Rows pulled into place with the stagger on first load (the motion language's "first 8"). */
const ENTER_ROWS = 8;
/** After this the first load is over: rows that mount later (recycling, paging) just appear. */
const ENTER_WINDOW_MS = 700;

/**
 * The Inbox (brief 8.4): one shared staff inbox of real-world events. A pushed
 * screen opened from the bell in every tab header (owner decision: not a tab).
 */
export function InboxScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const qc = useQueryClient();
  const role = useRole();
  const isOwner = role === 'owner';
  const online = useIsOnline();
  const includeTestPref = usePrefs((s) => s.inboxIncludeTest);
  const setIncludeTest = usePrefs((s) => s.setInboxIncludeTest);
  const includeTest = isOwner && includeTestPref;

  // The segment follows the route param (Home links to ?filter=action), and the person after that.
  const paramFilter = parseFilterParam(params.filter);
  const [filter, setFilter] = useState<NotificationFilter>(paramFilter ?? 'all');
  const [lastParam, setLastParam] = useState(params.filter);
  if (params.filter !== lastParam) {
    setLastParam(params.filter);
    if (paramFilter) setFilter(paramFilter);
  }
  const [chosenCategory, setCategory] = useState<NotificationCategory | null>(null);
  // Owner-only categories never apply to a manager, whatever was picked before.
  const category = chosenCategory && !isOwner && (chosenCategory === 'audience' || chosenCategory === 'team') ? null : chosenCategory;

  const { query, items, entries, sticky, summary: listSummary, queryKey } = useInboxList({ filter, category, includeTest });
  const badgeQuery = useQuery(inboxSummaryQuery({ pushLive: usePushLive() }));
  // With "Include test" the list's own summary counts test rows, like the rows on screen; otherwise the live badge.
  const summary = includeTest ? listSummary : (badgeQuery.data ?? listSummary);
  const actions = useInboxActions();

  const resolvingIds = useMutationState({
    filters: { mutationKey: resolveMutationKey, status: 'pending' },
    select: (mutation) => (mutation.state.variables as { id: string } | undefined)?.id ?? null,
  });

  useRefetchOnFocus(() => {
    void query.refetch();
    void badgeQuery.refetch();
  });
  useLiveInboxSync({ badge: badgeQuery.data, listSummary, includeTest, listFetching: query.isFetching });

  // Rows mounted during the first load are pulled into place; later ones just appear.
  const hasRows = items.length > 0;
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    if (!hasRows || !entering) return;
    const id = setTimeout(() => setEntering(false), ENTER_WINDOW_MS);
    return () => clearTimeout(id);
  }, [hasRows, entering]);

  /* ---------- sheets ---------- */

  const [detail, setDetail] = useState<{ id: string; open: boolean } | null>(null);
  const [actionsFor, setActionsFor] = useState<{ item: NotificationItem; open: boolean } | null>(null);

  const showDetail = (item: NotificationItem) => {
    qc.setQueryData(notificationKeys.detail(item.id), item);
    setDetail({ id: item.id, open: true });
  };

  /* ---------- row actions ---------- */

  const openItem = (item: NotificationItem) => {
    if (!item.is_read && online) actions.markRead([item.id]);
    const destination = destinationOf(item, role);
    if (destination) openLink(destination);
    else showDetail(online ? { ...item, is_read: true } : item);
  };

  const toggleRead = (item: NotificationItem) => {
    if (item.is_read) actions.markUnread([item.id]);
    else actions.markRead([item.id]);
  };

  const toggleResolved = (item: NotificationItem) => actions.setResolved(item.id, isOpenAction(item));

  /* ---------- header ---------- */

  // "Mark all read" sends the newest last_occurred_at shown, exactly as received (a string,
  // never through a Date), so a row that bumps after this list loaded stays unread.
  const seen = newestInstant(items);
  const unread = summary?.unread ?? 0;
  const showMarkAll = unread > 0 && seen !== null;

  const headerRight = (
    <View style={styles.headerRight}>
      {showMarkAll ? (
        <Button
          label={INBOX_COPY.markAllRead}
          variant="ghost"
          size="sm"
          disabled={!online}
          accessibilityHint={online ? undefined : MESSAGES.offline}
          onPress={() => {
            if (seen) actions.markAllRead(seen);
          }}
        />
      ) : null}
      <HeaderSearchButton />
    </View>
  );

  /* ---------- list ---------- */

  const refresh = async () => {
    const [list] = await Promise.all([query.refetch(), badgeQuery.refetch()]);
    if (list.isError && list.data) notice.err(INBOX_COPY.error);
  };

  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
  };

  const renderItem = ({ item: entry, target }: ListRenderItemInfo<InboxEntry>) => {
    if (entry.kind === 'day') return <DayHeader label={entry.label} sticky={target === 'StickyHeader'} />;
    return (
      <NotificationRow
        item={entry.item}
        divider={entry.divider}
        enterIndex={entering && entry.index < ENTER_ROWS ? entry.index : null}
        online={online}
        resolving={resolvingIds.includes(entry.item.id)}
        onPress={openItem}
        onLongPress={(item) => setActionsFor({ item, open: true })}
        onToggleRead={toggleRead}
        onToggleResolved={(item) => void toggleResolved(item)}
      />
    );
  };

  // Offline with nothing cached, the first read is paused rather than failed: say so instead of
  // shimmering forever (the offline banner sits above it).
  const pausedWithoutData = query.isPending && query.fetchStatus === 'paused';
  let empty = null;
  if (query.isPending && !pausedWithoutData) empty = <SkeletonList rows={7} trailing={false} dividers />;
  else if (pausedWithoutData || (query.isError && !query.data)) {
    empty = (
      <ErrorState
        message={INBOX_COPY.error}
        onRetry={() => query.refetch()}
        retrying={query.isFetching && !pausedWithoutData}
      />
    );
  } else empty = <EmptyState message={INBOX_COPY.empty[filter]} />;

  let footer = null;
  if (query.isFetchingNextPage) {
    footer = (
      <View style={styles.footer} accessible accessibilityRole="progressbar" accessibilityLabel="Loading more">
        <InlineLoader />
      </View>
    );
  } else if (query.isFetchNextPageError) {
    footer = <ErrorState compact message={INBOX_COPY.moreError} onRetry={() => query.fetchNextPage()} />;
  }

  return (
    <>
      <ScreenList
        title={INBOX_COPY.title}
        // A blank line until the counts are known, so the list does not shift when they land.
        subtitle={summary ? inboxSubtitle(summary) : ' '}
        back
        headerRight={headerRight}
        onRefresh={refresh}
        refetching={query.isFetching && !query.isPending && !query.isFetchingNextPage}
        queryKey={queryKey}
        data={entries}
        renderItem={renderItem}
        keyExtractor={(entry) => entry.key}
        getItemType={(entry) => entry.kind}
        stickyHeaderIndices={sticky.length ? sticky : undefined}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        extraData={{ online, entering, resolvingIds }}
        ListHeaderComponent={
          <InboxFilters
            filter={filter}
            onFilter={setFilter}
            needsAction={summary?.needsAction ?? null}
            category={category}
            onCategory={setCategory}
            isOwner={isOwner}
            includeTest={includeTest}
            onIncludeTest={setIncludeTest}
          />
        }
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
      />

      <NotificationDetailSheet
        id={detail?.id ?? null}
        visible={detail?.open ?? false}
        onClose={() => setDetail((d) => (d ? { ...d, open: false } : d))}
        online={online}
        canOpen={(item) => destinationOf(item, role) !== null}
        onOpen={(item) => {
          setDetail((d) => (d ? { ...d, open: false } : d));
          const destination = destinationOf(item, role);
          if (destination) openLink(destination);
        }}
        onToggleResolved={toggleResolved}
        onMarkUnread={(item) => {
          setDetail((d) => (d ? { ...d, open: false } : d));
          actions.markUnread([item.id]);
        }}
      />

      <NotificationActionsSheet
        item={actionsFor?.item ?? null}
        visible={actionsFor?.open ?? false}
        onClose={() => setActionsFor((a) => (a ? { ...a, open: false } : a))}
        online={online}
        onOpen={openItem}
        onToggleResolved={(item) => void toggleResolved(item)}
        onQuiet={(item) => actions.setQuiet(item.category, true)}
      />
    </>
  );
}

/** "Today", "Yesterday", "Monday, September 28": also the pinned header while its day scrolls by. */
function DayHeader({ label, sticky }: { label: string; sticky: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.day, { backgroundColor: colors.bg }]}>
      <Text variant="label" weight="600" color="ink3" accessibilityRole="header" numberOfLines={1}>
        {label}
      </Text>
      {sticky ? <View style={[styles.dayRule, { backgroundColor: colors.line }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  day: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[2] },
  dayRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 },
  footer: { height: 64, alignItems: 'center', justifyContent: 'center' },
});
