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
import { useCan } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
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
import { DISABLED_TOAST, EMPTY_COPY, EMPTY_COPY_READ_ONLY, type CouponAccess } from './logic';
import { NewCouponSheet, type NewCouponSheetProps } from './NewCouponSheet';

type CouponsParams = { action?: string | string[] };

const couponKey = (c: Coupon) => c.id;
const firstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Coupons (brief 8.13, `coupons.view`): every coupon, newest first, with "New
 * coupon" above the list. `action=new` (the "New coupon" quick action) opens
 * the sheet once and is then cleared from the route. Cached coupons show at
 * once and refresh on focus, on app resume and on a pull. New coupon and
 * Disable need `coupons.write`; Copy deal link and Share need
 * `coupons.share` (staff: view and share only).
 */
export function CouponsScreen() {
  return (
    <RequireCapability cap="coupons.view">
      <CouponsBody />
    </RequireCapability>
  );
}

function CouponsBody() {
  const params = useLocalSearchParams<CouponsParams>();
  const action = firstParam(params.action);
  const online = useIsOnline();
  const now = useMinuteClock();
  const reduceMotion = useReduceMotion();
  const canWrite = useCan('coupons.write');
  const canShare = useCan('coupons.share');
  const access: CouponAccess = { canShare, canWrite };
  const query = useQuery(couponsQuery());
  const meta = useQuery(metaQuery());
  const upsert = useCouponsCache();
  const { data, refetch, dataUpdatedAt } = query;
  useRefetchOnFocus(refetch, dataUpdatedAt);
  // Rows pull in only on a first load with nothing cached.
  const [animate] = useState(() => data === undefined);

  // The quick action opens the sheet once; the param is then cleared so going back and forth never reopens it.
  const [creating, setCreating] = useState(action === 'new' && canWrite);
  const [seenAction, setSeenAction] = useState(action);
  if (action !== seenAction) {
    setSeenAction(action);
    if (action === 'new' && canWrite) setCreating(true);
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
    <CouponItem
      coupon={item}
      index={index}
      meta={meta.data}
      now={now}
      online={online}
      access={access}
      animate={animate && !reduceMotion}
      onDisable={askDisable}
    />
  );

  const header = canWrite ? (
    <View style={styles.header}>
      <Button label="New coupon" icon={Plus} onPress={() => setCreating(true)} accessibilityHint="Opens the new coupon form" />
    </View>
  ) : null;

  let empty: ReactNode;
  if (data) {
    empty = <EmptyState message={canWrite ? EMPTY_COPY : EMPTY_COPY_READ_ONLY} />;
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
        extraData={[meta.data, now, online, canWrite, canShare]}
        ListHeaderComponent={header}
        ListEmptyComponent={<View style={styles.gutter}>{empty}</View>}
        ListFooterComponent={<View style={styles.footer} />}
        onRefresh={onRefresh}
        refetching={query.isFetching && data !== undefined}
        offlineBanner={data !== undefined}
        queryKey={couponKeys.list()}
      />
      {creating && canWrite ? (
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
  access: CouponAccess;
  animate: boolean;
  onDisable: (coupon: Coupon) => void;
};

function CouponItem({ coupon, index, meta, now, online, access, animate, onDisable }: ItemProps) {
  return (
    <Animated.View entering={animate && index < STAGGER_MAX ? enterPull(index) : undefined} style={styles.item}>
      <CouponCard coupon={coupon} meta={meta} now={now} online={online} access={access} onDisable={onDisable} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', marginBottom: space[4] },
  gutter: { paddingHorizontal: layout.gutter },
  item: { paddingHorizontal: layout.gutter, paddingBottom: space[3] },
  footer: { height: space[8] },
});
