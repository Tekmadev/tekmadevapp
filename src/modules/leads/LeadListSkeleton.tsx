import { StyleSheet, View, type DimensionValue } from 'react-native';

import { Divider } from '@/components/Divider';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { layout, space } from '@/design/tokens';

const TITLE_WIDTHS: DimensionValue[] = ['52%', '44%', '58%', '40%', '48%', '55%', '46%', '50%'];

/** Lines up with the row text after the 40dp avatar. */
export const ROW_DIVIDER_INSET = layout.gutter + 40 + space[1] + space[3];

/**
 * Lead rows while the first page loads, shaped like LeadRow (avatar, three
 * lines, a status badge) so nothing moves when the rows arrive. Shows only
 * after showAfterMs.
 */
export function LeadListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <SkeletonGroup>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i}>
          <View style={styles.row}>
            <Skeleton shape="circle" size={40} />
            <View style={styles.lines}>
              <Skeleton width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} height={14} />
              <Skeleton width="36%" height={12} />
              <Skeleton width="28%" height={10} />
            </View>
            <Skeleton width={56} height={22} />
          </View>
          {i < rows - 1 ? <Divider inset={ROW_DIVIDER_INSET} /> : null}
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  // ListRow: 12dp padding around a 22 + 18 + 14 line stack.
  row: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: layout.gutter,
    paddingVertical: space[3],
  },
  lines: { flex: 1, gap: space[2], marginLeft: space[1] },
});
