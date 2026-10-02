import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { radius, space } from '@/design/tokens';

export type SubmissionDetailSkeletonProps = {
  /**
   * all: nothing is known yet (contact lines, actions, the two numbers and the
   * sections). sections: the row came from the list's cache, so only the
   * Breakdown, Answers and Details are still loading.
   */
  part: 'all' | 'sections';
  /** A title placeholder when the screen has no title yet. */
  withTitle?: boolean;
};

function Sections() {
  return (
    <>
      <Skeleton width="34%" height={22} />
      <Skeleton shape="block" height={248} style={styles.card} />
      <Skeleton width="30%" height={22} style={styles.sectionTitle} />
      <Skeleton shape="block" height={200} style={styles.card} />
    </>
  );
}

/**
 * Submission detail while it loads (only after showAfterMs), at roughly the
 * real sizes, so the content lands where the placeholders were.
 */
export function SubmissionDetailSkeleton({ part, withTitle = false }: SubmissionDetailSkeletonProps) {
  if (part === 'sections') {
    return (
      <SkeletonGroup style={styles.wrap}>
        <Sections />
      </SkeletonGroup>
    );
  }
  return (
    <SkeletonGroup style={styles.wrap}>
      {withTitle ? (
        <>
          <Skeleton width="44%" height={11} />
          <Skeleton width="62%" height={34} style={styles.title} />
        </>
      ) : null}
      <Skeleton width="48%" height={14} />
      <Skeleton width="58%" height={14} />
      <Skeleton width="36%" height={12} />
      <View style={styles.row}>
        <Skeleton height={48} style={[styles.pill, styles.flex]} />
        <Skeleton height={48} style={[styles.pill, styles.flex]} />
      </View>
      <View style={[styles.row, styles.numbers]}>
        <Skeleton shape="block" height={112} style={[styles.card, styles.flex]} />
        <Skeleton shape="block" height={112} style={[styles.card, styles.flex]} />
      </View>
      <Sections />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[4] },
  title: { marginBottom: space[2] },
  row: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
  numbers: { marginTop: space[1], marginBottom: space[2] },
  flex: { flex: 1 },
  pill: { borderRadius: radius.pill },
  card: { borderRadius: radius.card },
  sectionTitle: { marginTop: space[4] },
});
