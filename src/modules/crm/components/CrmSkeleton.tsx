import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { radius, space } from '@/design/tokens';

/**
 * CRM sync while the first load runs: the loaded layout in warm blocks
 * (connection, the three switches, the queue), so nothing moves when the data
 * lands. Waits for `showAfterMs`, so a fast load shows nothing.
 */
export function CrmSkeleton() {
  return (
    <SkeletonGroup>
      <Section title="Connection">
        <Card style={styles.card}>
          <Skeleton width={96} height={24} style={styles.pill} />
          <Skeleton width="88%" height={14} />
          <Skeleton width="64%" height={14} />
          <Skeleton width={168} height={40} style={styles.pill} />
        </Card>
      </Section>
      <Section title="Switches">
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Card key={i} style={styles.card}>
              <View style={styles.switchTop}>
                <View style={styles.flex}>
                  <Skeleton width="42%" height={16} />
                  <Skeleton width={72} height={20} style={styles.pill} />
                </View>
                <Skeleton width={52} height={32} style={styles.pill} />
              </View>
              <Skeleton width="92%" height={12} />
              <Skeleton width="70%" height={12} />
            </Card>
          ))}
        </View>
      </Section>
      <Section title="Queue">
        <View style={styles.list}>
          {[0, 1].map((row) => (
            <View key={row} style={styles.row}>
              {[0, 1].map((cell) => (
                <Card key={cell} style={[styles.card, styles.flex]}>
                  <Skeleton width="70%" height={11} />
                  <Skeleton width="45%" height={26} />
                  <Skeleton width="80%" height={12} />
                </Card>
              ))}
            </View>
          ))}
        </View>
      </Section>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  list: { gap: space[3] },
  row: { flexDirection: 'row', gap: space[3] },
  flex: { flex: 1, gap: space[2] },
  switchTop: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  pill: { borderRadius: radius.pill },
});
