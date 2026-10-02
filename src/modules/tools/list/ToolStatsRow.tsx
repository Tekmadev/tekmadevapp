import { StyleSheet, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import type { ToolStats } from '@/api/schemas/tools';
import { StatCard } from '@/components/StatCard';
import { layout, space } from '@/design/tokens';
import { formatCount } from '@/lib/format';
import { formatCents } from '@/lib/money';

import { statCardWidth } from '../logic';

/** The same card width as the Clients stat row, so the Customers tab reads as one screen. */
const MIN_CARD = 172;
/** Room reserved for the leak before it loads (and its smallest width after), so the row barely moves. */
const LEAK_SAMPLE = '$00,000.00';

type CountKey = 'submissions' | 'last30d' | 'optIns';
const COUNTS: readonly { key: CountKey; label: string }[] = [
  { key: 'submissions', label: 'Submissions' },
  { key: 'last30d', label: 'Last 30 days' },
  { key: 'optIns', label: 'Newsletter opt-ins' },
];
const LEAK_LABEL = 'Leak reported';

export type ToolStatsRowProps = {
  /** Undefined while GET /tools/stats loads. */
  stats: ToolStats | undefined;
  loading: boolean;
  /** Count up from zero (first load with nothing cached); otherwise from the previous value. */
  countFromZero: boolean;
};

/**
 * The four Free tools KPIs (brief 8.7) in a sideways row under the section
 * tabs, like the Clients stat row: Submissions, Last 30 days, Newsletter
 * opt-ins and Leak reported (money with its cents, "per month, all
 * submissions"). Each card is wide enough for its label and number at the
 * current font scale, so nothing is cut off.
 */
export function ToolStatsRow({ stats, loading, countFromZero }: ToolStatsRowProps) {
  const { fontScale } = useWindowDimensions();
  const leak = stats?.leakReported;
  const formatLeak = (cents: number) => formatCents(cents, leak?.currency);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel="Free tool counts">
      {COUNTS.map((c) => {
        const value = stats ? stats[c.key] : null;
        return (
          <StatCard
            key={c.key}
            label={c.label}
            value={value}
            size="md"
            loading={loading}
            countFromZero={countFromZero}
            style={{ width: statCardWidth(c.label, value === null ? [] : [formatCount(value)], fontScale, MIN_CARD) }}
          />
        );
      })}
      <StatCard
        label={LEAK_LABEL}
        value={leak ? leak.amount : null}
        format={formatLeak}
        sub="per month, all submissions"
        size="md"
        emphasis
        loading={loading}
        countFromZero={countFromZero}
        style={{ width: statCardWidth(LEAK_LABEL, leak ? [LEAK_SAMPLE, formatLeak(leak.amount)] : [LEAK_SAMPLE], fontScale, MIN_CARD) }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: layout.gutter, gap: space[3], alignItems: 'stretch' },
});
