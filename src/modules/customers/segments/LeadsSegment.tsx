import type { ListRenderItemInfo } from '@shopify/flash-list';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { leadFormsQuery, leadKeys, leadsInfiniteQuery, leadsMetaQuery, type LeadListParams } from '@/api/endpoints/leads';
import { sessionKeys } from '@/api/endpoints/session';
import { MESSAGES } from '@/api/errors';
import type { Lead, LeadNeed, LeadSource, LeadStatus } from '@/api/schemas/leads';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { useReduceMotion } from '@/design/motion';
import { space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { InlineLoader } from '@/loader/InlineLoader';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { LeadFilters } from '@/modules/leads/LeadFilters';
import { LeadFormsSection } from '@/modules/leads/LeadFormsSection';
import { LeadListSkeleton, ROW_DIVIDER_INSET } from '@/modules/leads/LeadListSkeleton';
import { LeadRow } from '@/modules/leads/LeadRow';
import { hasFilters, showsLeadForms, toLeadsView, uniqueById, VIEW_INFO } from '@/modules/leads/logic';
import { useMinuteClock } from '@/modules/overview/hooks';

import type { SegmentProps } from './types';

/** Brief 8.6 empty copy, exact. */
const EMPTY = 'No leads yet. Lead forms, booked calls, free tool submissions and portal sign-ups appear here.';
const NO_MATCH = 'No leads match these filters.';

const rowKey = (lead: Lead) => lead.id;
const Separator = () => <Divider inset={ROW_DIVIDER_INSET} />;
const clearView = () => router.setParams({ view: undefined });

/**
 * The Leads segment of the Customers tab (brief 8.6, GET /leads): server-side
 * search and filters (source, status, need), "Lead forms" on top while the
 * filters include them, then every lead with infinite scroll. Home's "Booked
 * calls" card opens it with `view=booked`: the booked status as a removable
 * chip. A failed read is an ErrorState with Retry, never an empty list; cached
 * rows stay on screen offline under the banner.
 */
export function LeadsSegment({ chrome, params }: SegmentProps) {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const now = useMinuteClock();

  const view = toLeadsView(params.view);
  const viewInfo = view ? VIEW_INFO[view] : null;

  const [source, setSource] = useState<LeadSource | null>(null);
  const [statusChoice, setStatusChoice] = useState<LeadStatus | null>(null);
  const [need, setNeed] = useState<LeadNeed | null>(null);
  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState('');

  // A quick filter from Home starts clean: no old chip or search hiding the rows it counted.
  const [seenView, setSeenView] = useState(view);
  if (view !== seenView) {
    setSeenView(view);
    if (view) {
      setSource(null);
      setStatusChoice(null);
      setNeed(null);
      setSearchText('');
      setQ('');
    }
  }

  const status = viewInfo?.status ?? statusChoice;
  const listParams: LeadListParams = { q, source, status, need };
  const formsOn = showsLeadForms(source);

  const list = useInfiniteQuery({ ...leadsInfiniteQuery(listParams), placeholderData: keepPreviousData });
  const forms = useQuery({ ...leadFormsQuery({ q, status, need }), enabled: formsOn, placeholderData: keepPreviousData });
  const meta = useQuery(leadsMetaQuery());
  useRefreshOnFocus([leadKeys.lists(), sessionKeys.meta]);

  // Offline with nothing cached for these filters the read waits for the connection: say so, not a
  // skeleton that never ends, and not the previous filters' rows (a placeholder reports success, not pending).
  const pausedWithoutData = (list.isPending || list.isPlaceholderData) && list.fetchStatus === 'paused';
  const hasData = list.data !== undefined && !pausedWithoutData;
  const formsPaused = (forms.isPending || forms.isPlaceholderData) && forms.fetchStatus === 'paused';
  // The rows wait for "Lead forms" too, so the section never lands on top of rows already showing.
  const formsWaiting = formsOn && forms.isPending && !formsPaused;
  const loading = list.isPending || formsWaiting;
  const rows = loading || pausedWithoutData ? [] : uniqueById(list.data?.pages);
  const firstPageCount = list.data?.pages[0]?.items.length ?? 0;
  const filtered = hasFilters({ source, status, need, q }) || view !== null;

  /* ---------- filters ---------- */

  const changeStatus = (next: LeadStatus | null) => {
    if (view) clearView();
    setStatusChoice(next);
  };
  const clearChips = () => {
    setSource(null);
    setStatusChoice(null);
    setNeed(null);
    if (view) clearView();
  };
  const clearFilters = () => {
    clearChips();
    setSearchText('');
    setQ('');
  };

  /* ---------- rows ---------- */

  // The row is the full lead: the detail opens on it at once, then loads the record.
  const openLead = (lead: Lead, updatedAt: number) => {
    const key = leadKeys.detail(lead.id);
    const cached = queryClient.getQueryState(key);
    if (cached?.data === undefined || cached.dataUpdatedAt < updatedAt) queryClient.setQueryData(key, lead, { updatedAt });
    router.push({ pathname: '/leads/[id]', params: { id: lead.id } });
  };
  const openFromList = (lead: Lead) => openLead(lead, list.dataUpdatedAt);
  const openFromForms = (lead: Lead) => openLead(lead, forms.dataUpdatedAt);

  const loadMore = () => {
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) void list.fetchNextPage();
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<Lead>) => (
    <LeadRow lead={item} meta={meta.data} now={now} onPress={openFromList} index={index} still={reduceMotion || index >= firstPageCount} />
  );

  /* ---------- states ---------- */

  const formsFailed = (forms.isError && forms.data === undefined) || formsPaused;

  const header = (
    <View>
      {chrome.switcher}
      <LeadFilters
        meta={meta.data}
        searchText={searchText}
        onSearchText={setSearchText}
        onSearch={setQ}
        source={source}
        status={status}
        need={need}
        onSource={setSource}
        onStatus={changeStatus}
        onNeed={setNeed}
        view={viewInfo}
        onClearView={clearView}
        onClearChips={clearChips}
      />
      {list.isRefetchError && hasData && online ? (
        <ErrorState compact error={list.error} onRetry={() => list.refetch()} style={styles.refetchError} />
      ) : null}
      {formsOn && rows.length > 0 ? (
        <LeadFormsSection
          page={forms.data}
          failed={formsFailed}
          error={forms.error}
          offline={formsPaused}
          onRetry={() => forms.refetch()}
          meta={meta.data}
          now={now}
          onOpen={openFromForms}
          still={reduceMotion}
          onViewAll={() => setSource('grow')}
        />
      ) : null}
      <View style={styles.headerEnd} />
    </View>
  );

  const empty = pausedWithoutData ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => list.refetch() : undefined} />
  ) : loading ? (
    <LeadListSkeleton />
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
        <View style={styles.more} accessible accessibilityRole="progressbar" accessibilityLabel="Loading more leads">
          <InlineLoader />
        </View>
      ) : null}
      {list.isFetchNextPageError ? <ErrorState compact error={list.error} onRetry={() => list.fetchNextPage()} /> : null}
      <View style={{ height: chrome.fabClearance }} />
    </View>
  );

  const refresh = () => Promise.all([list.refetch(), formsOn ? forms.refetch() : null, meta.refetch()]);
  const refetching =
    (list.isFetching && !list.isFetchingNextPage && hasData) || (formsOn && forms.isFetching && forms.data !== undefined);

  return (
    <ScreenList<Lead>
      {...chrome.screen}
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
      onRefresh={refresh}
      refetching={refetching}
      queryKey={leadKeys.list(listParams)}
    />
  );
}

const styles = StyleSheet.create({
  refetchError: { marginTop: space[3] },
  headerEnd: { height: space[3] },
  more: { alignItems: 'center', justifyContent: 'center', height: 56 },
});
