import { StyleSheet, View } from 'react-native';

import type { BillingSummary } from '@/api/schemas/billing';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import { summaryLine } from './logic';

/** Invisible stand-in text of about the same length, so the line keeps its height (and wrap) while it loads. */
const RESERVE = 'Loading subscriptions and one-time orders (paid in instalments)';

export type BillingSummaryLineProps = {
  /** Live totals from either list; undefined until one has loaded. */
  summary: BillingSummary | undefined;
  /** Nothing could be loaded: say nothing here (the list shows the error), never zeros. */
  failed: boolean;
};

/**
 * The segment's subtitle (brief 8.8): "{subs} subscriptions · {orders} one-time
 * orders ({bnpl} paid in instalments)". While loading it keeps its space with a
 * skeleton line, so the controls under it never jump.
 */
export function BillingSummaryLine({ summary, failed }: BillingSummaryLineProps) {
  if (summary) {
    return (
      <Text variant="small" color="ink3" tabular style={styles.line}>
        {summaryLine(summary)}
      </Text>
    );
  }
  if (failed) return null;
  return (
    <View style={styles.line} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Text variant="small" style={styles.reserve}>
        {RESERVE}
      </Text>
      <View style={styles.skeleton}>
        <Skeleton width="85%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { marginBottom: space[1] },
  reserve: { opacity: 0 },
  skeleton: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
});
