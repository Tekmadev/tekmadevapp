import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { couponKeys, couponsQuery, disableCoupon } from '@/api/endpoints/coupons';
import { errorMessage, MESSAGES } from '@/api/errors';
import type { Coupon, CouponsMeta } from '@/api/schemas/coupons';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { metaQuery, useMinuteClock, useRefetchOnFocus } from '@/modules/overview/hooks';

import { CouponCard } from './CouponCard';
import { CouponsSkeleton } from './CouponsSkeleton';
import { useCouponsCache } from './hooks';
import { DISABLED_TOAST, EMPTY_COPY } from './logic';
import { NewCouponSheet, type NewCouponSheetProps } from './NewCouponSheet';

type CouponsParams = { action?: string | string[] };

const couponKey = (c: Coupon) => c.id;
const firstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Coupons (brief 8.13, owner only): every coupon, newest first, with "New
 * coupon" above the list. `action=new` (the "New coupon" quick action) opens
 * the sheet once and is then cleared from the route. Cached coupons show at
 * once and refresh on focus, on app resume and on a pull.
 */
export function CouponsScreen() {
  return (
    <OwnerOnly>
      <CouponsBody />
    </OwnerOnly>
  );
}

function CouponsBody() {
  const params = useLocalSearchParams<CouponsParams>();
  const action = firstParam(params.action);
  const online = useIsOnline();
  const now = useMinuteClock();
  const reduceMotion = useReduceMotion();
  const query = useQuery(couponsQuery());
  const meta = useQuery(metaQuery());
  const upsert = useCouponsCache();
  const { data, refetch, dataUpdatedAt } = query;
  useRefetchOnFocus(refetch, dataUpdatedAt);
  // Rows pull in only on a first load with nothing cached.
  const [animate] = useState(() => data === undefined);

  // The quick action opens the sheet once; the param is then cleared so going back and forth never reopens it.
  const [creating, setCreating] = useState(action === 'new');
  const [seenAction, setSeenAction] = useState(action);
  if (action !== seenAction) {
    setSeenAction(action);
    if (action === 'new') setCreating(true);
  }
  useEffect(() => {
    if (action === 'new') router.setParams({ action: undefined });
  }, [action]);

  // The coupon being disabled stays set while the confirm sheet slides away, so its copy does not blank.
  const [target, setTarget] = useState<Coupon | null>(null);
  const [confirming, setConfirming] = useState(false);
  const askDisable = (coupon: Coupon) => {
    setTarget(coupon);
    setConfirming(true);
  };
  const disable = async () => {
    if (!target) return;
    const updated = await disableCoupon(target.id);
    upsert(updated);
    notice.ok(DISABLED_TOAST);
  };

  const waitingOffline = query.isPending && query.fetchStatus === 'paused';

  const onRefresh = async () => {
    // Offline a refetch would wait for the connection with the black hole spinning; the banner already explains.
    if (!connectivity.isOnline()) return;
    const [result] = await Promise.all([refetch(), meta.refetch()]);
    if (result.isError && result.data !== undefined && connectivity.isOnline()) notice.err(errorMessage(result.error));
  };

  let metaState: NewCouponSheetProps['metaState'];
  if (meta.isError) metaState = { status: 'error', error: meta.error };
  else if (meta.isPending && meta.fetchStatus === 'paused') metaState = { status: 'offline' };
  else metaState = { status: 'loading' };

  const renderItem = ({ item, index }: ListRenderItemInfo<Coupon>) => (
    <CouponItem coupon={item} index={index} meta={meta.data} now={now} online={online} animate={animate && !reduceMotion} onDisable={askDisable} />
  );

  const header = (
    <View style={styles.header}>
      <Button label="New coupon" icon={Plus} onPress={() => setCreating(true)} accessibilityHint="Opens the new coupon form" />
    </View>
  );

  let empty: ReactNode;
  if (data) {
    empty = <EmptyState message={EMPTY_COPY} />;
  } else if (waitingOffline) {
    empty = <ErrorState message={MESSAGES.network} onRetry={online ? () => refetch() : undefined} />;
  } else if (query.isError) {
    empty = <ErrorState error={query.error} onRetry={() => refetch()} />;
  } else {
    empty = <CouponsSkeleton />;
  }

  return (
    <>
      <ScreenList<Coupon>
        title="Coupons"
        back
        data={data ?? []}
        renderItem={renderItem}
        keyExtractor={couponKey}
        extraData={[meta.data, now, online]}
        ListHeaderComponent={header}
        ListEmptyComponent={<View style={styles.gutter}>{empty}</View>}
        ListFooterComponent={<View style={styles.footer} />}
        onRefresh={onRefresh}
        refetching={query.isFetching && data !== undefined}
        offlineBanner={data !== undefined}
        queryKey={couponKeys.list()}
      />
      {creating ? (
        <NewCouponSheet meta={meta.data} metaState={metaState} onRetryMeta={() => meta.refetch()} onClose={() => setCreating(false)} />
      ) : null}
      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={target ? `Disable ${target.code}?` : 'Disable this coupon?'}
        message="It stops working at checkout right away. There is no way to turn it back on."
        confirmLabel="Hold to disable"
        pendingLabel="Disabling"
        onConfirm={disable}
      />
    </>
  );
}

type ItemProps = {
  coupon: Coupon;
  index: number;
  meta: CouponsMeta | undefined;
  now: Date;
  online: boolean;
  animate: boolean;
  onDisable: (coupon: Coupon) => void;
};

function CouponItem({ coupon, index, meta, now, online, animate, onDisable }: ItemProps) {
  return (
    <Animated.View entering={animate && index < STAGGER_MAX ? enterPull(index) : undefined} style={styles.item}>
      <CouponCard coupon={coupon} meta={meta} now={now} online={online} onDisable={onDisable} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', marginBottom: space[4] },
  gutter: { paddingHorizontal: layout.gutter },
  item: { paddingHorizontal: layout.gutter, paddingBottom: space[3] },
  footer: { height: space[8] },
});
