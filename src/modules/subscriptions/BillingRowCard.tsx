import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { BillingMeta, Order, Subscription } from '@/api/schemas/billing';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { layout, space, type Tone } from '@/design/tokens';
import { formatMoney } from '@/lib/money';

import {
  orderMetaLine,
  orderSpokenLabel,
  orderStatusBadge,
  orderTitle,
  periodLine,
  subscriptionAmount,
  subscriptionBadge,
  subscriptionPlan,
  subscriptionSpokenLabel,
} from './logic';

type RowShell = {
  /** Position in the list: the first rows are pulled into place with a stagger. */
  index: number;
  /** No enter animation (reduced motion, or rows that arrive with a later page). */
  still: boolean;
  meta: BillingMeta | undefined;
  now: Date;
};

type CardLayoutProps = {
  title: string;
  amount: string;
  line: string;
  badge: { label: string; tone: Tone };
  foot: string | null;
  spoken: string;
  hint: string;
  onPress: () => void;
  index: number;
  still: boolean;
};

/**
 * The shared row: title and amount, then the product with its status badge,
 * then one quiet line (payment method or period end). One button, one spoken
 * summary; the parts are hidden from TalkBack so it reads once.
 */
function BillingCard({ title, amount, line, badge, foot, spoken, hint, onPress, index, still }: CardLayoutProps) {
  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)} style={styles.wrap}>
      <Card onPress={onPress} accessibilityLabel={spoken} accessibilityHint={hint}>
        <View importantForAccessibility="no-hide-descendants" style={styles.body}>
          <View style={styles.line}>
            <Text variant="title" numberOfLines={1} style={styles.grow}>
              {title}
            </Text>
            <Text variant="title" tabular numberOfLines={1} style={styles.amount}>
              {amount}
            </Text>
          </View>
          <View style={styles.line}>
            <Text variant="small" color="ink3" numberOfLines={1} style={styles.grow}>
              {line}
            </Text>
            <Badge label={badge.label} tone={badge.tone} dot />
          </View>
          {foot ? (
            <Text variant="small" color="ink4" tabular numberOfLines={1}>
              {foot}
            </Text>
          ) : null}
        </View>
      </Card>
    </Animated.View>
  );
}

/** One-time order (brief 8.8): business or email, product, status, amount, paid with. */
export const OrderRowCard = memo(function OrderRowCard({ order, onPress, meta, now, index, still }: RowShell & { order: Order; onPress: (order: Order) => void }) {
  return (
    <BillingCard
      title={orderTitle(order)}
      amount={formatMoney(order.amount)}
      line={order.product}
      badge={orderStatusBadge(meta, order.status)}
      foot={orderMetaLine(order, meta, now)}
      spoken={orderSpokenLabel(order, meta, now)}
      hint="Opens the order details"
      onPress={() => onPress(order)}
      index={index}
      still={still}
    />
  );
});

/** Subscription (brief 8.8): email, plan or "Webline Care", status (or "Ending <date>"), amount, period end. */
export const SubscriptionRowCard = memo(function SubscriptionRowCard({
  subscription,
  onPress,
  meta,
  now,
  index,
  still,
}: RowShell & { subscription: Subscription; onPress: (subscription: Subscription) => void }) {
  return (
    <BillingCard
      title={subscription.email}
      amount={subscriptionAmount(subscription)}
      line={subscriptionPlan(subscription)}
      badge={subscriptionBadge(meta, subscription, now)}
      foot={periodLine(subscription, now)}
      spoken={subscriptionSpokenLabel(subscription, meta, now)}
      hint="Opens the subscription details"
      onPress={() => onPress(subscription)}
      index={index}
      still={still}
    />
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.gutter },
  body: { gap: space[2] },
  line: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  grow: { flex: 1 },
  amount: { flexShrink: 0 },
});
