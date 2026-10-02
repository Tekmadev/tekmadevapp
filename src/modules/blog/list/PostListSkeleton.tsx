import { StyleSheet, View, type DimensionValue } from 'react-native';

import { Divider } from '@/components/Divider';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { layout, space } from '@/design/tokens';

const TITLE_WIDTHS: DimensionValue[] = ['78%', '64%', '86%', '58%', '72%', '68%', '82%', '60%'];

/**
 * Post rows while the first page loads, shaped like PostRow (title, badges,
 * meta line) so nothing moves when the rows arrive. Shows only after showAfterMs.
 */
export function PostListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <SkeletonGroup>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i}>
          <View style={styles.row}>
            <Skeleton width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} height={16} />
            <View style={styles.badges}>
              <Skeleton width={78} height={20} />
              {i % 3 === 0 ? <Skeleton width={64} height={20} /> : null}
            </View>
            <Skeleton width="52%" height={12} />
          </View>
          {i < rows - 1 ? <Divider inset /> : null}
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  // PostRow: 16dp padding around a 22 + 22 + 18 line stack.
  row: {
    minHeight: 104,
    gap: space[3],
    justifyContent: 'center',
    paddingHorizontal: layout.gutter,
    paddingVertical: space[4],
  },
  badges: { flexDirection: 'row', gap: space[2] },
});
