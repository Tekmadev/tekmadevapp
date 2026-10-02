import type { ListRenderItemInfo } from '@shopify/flash-list';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { blogKeys, postsInfiniteQuery, type PostListParams } from '@/api/endpoints/blog';
import { sessionKeys } from '@/api/endpoints/session';
import { MESSAGES } from '@/api/errors';
import type { PostRow as Row } from '@/api/schemas/blog';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FilterChips } from '@/components/FilterChips';
import { SearchField } from '@/components/form/SearchField';
import { ScreenList } from '@/components/ScreenList';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { InlineLoader } from '@/loader/InlineLoader';
import { BLOG_COPY, rowsOf, statusFilterItems, type StatusFilter } from '@/modules/blog/list/logic';
import { PostListSkeleton } from '@/modules/blog/list/PostListSkeleton';
import { PostRow } from '@/modules/blog/list/PostRow';
import { blogMetaQuery } from '@/modules/blog/list/queries';
import { usePostActions } from '@/modules/blog/list/usePostActions';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { useMinuteClock } from '@/modules/overview/hooks';

import type { MarketingSegmentProps } from './types';

const rowKey = (row: Row) => row.id;
const Separator = () => <Divider inset />;
const newPost = () => router.push({ pathname: '/blog/[id]', params: { id: 'new' } });

/**
 * The Blog segment of the Marketing tab (brief 8.11, GET /blog/posts): status
 * chips (All, Draft, In review, Published, Archived), search by title on the
 * server, then every post newest change first with infinite scroll. Tap opens
 * the editor; swipe or long press for Publish / Unpublish, View live, Share
 * link and Move to trash. A failed read is an ErrorState with Retry, never an
 * empty list; cached rows stay on screen offline under the banner.
 */
export function BlogSegment({ chrome }: MarketingSegmentProps) {
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const now = useMinuteClock();

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState('');

  const listParams: PostListParams = { status: filter === 'all' ? null : filter, q };
  const list = useInfiniteQuery({ ...postsInfiniteQuery(listParams), placeholderData: keepPreviousData });
  const meta = useQuery(blogMetaQuery());
  useRefreshOnFocus([blogKeys.lists(), sessionKeys.meta]);
  const actions = usePostActions(meta.data);

  // Offline with nothing cached for this filter the read waits for the connection: say so, not a skeleton
  // that never ends, and not the previous filter's rows (a placeholder reports success, not pending).
  const pausedWithoutData = (list.isPending || list.isPlaceholderData) && list.fetchStatus === 'paused';
  const hasData = list.data !== undefined && !pausedWithoutData;
  const rows = pausedWithoutData ? [] : rowsOf(list.data?.pages);
  const firstPageCount = list.data?.pages[0]?.items.length ?? 0;
  const filtered = filter !== 'all' || q !== '';

  const clearFilters = () => {
    setFilter('all');
    setSearchText('');
    setQ('');
  };

  const loadMore = () => {
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) void list.fetchNextPage();
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<Row>) => (
    <PostRow
      row={item}
      meta={meta.data}
      now={now}
      online={online}
      index={index}
      still={reduceMotion || index >= firstPageCount}
      onPress={actions.open}
      onMore={actions.more}
      onTogglePublish={actions.togglePublish}
      onTrash={actions.trash}
    />
  );

  const header = (
    <View>
      {chrome.switcher}
      <View style={styles.search}>
        <SearchField
          value={searchText}
          onChangeText={setSearchText}
          onChangeDebounced={(text) => setQ(text.trim())}
          debounceMs={300}
          placeholder={BLOG_COPY.searchPlaceholder}
          accessibilityLabel="Search posts by title"
          returnKeyType="search"
        />
      </View>
      <FilterChips
        items={statusFilterItems(meta.data)}
        value={filter}
        onChange={(next) => {
          if (next) setFilter(next);
        }}
        accessibilityLabel="Post status"
      />
      {list.isRefetchError && hasData && online ? (
        <ErrorState compact error={list.error} onRetry={() => list.refetch()} style={styles.refetchError} />
      ) : null}
      <View style={styles.headerEnd} />
    </View>
  );

  const empty = pausedWithoutData ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => list.refetch() : undefined} />
  ) : list.isPending ? (
    <PostListSkeleton />
  ) : list.isError && !hasData ? (
    <ErrorState error={list.error} onRetry={() => list.refetch()} />
  ) : filtered ? (
    <EmptyState message={BLOG_COPY.noMatch} action={{ label: 'Clear filters', onPress: clearFilters }} />
  ) : (
    <EmptyState message={BLOG_COPY.empty} action={{ label: BLOG_COPY.newPost, onPress: newPost, icon: Plus }} />
  );

  const footer = (
    <View>
      {list.isFetchingNextPage ? (
        <View style={styles.more} accessible accessibilityRole="progressbar" accessibilityLabel="Loading more posts">
          <InlineLoader />
        </View>
      ) : null}
      {list.isFetchNextPageError ? <ErrorState compact error={list.error} onRetry={() => list.fetchNextPage()} /> : null}
      <View style={{ height: chrome.fabClearance }} />
    </View>
  );

  return (
    <>
      <ScreenList<Row>
        {...chrome.screen}
        data={rows}
        renderItem={renderItem}
        keyExtractor={rowKey}
        extraData={{ meta: meta.data, now, online }}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        onRefresh={() => Promise.all([list.refetch(), meta.refetch()])}
        refetching={list.isFetching && !list.isFetchingNextPage && hasData}
        queryKey={blogKeys.list(listParams)}
      />
      {actions.sheets}
    </>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: layout.gutter, marginBottom: space[2] },
  refetchError: { marginTop: space[3] },
  headerEnd: { height: space[2] },
  more: { alignItems: 'center', justifyContent: 'center', height: 56 },
});
