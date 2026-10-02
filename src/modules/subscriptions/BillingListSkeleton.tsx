import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';

/**
 * Row cards while the first page loads, shaped like BillingRowCard (title and
 * amount, product and badge, one quiet line) so nothing moves when the rows
 * arrive. Shows only after showAfterMs.
 */
export function BillingListSkeleton({ rows = 5 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <SkeletonGroup style={styles.list}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.line}>
            <Skeleton width="55%" height={16} />
            <Skeleton width={64} height={16} />
          </View>
          <View style={styles.line}>
            <Skeleton width="40%" />
            <Skeleton width={72} height={22} />
          </View>
          <View style={styles.foot}>
            <Skeleton width="30%" />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: layout.gutter, gap: space[3] },
  // Same rhythm as BillingRowCard: a 22dp title line, a 22dp badge line and an 18dp foot, 8dp apart.
  card: { borderWidth: 1, borderRadius: radius.card, padding: space[4], gap: space[2] },
  line: { minHeight: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
  foot: { height: 18, justifyContent: 'center' },
});
