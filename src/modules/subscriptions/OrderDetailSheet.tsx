import { Building2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { BillingMeta, Order } from '@/api/schemas/billing';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { KeyValue, type KeyValueItem } from '@/components/KeyValue';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

import { DetailGroup } from './DetailGroup';
import { orderNet, orderStatusBadge, orderTitle, orderWentThrough, paymentFieldLabel, paymentMethodLabel } from './logic';

export type OrderDetailSheetProps = {
  /** The order to show (kept while the sheet animates closed). */
  order: Order | null;
  visible: boolean;
  onClose: () => void;
  meta: BillingMeta | undefined;
  now: Date;
  /** Opens the client the checkout created or matched. */
  onOpenClient: (clientId: string) => void;
};

/**
 * A one-time order on its own (brief 8.8): every field, plus the source and
 * campaign the checkout came from. Read only: refunds and disputes are handled
 * in Stripe. "Open client" when the checkout created or matched a client.
 */
export function OrderDetailSheet({ order, visible, onClose, meta, now, onOpenClient }: OrderDetailSheetProps) {
  const clientId = order?.clientId ?? null;
  return (
    <Sheet
      visible={visible && order !== null}
      onClose={onClose}
      title={order ? orderTitle(order) : undefined}
      subtitle={order?.product}
      scrollable
      footer={
        clientId ? (
          <Button label="Open client" icon={Building2} variant="secondary" fullWidth onPress={() => onOpenClient(clientId)} accessibilityHint="Opens the client this order belongs to" />
        ) : null
      }
    >
      {order ? <Body order={order} meta={meta} now={now} /> : null}
    </Sheet>
  );
}

function Body({ order, meta, now }: { order: Order; meta: BillingMeta | undefined; now: Date }) {
  const status = orderStatusBadge(meta, order.status);
  const refunded = order.amountRefunded ? formatMoney(order.amountRefunded) : null;
  const instalments = order.bnpl && orderWentThrough(order.status);

  const payment: (KeyValueItem | null)[] = [
    { label: 'Amount', value: formatMoney(order.amount) },
    refunded ? { label: 'Refunded', value: refunded } : null,
    order.status === 'partially_refunded' ? { label: 'Net', value: orderNet(order) } : null,
    { label: 'Status', value: status.label },
    { label: paymentFieldLabel(order.status), value: order.paidWith ? paymentMethodLabel(meta, order.paidWith) : 'Not chosen yet' },
    { label: 'Product', value: order.product },
    { label: 'Created', value: formatDateTime(order.createdAt, now) },
    { label: 'Paid', value: order.paidAt ? formatDateTime(order.paidAt, now) : 'Not paid' },
  ];
  const customer: KeyValueItem[] = [
    { label: 'Business', value: order.business },
    { label: 'Email', value: order.email, link: 'email' },
  ];
  const attribution: KeyValueItem[] = [
    { label: 'Source', value: order.source },
    { label: 'Campaign', value: order.campaign },
  ];

  return (
    <View style={styles.body}>
      <View style={styles.hero}>
        <Text variant="number" tabular accessibilityLabel={`Amount ${formatMoney(order.amount)}`}>
          {formatMoney(order.amount)}
        </Text>
        <View style={styles.badges}>
          <Badge label={status.label} tone={status.tone} size="md" dot />
          {instalments ? <Badge label="Paid in instalments" tone="gold" size="md" /> : null}
        </View>
      </View>
      <KeyValue items={payment} inset={0} />
      <DetailGroup title="Customer">
        <KeyValue items={customer} inset={0} />
      </DetailGroup>
      <DetailGroup title="Attribution">
        <KeyValue items={attribution} inset={0} />
      </DetailGroup>
      <KeyValue items={[{ label: 'Order id', value: order.id, mono: true, copyable: true }]} inset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[5], paddingBottom: space[2] },
  hero: { gap: space[3] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
