import * as Clipboard from 'expo-clipboard';
import { CircleCheck, Copy, CreditCard, RefreshCw, Trash2, TriangleAlert } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TestModeMeta, TestModeStatus, TestPurchase } from '@/api/schemas/testMode';
import { JobProgress } from '@/components/automation/JobProgress';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { KeyValue } from '@/components/KeyValue';
import { ListRow } from '@/components/ListRow';
import { PendingButton } from '@/components/PendingButton';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { formatDateTime } from '@/lib/dates';
import { formatCount } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { notice } from '@/lib/notice';
import { labelOf, toneOf } from '@/modules/clients/sections/labels';

import {
  catalogReady,
  NO_CATALOG,
  NO_PURCHASES,
  REBUILD_NOTE,
  REBUILDING,
  SETUP_GAP,
  TEST_CARD_DIGITS,
  TEST_CARD_DISPLAY,
  TEST_CARD_NOTE,
} from './logic';

/* ---------- test card ---------- */

async function copyCard() {
  try {
    await Clipboard.setStringAsync(TEST_CARD_DIGITS);
    notice.ok('Copied.');
  } catch {
    notice.err('Could not copy that.');
  }
}

/** Stripe's sandbox card with a copy button (brief 8.15). */
export function TestCardCard() {
  return (
    <Card style={styles.cardRow}>
      <Icon icon={CreditCard} size={22} color="gold" />
      <View style={styles.cardText} accessible accessibilityLabel={`Test card ${TEST_CARD_DISPLAY}. ${TEST_CARD_NOTE}`}>
        <Text variant="eyebrow">Test card</Text>
        <Text variant="title" tabular selectable style={styles.cardNumber}>
          {TEST_CARD_DISPLAY}
        </Text>
        <Text variant="small" color="ink3">
          {TEST_CARD_NOTE}
        </Text>
      </View>
      <IconButton icon={Copy} variant="tonal" accessibilityLabel="Copy the test card number" onPress={() => void copyCard()} />
    </Card>
  );
}

/* ---------- setup ---------- */

function readyBadge(ok: boolean, yes: string, no: string) {
  return <Badge label={ok ? yes : no} tone={ok ? 'ok' : 'warn'} icon={ok ? CircleCheck : TriangleAlert} />;
}

/** Keys and webhook secret on the server. */
export function SetupSection({ status }: { status: TestModeStatus }) {
  const gap = !status.keysConfigured || !status.webhookSecretConfigured;
  return (
    <Section title="Setup">
      <Card padded={false}>
        <KeyValue
          items={[
            {
              label: 'Sandbox keys',
              value: status.keysConfigured ? 'Configured' : 'Missing',
              render: readyBadge(status.keysConfigured, 'Configured', 'Missing'),
            },
            {
              label: 'Webhook secret',
              value: status.webhookSecretConfigured ? 'Configured' : 'Missing',
              render: readyBadge(status.webhookSecretConfigured, 'Configured', 'Missing'),
            },
          ]}
        />
      </Card>
      {gap ? (
        <Text variant="small" color="ink3" style={styles.note}>
          {SETUP_GAP}
        </Text>
      ) : null}
    </Section>
  );
}

/* ---------- catalog ---------- */

type CatalogSectionProps = {
  status: TestModeStatus;
  rebuilding: boolean;
  startedAt: number | null;
  onRebuild: () => void;
};

/** Per product: the one-time price and the care plan in the sandbox, then "Rebuild test catalog" (a long job). */
export function CatalogSection({ status, rebuilding, startedAt, onRebuild }: CatalogSectionProps) {
  const ready = catalogReady(status);
  return (
    <Section title="Catalog" right={<Badge label={ready ? 'Ready' : 'Not ready'} tone={ready ? 'ok' : 'warn'} dot />}>
      <Card style={styles.catalog}>
        {status.catalog.length === 0 ? (
          <Text variant="small" color="ink3">
            {NO_CATALOG}
          </Text>
        ) : (
          status.catalog.map((item, i) => (
            <Fragment key={item.productId}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.product}>
                <Text variant="bodyStrong">{item.name}</Text>
                <View style={styles.badges}>
                  {readyBadge(item.priceReady, 'Price ready', 'No price')}
                  {readyBadge(item.carePlanReady, 'Care plan ready', 'No care plan')}
                </View>
              </View>
            </Fragment>
          ))
        )}
        {rebuilding ? <JobProgress variant="inline" active title={REBUILDING} startedAt={startedAt} note={REBUILD_NOTE} /> : null}
        <PendingButton
          label="Rebuild test catalog"
          icon={RefreshCw}
          variant="secondary"
          size="sm"
          disabled={rebuilding}
          onPress={onRebuild}
          accessibilityHint="Creates any missing sandbox prices. Up to 2 minutes."
          style={styles.start}
        />
      </Card>
    </Section>
  );
}

/* ---------- test data ---------- */

type DataSectionProps = {
  status: TestModeStatus;
  canDelete: boolean;
  onDelete: () => void;
};

/** Test rows on record, and "Delete all test data" (hold to confirm in a sheet). */
export function DataSection({ status, canDelete, onDelete }: DataSectionProps) {
  const { clients, orders, subscriptions, logins } = status.counts;
  return (
    <Section title="Test data">
      <Card padded={false}>
        <KeyValue
          items={[
            { label: 'Test clients', value: formatCount(clients) },
            { label: 'Orders', value: formatCount(orders) },
            { label: 'Subscriptions', value: formatCount(subscriptions) },
            { label: 'Logins', value: formatCount(logins) },
          ]}
        />
      </Card>
      <Button
        label="Delete all test data"
        variant="secondary"
        icon={Trash2}
        disabled={!canDelete}
        onPress={onDelete}
        style={styles.delete}
        accessibilityHint="Asks you to hold to confirm"
      />
    </Section>
  );
}

/* ---------- purchases ---------- */

/** The latest test purchases, newest first. */
export function PurchasesSection({ purchases, meta }: { purchases: readonly TestPurchase[]; meta: TestModeMeta | undefined }) {
  const statuses = meta?.testPurchaseStatuses ?? [];
  return (
    <Section title="Latest test purchases">
      {purchases.length === 0 ? (
        <EmptyState compact message={NO_PURCHASES} />
      ) : (
        <Card padded={false}>
          {purchases.map((p, i) => (
            <Fragment key={p.id}>
              {i > 0 ? <Divider inset insetEnd /> : null}
              <ListRow
                title={p.product}
                subtitle={p.email}
                meta={formatDateTime(p.at)}
                value={formatMoney(p.amount)}
                badge={{ label: labelOf(statuses, p.status), tone: toneOf(statuses, p.status) }}
                background="surface"
              />
            </Fragment>
          ))}
        </Card>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginBottom: space[7] },
  cardText: { flex: 1, gap: 2 },
  cardNumber: { marginVertical: 2 },
  note: { marginTop: space[2] },
  catalog: { gap: space[3] },
  product: { gap: space[2] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  start: { alignSelf: 'flex-start' },
  delete: { alignSelf: 'flex-start', marginTop: space[3] },
});
