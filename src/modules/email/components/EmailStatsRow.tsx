import { StyleSheet, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import type { EmailStats } from '@/api/schemas/email';
import { StatCard } from '@/components/StatCard';
import { layout, space } from '@/design/tokens';
import { formatCount } from '@/lib/format';
import { statCardWidth } from '@/modules/tools/logic';

/** The same card width as the other Customers and Marketing stat rows. */
const MIN_CARD = 172;

const CARDS: readonly { key: keyof EmailStats; label: string; emphasis?: boolean }[] = [
  { key: 'activeSubscribers', label: 'Active subscribers', emphasis: true },
  { key: 'new30d', label: 'New (30d)' },
  { key: 'opens30d', label: 'Opens (30d)' },
  { key: 'clicks30d', label: 'Clicks (30d)' },
];

export type EmailStatsRowProps = {
  /** Undefined while GET /email/overview loads. */
  stats: EmailStats | undefined;
  loading: boolean;
  /** Count up from zero (first load with nothing cached); otherwise from the previous value. */
  countFromZero: boolean;
};

/**
 * The four Email KPIs (brief 8.11) in a sideways row under the section tabs:
 * Active subscribers (the gold figure), New (30d), Opens (30d), Clicks (30d).
 * Each card is wide enough for its label and number at the current font scale.
 */
export function EmailStatsRow({ stats, loading, countFromZero }: EmailStatsRowProps) {
  const { fontScale } = useWindowDimensions();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel="Email counts">
      {CARDS.map((c) => {
        const value = stats ? stats[c.key] : null;
        return (
          <StatCard
            key={c.key}
            label={c.label}
            value={value}
            size="md"
            emphasis={c.emphasis}
            loading={loading}
            countFromZero={countFromZero}
            style={{ width: statCardWidth(c.label, value === null ? [] : [formatCount(value)], fontScale, MIN_CARD) }}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: layout.gutter, gap: space[3], alignItems: 'stretch' },
});
