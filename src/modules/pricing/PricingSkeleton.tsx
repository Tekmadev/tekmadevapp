import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { space } from '@/design/tokens';

/** One money field: the 56dp input box. */
function FieldBlock() {
  return <Skeleton shape="block" height={56} />;
}

function CardSkeleton({ fields }: { fields: number }) {
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Skeleton width="40%" height={18} />
        <Skeleton width={84} height={22} />
      </View>
      {Array.from({ length: fields }, (_, i) => (
        <FieldBlock key={i} />
      ))}
      <Skeleton shape="block" height={48} />
    </Card>
  );
}

/**
 * Pricing while it loads for the first time (after `showAfterMs`): the tax
 * card, two plan cards and the product card in their real proportions, under
 * the same section titles, so nothing jumps when the prices land.
 */
export function PricingSkeleton() {
  return (
    <SkeletonGroup>
      <Section title="Sales tax" spacing={space[6]}>
        <Card style={styles.card}>
          <View style={styles.head}>
            <Skeleton width="30%" height={16} />
            <Skeleton width={52} height={32} />
          </View>
          <Skeleton width="92%" />
          <Skeleton width="70%" />
        </Card>
      </Section>
      <Section title="Plans" spacing={space[6]}>
        <View style={styles.stack}>
          <CardSkeleton fields={2} />
          <CardSkeleton fields={2} />
        </View>
      </Section>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stack: { gap: space[3] },
});
