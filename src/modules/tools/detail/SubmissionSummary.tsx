import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { ToolSubmission } from '@/api/schemas/tools';
import { StatCard } from '@/components/StatCard';
import { space } from '@/design/tokens';
import { formatMoney } from '@/lib/money';

import { closeRateText, pairColumns } from '../logic';

const LEAK = 'Leak per month';
const CLOSE = 'Close rate';

/**
 * The two headline numbers of the submission, from the row's own fields:
 * the monthly leak (gold, with its cents, via money.ts) and the close rate
 * "20% → 35%" (today, then with instant replies). A missing figure reads "Not
 * available", never $0. The numbers shrink to fit rather than being cut, and
 * the cards stack when the labels would not fit side by side.
 */
export function SubmissionSummary({ row }: { row: Pick<ToolSubmission, 'leak' | 'closeRate'> }) {
  const { width, fontScale } = useWindowDimensions();
  const columns = pairColumns(width, fontScale, [LEAK, CLOSE]);
  const leak = formatMoney(row.leak) || null;
  const close = closeRateText(row.closeRate);
  const cell = columns === 2 ? styles.cell : null;

  return (
    <View style={[styles.wrap, columns === 2 ? styles.row : null]}>
      <StatCard label={LEAK} value={leak} size="md" emphasis style={cell} />
      <StatCard label={CLOSE} value={close} sub={close ? 'today → with instant replies' : undefined} size="md" style={cell} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[3], marginBottom: space[7] },
  row: { flexDirection: 'row' },
  cell: { flex: 1 },
});
