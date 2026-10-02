import { StyleSheet, View, type DimensionValue } from 'react-native';

import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { space } from '@/design/tokens';

const LINES: DimensionValue[] = ['100%', '94%', '97%', '62%', '100%', '91%', '76%'];

/** The editor's shape while a post loads: the title, the meta line, then body lines. */
export function EditorSkeleton() {
  return (
    <SkeletonGroup style={styles.wrap}>
      <View style={styles.title}>
        <Skeleton width="88%" height={34} />
        <Skeleton width="54%" height={34} />
      </View>
      <Skeleton width={180} height={14} />
      <View style={styles.body}>
        {LINES.map((w, i) => (
          <Skeleton key={i} width={w} height={17} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[5] },
  title: { gap: space[2] },
  body: { gap: space[3], marginTop: space[3] },
});
