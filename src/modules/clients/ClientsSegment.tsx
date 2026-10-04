import type { ListRenderItemInfo } from '@shopify/flash-list';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlaskConical } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { clientKeys, clientsInfiniteQuery, clientsMetaQuery, type ClientListParams } from '@/api/endpoints/clients';
import { sessionKeys } from '@/api/endpoints/session';
import { MESSAGES } from '@/api/errors';
import type { ClientList, ClientListStatus, ClientRow } from '@/api/schemas/clients';
import { useCan } from '@/auth/permissions';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FilterChips } from '@/components/FilterChips';
import { SearchField } from '@/components/form/SearchField';
import { ScreenList } from '@/components/ScreenList';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { InlineLoader } from '@/loader/InlineLoader';
import type { SegmentChrome } from '@/modules/customers/segments/types';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';

import { ClientListSkeleton } from './list/ClientListSkeleton';
import { ClientRowCard } from './list/ClientRowCard';
import { ClientStatsRow, type StatFilter } from './list/ClientStatsRow';
import { LIST_STATUS_CHIPS } from './list/labels';
import { ViewFilterChip } from './list/ViewFilterChip';
import { VIEW_INFO, type ClientsView } from './list/views';

const EMPTY = 'No clients here yet. Paid checkouts create them automatically, or add one by hand.';
const NO_MATCH = 'No clients match these filters.';

const openClient = (row: ClientRow) => router.push({ pathname: '/clients/[id]', params: { id: row.id } });
const rowKey = (row: ClientRow) => row.id;
const Gap = () => <View style={styles.gap} />;

/** Rows of every loaded page, once each (a client touched between page loads can shift pages). */
function rowsOf(pages: readonly ClientList[] | undefined): ClientRow[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: ClientRow[] = [];
  for (const page of pages) {
    for (const row of page.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

export type ClientsSegmentProps = {
  chrome: SegmentChrome;
  /** Quick filter from the route (Home's "Needs you" cards, or a stat card here). */
  view: ClientsView | null;
  onViewChange: (view: ClientsView | null) => void;
};

/**
 * The Clients list (brief 8.5, GET /clients): stat cards, search (server side,
 * debounced), status chips (Active by default), the Test toggle (only with
 * `testdata.view`), a
 * quick filter from Home, and row cards with infinite scroll. A failed read is
 * an ErrorState with Retry, never an empty list; cached rows stay on screen
 * offline under the banner.
 */
export function ClientsSegment({ chrome, view, onViewChange }: ClientsSegmentProps) {
  const canTest = useCan('testdata.view');
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();

  const [statusChoice, setStatusChoice] = useState<ClientListStatus | null>(null);
  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState('');
  const [testOn, setTestOn] = useState(false);

  // A new quick filter (from Home or a stat card) starts clean: no old chip or search hiding its rows.
  const [seenView, setSeenView] = useState(view);
  if (view !== seenView) {
    setSeenView(view);
    if (view) {
      setStatusChoice(null);
      setSearchText('');
      setQ('');
    }
  }

  const viewInfo = view ? VIEW_INFO[view] : null;
  // With a quick filter the list spans every status, like the Home count it came from.
  const status: ClientListStatus = statusChoice ?? (view ? 'all' : 'active');
  const params: ClientListParams = { status, q, includeTest: canTest && testOn, attention: viewInfo?.attention ?? null };

  const list = useInfiniteQuery({ ...clientsInfiniteQuery(params), placeholderData: keepPreviousData });
  const meta = useQuery(clientsMetaQuery());
  useRefreshOnFocus([clientKeys.lists(), sessionKeys.meta]);

  const pages = list.data?.pages;
  // Offline with nothing cached for these filters the read waits for the connection: say so, not a skeleton
  // that never ends, and not the previous filters' rows (a placeholder reports success, not pending).
  const pausedWithoutData = (list.isPending || list.isPlaceholderData) && list.fetchStatus === 'paused';
  const rows = pausedWithoutData ? [] : rowsOf(pages);
  const hasData = list.data !== undefined && !pausedWithoutData;
  const firstPageCount = pages?.[0]?.items.length ?? 0;
  const filtered = status !== 'active' || q !== '' || view !== null;

  const clearFilters = () => {
    setStatusChoice(null);
    setSearchText('');
    setQ('');
    if (view) onViewChange(null);
  };

  const applyStat = (filter: StatFilter) => {
    if (filter.kind === 'view') {
      onViewChange(filter.view);
      return;
    }
    setStatusChoice(filter.status);
    if (view) onViewChange(null);
  };

  const loadMore = () => {
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) void list.fetchNextPage();
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<ClientRow>) => (
    <ClientRowCard row={item} meta={meta.data} onPress={openClient} index={index} still={reduceMotion || index >= firstPageCount} />
  );

  const header = (
    <View>
      {chrome.switcher}
      {(list.isError && !hasData) || pausedWithoutData ? null : <ClientStatsRow stats={pages?.[0]?.stats} loading={list.isPending} onFilter={applyStat} />}
      <View style={styles.searchRow}>
        <SearchField
          value={searchText}
          onChangeText={setSearchText}
          onChangeDebounced={(text) => setQ(text.trim())}
          debounceMs={300}
          placeholder="Search business or email"
          accessibilityLabel="Search clients by business name or email"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          containerStyle={styles.search}
        />
        {canTest ? <Chip label="Test" icon={FlaskConical} role="checkbox" selected={testOn} onPress={() => setTestOn((on) => !on)} /> : null}
      </View>
      <FilterChips
        items={LIST_STATUS_CHIPS}
        value={status}
        onChange={(next) => {
          if (next) setStatusChoice(next);
        }}
        accessibilityLabel="Client status"
      />
      {viewInfo ? (
        <View style={styles.gutter}>
          <ViewFilterChip info={viewInfo} onClear={() => onViewChange(null)} />
        </View>
      ) : null}
      {list.isRefetchError && hasData && online ? (
        <ErrorState compact error={list.error} onRetry={() => list.refetch()} />
      ) : null}
      <View style={styles.headerEnd} />
    </View>
  );

  const empty = pausedWithoutData ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => list.refetch() : undefined} />
  ) : list.isPending ? (
    <ClientListSkeleton />
  ) : list.isError && !hasData ? (
    <ErrorState error={list.error} onRetry={() => list.refetch()} />
  ) : filtered ? (
    <EmptyState message={NO_MATCH} action={{ label: 'Clear filters', onPress: clearFilters }} />
  ) : (
    <EmptyState message={EMPTY} />
  );

  const footer = (
    <View>
      {list.isFetchingNextPage ? (
        <View style={styles.more} accessible accessibilityLabel="Loading more clients">
          <InlineLoader />
        </View>
      ) : null}
      {list.isFetchNextPageError ? <ErrorState compact error={list.error} onRetry={() => list.fetchNextPage()} /> : null}
      <View style={{ height: chrome.fabClearance }} />
    </View>
  );

  return (
    <ScreenList<ClientRow>
      {...chrome.screen}
      data={rows}
      renderItem={renderItem}
      keyExtractor={rowKey}
      extraData={meta.data}
      ItemSeparatorComponent={Gap}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      onRefresh={() => Promise.all([list.refetch(), meta.refetch()])}
      refetching={list.isFetching && !list.isFetchingNextPage && hasData}
      queryKey={clientKeys.list(params)}
    />
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter, marginTop: space[2] },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: layout.gutter,
    marginTop: space[5],
    marginBottom: space[2],
  },
  search: { flex: 1 },
  headerEnd: { height: space[4] },
  gap: { height: space[3] },
  more: { alignItems: 'center', justifyContent: 'center', height: 56 },
});
