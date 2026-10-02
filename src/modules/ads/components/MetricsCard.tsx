import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { Money } from '@/api/types';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { space, type Tone } from '@/design/tokens';
import { formatCents, formatMoney } from '@/lib/money';

import { cardSpoken, chunk, MISSING, type Metric } from '../logic';

type MetricsCardProps = {
  /** Campaign or ad name. The drill-down's summary card leaves it out (the name is the screen title). */
  title?: string | null;
  badge?: { label: string; tone: Tone } | null;
  spend: Money;
  /** Link clicks through cost per sale, from cardMetrics(). */
  metrics: readonly Metric[];
  /** Columns for the metric grid; the same for every card on a screen so they line up. */
  columns: number;
  onPress?: () => void;
  accessibilityHint?: string;
  /**
   * The drill-down's summary: spend is gold and counts up when the range
   * changes. List cards show plain text, because FlashList recycles them and a
   * count-up would start from another campaign's number.
   */
  hero?: boolean;
  countFromZero?: boolean;
};

/**
 * A campaign (or ad) card: name, status, spend, then link clicks, visits,
 * leads, booked, sales, revenue, cost per lead and cost per sale in a grid.
 * A cost is "n/a" when there was nothing to divide by. Tapping a campaign
 * opens the ads inside it.
 */
export function MetricsCard({ title, badge, spend, metrics, columns, onPress, accessibilityHint, hero = false, countFromZero = false }: MetricsCardProps) {
  const spoken = cardSpoken(title ?? null, badge?.label ?? null, spend, metrics);
  const hasTop = Boolean(title || badge || onPress);
  const rows = chunk(metrics, columns);

  return (
    <Card onPress={onPress} accessibilityLabel={spoken} accessibilityHint={accessibilityHint}>
      <View importantForAccessibility="no-hide-descendants">
        {hasTop ? (
          <View style={styles.top}>
            {title ? (
              <View style={styles.titleWrap}>
                <Text variant="title" numberOfLines={3}>
                  {title}
                </Text>
              </View>
            ) : null}
            {badge ? <Badge label={badge.label} tone={badge.tone} style={styles.badge} /> : null}
            {/* Without a title the badge leads and the chevron stays at the end. */}
            {title ? null : <View style={styles.fill} />}
            {onPress ? <Icon icon={ChevronRight} size={18} color="ink4" /> : null}
          </View>
        ) : null}

        <View style={hasTop ? styles.spendAfterTop : null}>
          <Text variant="eyebrow">Spend</Text>
          {hero ? (
            <AnimatedNumber
              value={spend.amount}
              format={(cents) => formatCents(cents, spend.currency)}
              variant="number"
              color="gold"
              countFromZero={countFromZero}
              style={styles.spendValue}
            />
          ) : (
            <Text variant="number" tabular numberOfLines={1} style={styles.spendValue}>
              {formatMoney(spend)}
            </Text>
          )}
        </View>

        <Divider style={styles.divider} />

        <View style={styles.grid}>
          {rows.map((row) => (
            <View key={row.map((m) => m.key).join('-')} style={styles.row}>
              {row.map((m) => (
                <View key={m.key} style={styles.cell}>
                  <Text variant="small" color="ink3" numberOfLines={2}>
                    {m.label}
                  </Text>
                  <Text variant="title" color={m.value === MISSING ? 'ink4' : 'ink'} tabular numberOfLines={1} style={styles.value}>
                    {m.value}
                  </Text>
                </View>
              ))}
              {/* Keep the cells of a short last row at the grid's width. */}
              {Array.from({ length: columns - row.length }, (_, i) => (
                <View key={`pad-${i}`} style={styles.cell} />
              ))}
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  titleWrap: { flex: 1, minHeight: 24, justifyContent: 'center' },
  badge: { marginTop: 1 },
  fill: { flex: 1 },
  spendAfterTop: { marginTop: space[3] },
  spendValue: { marginTop: space[1] },
  divider: { marginVertical: space[4] },
  grid: { gap: space[4] },
  row: { flexDirection: 'row', gap: space[3] },
  cell: { flex: 1 },
  value: { marginTop: 2 },
});
