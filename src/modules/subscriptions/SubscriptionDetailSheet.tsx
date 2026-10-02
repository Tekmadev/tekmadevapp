import { Building2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { BillingMeta, Subscription } from '@/api/schemas/billing';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { KeyValue, type KeyValueItem } from '@/components/KeyValue';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { formatDateTime, formatShortDate } from '@/lib/dates';

import { DetailGroup } from './DetailGroup';
import {
  isEnding,
  periodField,
  subscriptionAmount,
  subscriptionAmountSpoken,
  subscriptionBadge,
  subscriptionPlan,
  subscriptionStatusLabel,
} from './logic';

export type SubscriptionDetailSheetProps = {
  /** The subscription to show (kept while the sheet animates closed). */
  subscription: Subscription | null;
  visible: boolean;
  onClose: () => void;
  meta: BillingMeta | undefined;
  now: Date;
  /** Opens the client this subscription belongs to. */
  onOpenClient: (clientId: string) => void;
};

/**
 * A subscription on its own (brief 8.8): plan, amount, Stripe status, period
 * end, the Stripe customer id (mono, tap to copy) and, when it was cancelled or
 * is ending, the reason and the customer's feedback. Read only: plans change in
 * Stripe.
 */
export function SubscriptionDetailSheet({ subscription, visible, onClose, meta, now, onOpenClient }: SubscriptionDetailSheetProps) {
  const clientId = subscription?.clientId ?? null;
  return (
    <Sheet
      visible={visible && subscription !== null}
      onClose={onClose}
      title={subscription?.email}
      subtitle={subscription ? subscriptionPlan(subscription) : undefined}
      scrollable
      footer={
        clientId ? (
          <Button
            label="Open client"
            icon={Building2}
            variant="secondary"
            fullWidth
            onPress={() => onOpenClient(clientId)}
            accessibilityHint="Opens the client this subscription belongs to"
          />
        ) : null
      }
    >
      {subscription ? <Body sub={subscription} meta={meta} now={now} /> : null}
    </Sheet>
  );
}

function Body({ sub, meta, now }: { sub: Subscription; meta: BillingMeta | undefined; now: Date }) {
  const badge = subscriptionBadge(meta, sub, now);
  const status = subscriptionStatusLabel(meta, sub.status).label;
  const period = periodField(sub, now);

  const details: (KeyValueItem | null)[] = [
    { label: 'Plan', value: subscriptionPlan(sub) },
    { label: 'Amount', value: subscriptionAmountSpoken(sub) },
    { label: 'Status', value: isEnding(sub) ? `${status}, cancels at period end` : status },
    period ? { label: period.label, value: period.value } : { label: 'Period end', value: null },
    { label: 'Started', value: formatShortDate(sub.createdAt, now) },
    sub.canceledAt ? { label: 'Cancelled', value: formatDateTime(sub.canceledAt, now) } : null,
  ];
  const customer: KeyValueItem[] = [
    { label: 'Email', value: sub.email, link: 'email' },
    { label: 'Business', value: sub.business },
    { label: 'Customer id', value: sub.customerId, mono: true, copyable: true },
  ];
  const c = sub.cancellation;
  const cancellation: (KeyValueItem | null)[] = c
    ? [
        c.reason ? { label: 'Reason', value: c.reason } : null,
        c.feedback ? { label: 'Feedback', value: c.feedback } : null,
        c.comment ? { label: 'Comment', value: c.comment } : null,
      ]
    : [];
  const hasCancellation = cancellation.some(Boolean);

  return (
    <View style={styles.body}>
      <View style={styles.hero}>
        <Text variant="number" tabular accessibilityLabel={subscriptionAmountSpoken(sub)}>
          {subscriptionAmount(sub)}
        </Text>
        <View style={styles.badges}>
          <Badge label={badge.label} tone={badge.tone} size="md" dot />
        </View>
      </View>
      <KeyValue items={details} inset={0} />
      {hasCancellation ? (
        <DetailGroup title="Cancellation">
          <KeyValue items={cancellation} layout="stacked" inset={0} />
        </DetailGroup>
      ) : null}
      <DetailGroup title="Customer">
        <KeyValue items={customer} inset={0} />
      </DetailGroup>
      <KeyValue items={[{ label: 'Subscription id', value: sub.id, mono: true, copyable: true }]} inset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[5], paddingBottom: space[2] },
  hero: { gap: space[3] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
