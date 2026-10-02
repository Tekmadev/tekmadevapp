import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Skeleton, SkeletonGroup, SkeletonList } from '@/components/Skeleton';
import { layout, space } from '@/design/tokens';

/**
 * Loading layouts for the Email screens. SkeletonGroup waits `showAfterMs`
 * (nothing shows on a fast load) and announces "Loading" once.
 */

/** Two campaign cards while GET /email/overview loads. */
export function EmailSegmentSkeleton() {
  return (
    <SkeletonGroup style={[styles.wrap, styles.group]}>
      <Skeleton width="40%" height={22} />
      {[0, 1].map((i) => (
        <Card key={i}>
          <View style={styles.card}>
            <Skeleton width="60%" height={18} />
            <Skeleton width="35%" />
            <Skeleton width="80%" />
            <View style={styles.counts}>
              <Skeleton width={64} height={28} />
              <Skeleton width={64} height={28} />
            </View>
          </View>
        </Card>
      ))}
    </SkeletonGroup>
  );
}

/** Subscriber rows while the first page loads. */
export function SubscriberListSkeleton() {
  return <SkeletonList rows={8} leading={false} />;
}

/** Template cards while GET /email/templates loads. */
export function TemplateListSkeleton() {
  return (
    <SkeletonGroup style={[styles.wrap, styles.group]}>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i}>
          <View style={styles.card}>
            <Skeleton width="50%" height={18} />
            <Skeleton width="85%" />
            <Skeleton width="70%" />
          </View>
        </Card>
      ))}
    </SkeletonGroup>
  );
}

/** The subscriber detail body (badges, facts, timeline) while it loads. */
export function SubscriberDetailSkeleton({ withHeader }: { withHeader: boolean }) {
  return (
    <SkeletonGroup style={styles.group}>
      {withHeader ? (
        <>
          <Skeleton width="70%" height={22} />
          <Skeleton width="40%" />
        </>
      ) : null}
      <Card>
        <View style={styles.card}>
          <Skeleton width="80%" />
          <Skeleton width="65%" />
          <Skeleton width="75%" />
        </View>
      </Card>
      <Skeleton width="45%" height={22} />
      <Skeleton width="85%" />
      <Skeleton width="60%" />
    </SkeletonGroup>
  );
}

/** The template preview area while GET /email/templates loads. */
export function TemplateDetailSkeleton() {
  return (
    <SkeletonGroup style={[styles.wrap, styles.group]}>
      <Skeleton width="70%" />
      <Skeleton shape="block" height={360} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.gutter },
  group: { gap: space[3] },
  card: { gap: space[3] },
  counts: { flexDirection: 'row', gap: space[6] },
});
