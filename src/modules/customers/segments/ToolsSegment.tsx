import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { toolKeys, toolStatsQuery, toolSubmissionsInfiniteQuery } from '@/api/endpoints/tools';
import { MESSAGES } from '@/api/errors';
import type { ToolSubmission } from '@/api/schemas/tools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { InlineLoader } from '@/loader/InlineLoader';
import { SubmissionListSkeleton } from '@/modules/tools/list/SubmissionListSkeleton';
import { SubmissionRowCard } from '@/modules/tools/list/SubmissionRowCard';
import { ToolStatsRow } from '@/modules/tools/list/ToolStatsRow';
import { rowsOf } from '@/modules/tools/logic';

import { useRefreshOnFocus } from '../useRefreshOnFocus';
import type { SegmentProps } from './types';

const EMPTY = 'No submissions yet. They appear the moment someone asks for a breakdown.';

const openSubmission = (row: ToolSubmission) => router.push({ pathname: '/tools/[id]', params: { id: row.id } });
const rowKey = (row: ToolSubmission) => row.id;
const Gap = () => <View style={styles.gap} />;

/**
 * Customers, Free tools (brief 8.7): the four KPIs (GET /tools/stats) over the
 * submissions of the website's free calculators (GET /tools/submissions,
 * newest first, infinite scroll). A row opens the submission. A failed read
 * is an ErrorState with Retry, never zeros or an empty list; cached rows stay
 * on screen offline under the banner.
 */
export function ToolsSegment({ chrome }: SegmentProps) {
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();

  const list = useInfiniteQuery(toolSubmissionsInfiniteQuery());
  const stats = useQuery(toolStatsQuery());
  useRefreshOnFocus([toolKeys.lists(), toolKeys.stats()]);

  // Count up from zero only on a first load with nothing cached; later changes count from the old value.
  const [countFromZero] = useState(() => stats.data === undefined);

  const pages = list.data?.pages;
  const rows = rowsOf(pages);
  const hasData = list.data !== undefined;
  // Offline with nothing cached the first read waits for the connection: say so, not a skeleton that never ends.
  const pausedWithoutData = list.isPending && list.fetchStatus === 'paused';
  const listFailed = (list.isError && !hasData) || pausedWithoutData;
  const statsPaused = stats.isPending && stats.fetchStatus === 'paused';
  const firstPageCount = pages?.[0]?.items.length ?? 0;

  const refetchAll = () => Promise.all([list.refetch(), stats.refetch()]);

  const loadMore = () => {
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) void list.fetchNextPage();
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<ToolSubmission>) => (
    <SubmissionRowCard row={item} onPress={openSubmission} index={index} still={reduceMotion || index >= firstPageCount} />
  );

  // The KPIs are their own read: they show, load or fail on their own, except that one
  // full-screen error (with a Retry for both) replaces everything when the list fails too.
  let statsNode: ReactNode = null;
  if (stats.data) {
    statsNode = <ToolStatsRow stats={stats.data} loading={false} countFromZero={countFromZero} />;
  } else if (listFailed) {
    // The list's full-screen error speaks for both reads.
  } else if (stats.isError) {
    statsNode = <ErrorState compact error={stats.error} onRetry={() => stats.refetch()} />;
  } else if (statsPaused) {
    statsNode = <ErrorState compact message={MESSAGES.network} onRetry={online ? () => stats.refetch() : undefined} />;
  } else {
    statsNode = <ToolStatsRow stats={undefined} loading countFromZero={countFromZero} />;
  }

  const header = (
    <View>
      {chrome.switcher}
      {statsNode ? <View style={styles.stats}>{statsNode}</View> : null}
      {list.isRefetchError && hasData && online ? <ErrorState compact error={list.error} onRetry={() => list.refetch()} /> : null}
      <View style={styles.headerEnd} />
    </View>
  );

  const empty = pausedWithoutData ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? refetchAll : undefined} />
  ) : list.isPending ? (
    <SubmissionListSkeleton />
  ) : list.isError && !hasData ? (
    <ErrorState error={list.error} onRetry={refetchAll} />
  ) : (
    <EmptyState message={EMPTY} />
  );

  const footer = (
    <View>
      {list.isFetchingNextPage ? (
        <View style={styles.more} accessible accessibilityLabel="Loading more submissions">
          <InlineLoader />
        </View>
      ) : null}
      {list.isFetchNextPageError ? <ErrorState compact error={list.error} onRetry={() => list.fetchNextPage()} /> : null}
      <View style={{ height: chrome.fabClearance }} />
    </View>
  );

  return (
    <ScreenList<ToolSubmission>
      {...chrome.screen}
      data={rows}
      renderItem={renderItem}
      keyExtractor={rowKey}
      ItemSeparatorComponent={Gap}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      onRefresh={refetchAll}
      refetching={(list.isFetching && !list.isFetchingNextPage && hasData) || (stats.isFetching && stats.data !== undefined)}
      queryKey={toolKeys.submissions()}
    />
  );
}

const styles = StyleSheet.create({
  stats: { marginBottom: space[2] },
  headerEnd: { height: space[4] },
  gap: { height: space[3] },
  more: { alignItems: 'center', justifyContent: 'center', height: 56, paddingHorizontal: layout.gutter },
});
