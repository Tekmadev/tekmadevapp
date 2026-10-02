import type { ListRenderItemInfo } from '@shopify/flash-list';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { billingKeys, billingMetaQuery, ordersInfiniteQuery, subscriptionsInfiniteQuery } from '@/api/endpoints/billing';
import { sessionKeys } from '@/api/endpoints/session';
import { MESSAGES } from '@/api/errors';
import type { Order, OrderStatus, Subscription, SubscriptionStatus } from '@/api/schemas/billing';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FilterChips } from '@/components/FilterChips';
import { ScreenList } from '@/components/ScreenList';
import { SegmentedControl, type SegmentItem } from '@/components/SegmentedControl';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { InlineLoader } from '@/loader/InlineLoader';
import type { SegmentChrome } from '@/modules/customers/segments/types';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { useMinuteClock } from '@/modules/overview/hooks';

import { BillingListSkeleton } from './BillingListSkeleton';
import { OrderRowCard, SubscriptionRowCard } from './BillingRowCard';
import { BillingSummaryLine } from './BillingSummaryLine';
import {
  BILLING_COPY,
  BILLING_TAB_LABELS,
  BILLING_TABS,
  orderFilterItems,
  pickSummary,
  subscriptionFilterItems,
  uniqueRows,
  type BillingTab,
} from './logic';
import { OrderDetailSheet } from './OrderDetailSheet';
import { SubscriptionDetailSheet } from './SubscriptionDetailSheet';

type Row = { type: 'order'; id: string; order: Order } | { type: 'subscription'; id: string; subscription: Subscription };
/** The tapped row itself, so its sheet stays put even if a refetch drops the row from the loaded pages. */
type Selected = { type: 'order'; order: Order } | { type: 'subscription'; subscription: Subscription };

const TAB_ITEMS: readonly SegmentItem<BillingTab>[] = BILLING_TABS.map((value) => ({ value, label: BILLING_TAB_LABELS[value] }));

const rowKey = (row: Row) => `${row.type}:${row.id}`;
const rowType = (row: Row) => row.type;
const Gap = () => <View style={styles.gap} />;
const openClient = (id: string) => router.push({ pathname: '/clients/[id]', params: { id } });

export type BillingSegmentProps = {
  chrome: SegmentChrome;
  /** One-time orders or Subscriptions (route param `sub`). */
  tab: BillingTab;
  onTabChange: (tab: BillingTab) => void;
};

/**
 * The Subscriptions segment of the Customers tab (brief 8.8): live mode only,
 * One-time orders and Subscriptions under one subtitle with the live totals.
 * Each list pages from the server (newest first, de-duplicated), filters by
 * status, and opens a read-only detail sheet on tap. Money is shown exactly as
 * the server sends it (integer cents), to managers too. A failed read is an
 * ErrorState with Retry, never an empty list; cached rows stay on screen
 * offline under the banner.
 */
export function BillingSegment({ chrome, tab, onTabChange }: BillingSegmentProps) {
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const now = useMinuteClock();

  const [orderStatus, setOrderStatus] = useState<OrderStatus | 'all'>('all');
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | 'all'>('all');
  const [selected, setSelected] = useState<Selected | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const orderParams = { status: orderStatus === 'all' ? null : orderStatus };
  const subParams = { status: subStatus === 'all' ? null : subStatus };
  // Only the tab on screen fetches; the other keeps its cache (and its summary) for a quick switch back.
  const orders = useInfiniteQuery({ ...ordersInfiniteQuery(orderParams), enabled: tab === 'orders', placeholderData: keepPreviousData });
  const subs = useInfiniteQuery({ ...subscriptionsInfiniteQuery(subParams), enabled: tab === 'subscriptions', placeholderData: keepPreviousData });
  const meta = useQuery(billingMetaQuery());
  useRefreshOnFocus([billingKeys.all, sessionKeys.meta]);

  const isOrders = tab === 'orders';
  const list = isOrders ? orders : subs;
  const activeKey = isOrders ? billingKeys.orders(orderParams) : billingKeys.subscriptions(subParams);

  // Offline with nothing cached for this status the read waits for the connection: say so, not a skeleton
  // that never ends, and not the previous status's rows (a placeholder reports success, not pending).
  const pausedWithoutData = (list.isPending || list.isPlaceholderData) && list.fetchStatus === 'paused';
  const hasData = list.data !== undefined && !pausedWithoutData;

  const orderRows = uniqueRows(orders.data?.pages);
  const subRows = uniqueRows(subs.data?.pages);
  const rows: Row[] = pausedWithoutData
    ? []
    : isOrders
    ? orderRows.map((order) => ({ type: 'order', id: order.id, order }))
    : subRows.map((subscription) => ({ type: 'subscription', id: subscription.id, subscription }));

  const firstPageCount = list.data?.pages[0]?.items.length ?? 0;
  const filtered = isOrders ? orderStatus !== 'all' : subStatus !== 'all';

  const summary = pickSummary(
    { summary: orders.data?.pages[0]?.summary, updatedAt: orders.dataUpdatedAt },
    { summary: subs.data?.pages[0]?.summary, updatedAt: subs.dataUpdatedAt },
  );
  const summaryFailed = summary === undefined && ((list.isError && !hasData) || pausedWithoutData);

  // The sheet reads the latest copy of its row, so a refresh while it is open shows through.
  const openOrder = isOrders && selected?.type === 'order' ? (orderRows.find((o) => o.id === selected.order.id) ?? selected.order) : null;
  const openSub =
    !isOrders && selected?.type === 'subscription' ? (subRows.find((s) => s.id === selected.subscription.id) ?? selected.subscription) : null;

  const select = (next: Selected) => {
    setSelected(next);
    setSheetOpen(true);
  };
  const closeSheet = () => setSheetOpen(false);
  const goToClient = (clientId: string) => {
    setSheetOpen(false);
    openClient(clientId);
  };

  const clearFilter = () => (isOrders ? setOrderStatus('all') : setSubStatus('all'));

  const loadMore = () => {
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) void list.fetchNextPage();
  };

  const pressOrder = (order: Order) => select({ type: 'order', order });
  const pressSubscription = (subscription: Subscription) => select({ type: 'subscription', subscription });

  const renderItem = ({ item, index }: ListRenderItemInfo<Row>) => {
    const still = reduceMotion || index >= firstPageCount;
    return item.type === 'order' ? (
      <OrderRowCard order={item.order} meta={meta.data} now={now} index={index} still={still} onPress={pressOrder} />
    ) : (
      <SubscriptionRowCard subscription={item.subscription} meta={meta.data} now={now} index={index} still={still} onPress={pressSubscription} />
    );
  };

  const header = (
    <View>
      {chrome.switcher}
      <View style={styles.gutter}>
        <BillingSummaryLine summary={summary} failed={summaryFailed} />
        <SegmentedControl items={TAB_ITEMS} value={tab} onChange={onTabChange} accessibilityLabel="Orders or subscriptions" style={styles.segments} />
      </View>
      {isOrders ? (
        <FilterChips
          key="orders"
          items={orderFilterItems(meta.data)}
          value={orderStatus}
          onChange={(next) => {
            if (next) setOrderStatus(next);
          }}
          accessibilityLabel="Order status"
          style={styles.chips}
        />
      ) : (
        <FilterChips
          key="subscriptions"
          items={subscriptionFilterItems(meta.data)}
          value={subStatus}
          onChange={(next) => {
            if (next) setSubStatus(next);
          }}
          accessibilityLabel="Subscription status"
          style={styles.chips}
        />
      )}
      {list.isRefetchError && hasData && online ? <ErrorState compact error={list.error} onRetry={() => list.refetch()} /> : null}
      <View style={styles.headerEnd} />
    </View>
  );

  const emptyCopy = isOrders ? BILLING_COPY.emptyOrders : BILLING_COPY.emptySubscriptions;
  const noMatchCopy = isOrders ? BILLING_COPY.noMatchOrders : BILLING_COPY.noMatchSubscriptions;
  const empty = pausedWithoutData ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => list.refetch() : undefined} />
  ) : list.isPending ? (
    <BillingListSkeleton />
  ) : list.isError && !hasData ? (
    <ErrorState error={list.error} onRetry={() => list.refetch()} />
  ) : filtered ? (
    <EmptyState message={noMatchCopy} action={{ label: BILLING_COPY.showAll, onPress: clearFilter }} />
  ) : (
    <EmptyState message={emptyCopy} />
  );

  const footer = (
    <View>
      {list.isFetchingNextPage ? (
        <View style={styles.more} accessible accessibilityLabel={isOrders ? 'Loading more orders' : 'Loading more subscriptions'}>
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
        getItemType={rowType}
        extraData={`${meta.dataUpdatedAt}:${now.getTime()}`}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        onRefresh={() => Promise.all([list.refetch(), meta.refetch()])}
        refetching={list.isFetching && !list.isFetchingNextPage && hasData}
        queryKey={activeKey}
      />
      <OrderDetailSheet order={openOrder} visible={sheetOpen && openOrder !== null} onClose={closeSheet} meta={meta.data} now={now} onOpenClient={goToClient} />
      <SubscriptionDetailSheet
        subscription={openSub}
        visible={sheetOpen && openSub !== null}
        onClose={closeSheet}
        meta={meta.data}
        now={now}
        onOpenClient={goToClient}
      />
    </>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  segments: { marginTop: space[4] },
  chips: { marginTop: space[3] },
  headerEnd: { height: space[4] },
  gap: { height: space[3] },
  more: { alignItems: 'center', justifyContent: 'center', height: 56 },
});
