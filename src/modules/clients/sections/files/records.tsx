import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { layout, space, type Tone } from '@/design/tokens';

/**
 * The record list the Access, Approvals and Agreements sections share: one card,
 * rows split by hairlines, each row a title with its status badge on the right
 * and quieter lines below. Small lists inside the detail scroll, so no FlashList.
 */

export function RecordCard<T>({ items, keyOf, render }: { items: readonly T[]; keyOf: (item: T) => string; render: (item: T) => ReactNode }) {
  return (
    <Card padded={false}>
      {items.map((item, i) => (
        <Fragment key={keyOf(item)}>
          {i > 0 ? <Divider inset insetEnd /> : null}
          {render(item)}
        </Fragment>
      ))}
    </Card>
  );
}

type RecordRowProps = {
  children: ReactNode;
  /** Makes the row a button (press scale + light haptic). */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function RecordRow({ children, onPress, accessibilityLabel, accessibilityHint }: RecordRowProps) {
  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        pressedScale={0.985}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={styles.row}
      >
        {children}
      </PressableScale>
    );
  }
  return <View style={styles.row}>{children}</View>;
}

/** Title on the left (wraps), status badge on the right: the badge always has text, never colour alone. */
export function RecordHead({ title, badge }: { title: string; badge?: { label: string; tone: Tone } }) {
  return (
    <View style={styles.head}>
      <Text variant="bodyStrong" style={styles.title}>
        {title}
      </Text>
      {badge ? <Badge label={badge.label} tone={badge.tone} style={styles.badge} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.minTouch,
    paddingHorizontal: space[4],
    paddingVertical: space[3] + 2,
    gap: space[1],
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  title: { flex: 1 },
  badge: { marginTop: 1 },
});
