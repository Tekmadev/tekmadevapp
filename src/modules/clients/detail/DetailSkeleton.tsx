import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { radius, space } from '@/design/tokens';

/**
 * Client detail while the first load runs (shown only after showAfterMs):
 * the contact line, badges, the two actions, the 2 by 2 stat cards, the tab
 * row and the start of a section, at roughly their real sizes.
 */
export function DetailSkeleton({ withTitle }: { withTitle: boolean }) {
  return (
    <SkeletonGroup style={styles.wrap}>
      {withTitle ? null : <Skeleton width="62%" height={34} style={styles.title} />}
      <Skeleton width="78%" height={14} />
      <View style={styles.row}>
        <Skeleton width={104} height={28} style={styles.pill} />
        <Skeleton width={72} height={28} style={styles.pill} />
      </View>
      <View style={styles.row}>
        <Skeleton height={48} style={[styles.pill, styles.flex]} />
        <Skeleton height={48} style={[styles.pill, styles.flex]} />
      </View>
      <View style={styles.grid}>
        <View style={styles.row}>
          <Skeleton shape="block" height={112} style={[styles.card, styles.flex]} />
          <Skeleton shape="block" height={112} style={[styles.card, styles.flex]} />
        </View>
        <View style={styles.row}>
          <Skeleton shape="block" height={112} style={[styles.card, styles.flex]} />
          <Skeleton shape="block" height={112} style={[styles.card, styles.flex]} />
        </View>
      </View>
      <View style={styles.row}>
        <Skeleton width={84} height={14} />
        <Skeleton width={56} height={14} />
        <Skeleton width={64} height={14} />
        <Skeleton width={48} height={14} />
      </View>
      <Skeleton width="40%" height={22} style={styles.sectionTitle} />
      <Skeleton shape="block" height={160} style={styles.card} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[4] },
  title: { marginBottom: space[2] },
  row: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
  grid: { gap: space[3], marginTop: space[1] },
  flex: { flex: 1 },
  pill: { borderRadius: radius.pill },
  card: { borderRadius: radius.card },
  sectionTitle: { marginTop: space[4] },
});
