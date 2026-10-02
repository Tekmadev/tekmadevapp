import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { space } from '@/design/tokens';

/** One coupon card's shape: code and badge, discount, scope, the three facts and the actions. */
function CardSkeleton() {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Skeleton width="45%" height={18} />
        <Skeleton width={56} height={22} />
      </View>
      <View style={styles.what}>
        <Skeleton width="30%" height={18} />
        <Skeleton width="55%" />
      </View>
      <View style={styles.row}>
        <Skeleton width="25%" height={30} />
        <Skeleton width="25%" height={30} />
        <Skeleton width="25%" height={30} />
      </View>
      <Skeleton shape="block" height={40} />
    </Card>
  );
}

/** The Coupons list while it loads for the first time (after `showAfterMs`). */
export function CouponsSkeleton() {
  return (
    <SkeletonGroup style={styles.list}>
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[3] },
  card: { gap: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  what: { gap: space[2] },
});
