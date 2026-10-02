import type { ListRenderItemInfo } from '@shopify/flash-list';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { emailKeys, emailMetaQuery, subscribersInfiniteQuery, type SubscriberListParams } from '@/api/endpoints/email';
import { sessionKeys } from '@/api/endpoints/session';
import { MESSAGES } from '@/api/errors';
import { SUBSCRIBER_STATUSES, type Subscriber, type SubscriberStatus } from '@/api/schemas/email';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FilterChips, type FilterChipItem } from '@/components/FilterChips';
import { SearchField } from '@/components/form/SearchField';
import { ScreenList } from '@/components/ScreenList';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { InlineLoader } from '@/loader/InlineLoader';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { useMinuteClock } from '@/modules/overview/hooks';

import { SubscriberListSkeleton } from './components/EmailSkeleton';
import { SubscriberRow } from './components/SubscriberRow';
import { subscriberStatusBadge, uniqueById } from './logic';

const EMPTY = 'No subscribers yet. Website signups appear here.';
const NO_MATCH = 'No subscribers match this search.';

/** "All" chip (no status enum uses this value). */
const ALL = 'all';
type StatusChip = SubscriberStatus | typeof ALL;

const rowKey = (s: Subscriber) => s.id;
const Separator = () => <Divider inset={layout.gutter} />;
const openSubscriber = (s: Subscriber) => router.push({ pathname: '/email/subscriber/[id]', params: { id: s.id } });

/**
 * Subscribers (brief 8.11, GET /email/subscribers): server search on the
 * email and a status filter, newest signup first, infinite scroll with each
 * subscriber once. A row opens the subscriber (consent history, Inspect in
 * CRM, Unsubscribe, permanent erasure). A failed read is an ErrorState, never
 * an empty list; cached rows stay on screen offline under the banner.
 */
export function SubscribersScreen() {
  return (
    <OwnerOnly>
      <SubscribersBody />
    </OwnerOnly>
  );
}

function SubscribersBody() {
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const now = useMinuteClock();
  const meta = useQuery(emailMetaQuery());

  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<SubscriberStatus | null>(null);

  const params: SubscriberListParams = { q, status };
  const list = useInfiniteQuery({ ...subscribersInfiniteQuery(params), placeholderData: keepPreviousData });
  useRefreshOnFocus([emailKeys.subscriberLists(), sessionKeys.meta]);

  // Offline with nothing cached for this search: say so, not the previous search's rows (a placeholder reports success).
  const pausedWithoutData = (list.isPending || list.isPlaceholderData) && list.fetchStatus === 'paused';
  const hasData = list.data !== undefined && !pausedWithoutData;
  const rows = pausedWithoutData ? [] : uniqueById(list.data?.pages);
  const firstPageCount = list.data?.pages[0]?.items.length ?? 0;
  const filtered = q !== '' || status !== null;

  const chips: FilterChipItem<StatusChip>[] = [
    { value: ALL, label: 'All' },
    ...SUBSCRIBER_STATUSES.map((s) => ({ value: s, label: subscriberStatusBadge(meta.data, s).label })),
  ];

  const clearFilters = () => {
    setSearchText('');
    setQ('');
    setStatus(null);
  };

  const loadMore = () => {
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) void list.fetchNextPage();
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<Subscriber>) => (
    <SubscriberRow subscriber={item} meta={meta.data} now={now} onPress={openSubscriber} index={index} still={reduceMotion || index >= firstPageCount} />
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.gutter}>
        <SearchField
          value={searchText}
          onChangeText={setSearchText}
          onChangeDebounced={(text) => setQ(text.trim())}
          debounceMs={300}
          placeholder="Search email"
          accessibilityLabel="Search subscribers by email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="search"
        />
      </View>
      <FilterChips<StatusChip>
        items={chips}
        value={status ?? ALL}
        onChange={(v) => setStatus(v === null || v === ALL ? null : v)}
        accessibilityLabel="Subscriber status"
        style={styles.chips}
      />
      {list.isRefetchError && hasData && online ? (
        <View style={styles.gutter}>
          <ErrorState compact error={list.error} onRetry={() => list.refetch()} />
        </View>
      ) : null}
    </View>
  );

  const empty = pausedWithoutData ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => list.refetch() : undefined} style={styles.gutter} />
  ) : list.isPending ? (
    <SubscriberListSkeleton />
  ) : list.isError && !hasData ? (
    <ErrorState error={list.error} onRetry={() => list.refetch()} style={styles.gutter} />
  ) : filtered ? (
    <EmptyState message={NO_MATCH} action={{ label: 'Clear filters', onPress: clearFilters }} style={styles.gutter} />
  ) : (
    <EmptyState message={EMPTY} style={styles.gutter} />
  );

  const footer = (
    <View>
      {list.isFetchingNextPage ? (
        <View style={styles.more} accessible accessibilityRole="progressbar" accessibilityLabel="Loading more subscribers">
          <InlineLoader />
        </View>
      ) : null}
      {list.isFetchNextPageError ? (
        <View style={styles.gutter}>
          <ErrorState compact error={list.error} onRetry={() => list.fetchNextPage()} />
        </View>
      ) : null}
      <View style={styles.end} />
    </View>
  );

  return (
    <ScreenList<Subscriber>
      title="Subscribers"
      back
      data={rows}
      renderItem={renderItem}
      keyExtractor={rowKey}
      extraData={{ meta: meta.data, now }}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      onRefresh={() => Promise.all([list.refetch(), meta.refetch()])}
      refetching={list.isFetching && !list.isFetchingNextPage && hasData}
      queryKey={emailKeys.subscriberList(params)}
    />
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: space[2] },
  gutter: { paddingHorizontal: layout.gutter },
  chips: { marginTop: space[3], marginBottom: space[2] },
  more: { alignItems: 'center', justifyContent: 'center', height: 56 },
  end: { height: space[6] },
});
