import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { radius, space } from '@/design/tokens';

/**
 * The lead while its first load runs (shown only after showAfterMs): badges,
 * the four contact actions, the main button (left out for people who cannot
 * create a client) and the Details card, at roughly their real sizes.
 */
export function LeadDetailSkeleton({ withTitle, withButton = true }: { withTitle: boolean; withButton?: boolean }) {
  return (
    <SkeletonGroup style={styles.wrap}>
      {withTitle ? null : <Skeleton width="62%" height={34} style={styles.title} />}
      <View style={styles.row}>
        <Skeleton width={84} height={28} style={styles.pill} />
        <Skeleton width={104} height={28} style={styles.pill} />
      </View>
      <View style={[styles.row, styles.actions]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.action}>
            <Skeleton shape="circle" size={52} />
            <Skeleton width={36} height={12} />
          </View>
        ))}
      </View>
      {withButton ? <Skeleton height={48} style={styles.pill} /> : null}
      <Skeleton width="30%" height={22} style={styles.sectionTitle} />
      <Skeleton shape="block" height={232} style={styles.card} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[4] },
  title: { marginBottom: space[2] },
  row: { flexDirection: 'row', gap: space[2], alignItems: 'center' },
  actions: { justifyContent: 'space-between', marginTop: space[2] },
  action: { flex: 1, alignItems: 'center', gap: space[2] },
  pill: { borderRadius: radius.pill },
  card: { borderRadius: radius.card },
  sectionTitle: { marginTop: space[4] },
});
