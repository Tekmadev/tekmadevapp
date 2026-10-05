import type { ListRenderItemInfo } from '@shopify/flash-list';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { demoKeys, demosInfiniteQuery } from '@/api/endpoints/demos';
import { MESSAGES } from '@/api/errors';
import type { DemoRequest } from '@/api/schemas/demos';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FilterChips, type FilterChipItem } from '@/components/FilterChips';
import { ScreenList } from '@/components/ScreenList';
import { useReduceMotion } from '@/design/motion';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { InlineLoader } from '@/loader/InlineLoader';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { DemoRow } from '@/modules/demos/DemoRow';
import { DEMO_EMPTY, DEMO_FILTER_LABELS, DEMO_FILTERS, demoFilterCount, demoFilterParams, toDemoFilter, type DemoFilter } from '@/modules/demos/labels';
import { LeadListSkeleton, ROW_DIVIDER_INSET } from '@/modules/leads/LeadListSkeleton';
import { uniqueById } from '@/modules/leads/logic';
import { useMinuteClock } from '@/modules/overview/hooks';

import type { SegmentProps } from './types';

const rowKey = (demo: DemoRequest) => demo.id;
const Separator = () => <Divider inset={ROW_DIVIDER_INSET} />;

/**
 * The Demos segment of the Customers tab (contract 2026-10-05, GET /demos):
 * demo requests newest first, filtered Open (the default), Ready, Mine (your
 * open requests) or All, with the server's counts on the chips. `view` in the
 * route (from /admin/demos?status=ready or ?mine=1) picks the filter. Rows
 * open the request. Requests are asked for from a client or a lead, so the
 * empty states point there. A failed read is an ErrorState with Retry, never
 * an empty list; cached rows stay on screen offline under the banner.
 */
export function DemosSegment({ chrome, params }: SegmentProps) {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const now = useMinuteClock();

  // The route's filter wins when a link brings one; the chips change it locally after that.
  const routeFilter = toDemoFilter(params.view);
  const [filter, setFilter] = useState<DemoFilter>(routeFilter ?? 'open');
  const [seenRoute, setSeenRoute] = useState(routeFilter);
  if (routeFilter !== seenRoute) {
    setSeenRoute(routeFilter);
    if (routeFilter) setFilter(routeFilter);
  }

  const listParams = demoFilterParams(filter);
  const list = useInfiniteQuery({ ...demosInfiniteQuery(listParams), placeholderData: keepPreviousData });
  useRefreshOnFocus([demoKeys.lists()]);

  // Offline with nothing cached for this filter the read waits for the connection: say so, not a
  // skeleton that never ends, and not the previous filter's rows.
  const pausedWithoutData = (list.isPending || list.isPlaceholderData) && list.fetchStatus === 'paused';
  const hasData = list.data !== undefined && !pausedWithoutData;
  const rows = list.isPending || pausedWithoutData ? [] : uniqueById(list.data?.pages);
  const counts = list.data?.pages[0]?.counts;
  const firstPageCount = list.data?.pages[0]?.items.length ?? 0;

  const chips: FilterChipItem<DemoFilter>[] = DEMO_FILTERS.map((value) => ({
    value,
    label: DEMO_FILTER_LABELS[value],
    count: hasData ? demoFilterCount(value, counts) : null,
  }));

  const changeFilter = (next: DemoFilter | null) => {
    if (!next) return;
    setFilter(next);
    if (params.view) router.setParams({ view: undefined });
  };

  // The row is the request: the detail opens on it at once, then loads its history.
  const openDemo = (demo: DemoRequest) => {
    const key = demoKeys.detail(demo.id);
    const cached = queryClient.getQueryState(key);
    if (cached?.data === undefined) queryClient.setQueryData(key, demo, { updatedAt: 0 });
    router.push({ pathname: '/demos/[id]', params: { id: demo.id } });
  };

  const loadMore = () => {
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) void list.fetchNextPage();
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<DemoRequest>) => (
    <DemoRow demo={item} now={now} onPress={openDemo} index={index} still={reduceMotion || index >= firstPageCount} />
  );

  const header = (
    <View>
      {chrome.switcher}
      <FilterChips<DemoFilter> items={chips} value={filter} onChange={changeFilter} accessibilityLabel="Demo requests to show" />
      {list.isRefetchError && hasData && online ? (
        <ErrorState compact error={list.error} onRetry={() => list.refetch()} style={styles.refetchError} />
      ) : null}
      <View style={styles.headerEnd} />
    </View>
  );

  const empty = pausedWithoutData ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => list.refetch() : undefined} />
  ) : list.isPending ? (
    <LeadListSkeleton />
  ) : list.isError && !hasData ? (
    <ErrorState error={list.error} onRetry={() => list.refetch()} />
  ) : (
    <EmptyState message={DEMO_EMPTY[filter]} />
  );

  const footer = (
    <View>
      {list.isFetchingNextPage ? (
        <View style={styles.more} accessible accessibilityRole="progressbar" accessibilityLabel="Loading more demo requests">
          <InlineLoader />
        </View>
      ) : null}
      {list.isFetchNextPageError ? <ErrorState compact error={list.error} onRetry={() => list.fetchNextPage()} /> : null}
      <View style={{ height: chrome.fabClearance }} />
    </View>
  );

  return (
    <ScreenList<DemoRequest>
      {...chrome.screen}
      data={rows}
      renderItem={renderItem}
      keyExtractor={rowKey}
      extraData={now}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      onRefresh={() => list.refetch()}
      refetching={list.isFetching && !list.isFetchingNextPage && hasData}
      queryKey={demoKeys.list(listParams)}
    />
  );
}

const styles = StyleSheet.create({
  refetchError: { marginTop: space[3] },
  headerEnd: { height: space[3] },
  more: { alignItems: 'center', justifyContent: 'center', height: 56 },
});
