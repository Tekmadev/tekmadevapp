import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';

/**
 * Row cards while the first page loads, shaped like SubmissionRowCard (tool
 * and time, name, business, email, the 2 by 2 cells, the Delivered badges)
 * so nothing moves when the rows arrive. Shows only after showAfterMs.
 */
export function SubmissionListSkeleton({ rows = 3 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <SkeletonGroup style={styles.list}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.top}>
            <Skeleton width="50%" height={10} />
            <Skeleton width={48} height={10} />
          </View>
          <Skeleton width="45%" height={16} style={styles.name} />
          <Skeleton width="38%" />
          <Skeleton width="52%" />
          <View style={styles.grid}>
            {[0, 1, 2, 3].map((c) => (
              <View key={c} style={styles.cell}>
                <Skeleton width="55%" height={10} />
                <Skeleton width="60%" />
              </View>
            ))}
          </View>
          <View style={styles.badges}>
            <Skeleton width={64} height={10} />
            <Skeleton width={52} height={22} style={styles.pill} />
            <Skeleton width={44} height={22} style={styles.pill} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: layout.gutter, gap: space[3] },
  card: { borderWidth: 1, borderRadius: radius.card, padding: space[4], gap: space[2] },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { marginTop: space[1] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space[4], columnGap: space[3], marginTop: space[3] },
  cell: { flexBasis: '46%', flexGrow: 1, gap: space[2] },
  badges: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[3] },
  pill: { borderRadius: radius.pill },
});
