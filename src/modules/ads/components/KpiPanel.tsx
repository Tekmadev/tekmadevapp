import { Fragment } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import { clampScale } from '@/modules/overview/logic';

import { chunk, type KpiItem } from '../logic';

type KpiPanelProps = {
  title: string;
  items: readonly KpiItem[];
  /** 2 normally; 1 when the widest figure would not fit half the card whole (see gridColumns). */
  columns: number;
  countFromZero: boolean;
};

/** Two eyebrow lines (14sp line height each), so every number in a row starts on the same line. */
const LABEL_LINES_HEIGHT = 28;

/**
 * One group of KPIs in a single card, two by two, with hairlines between the
 * rows ("What Meta reports", "What the site recorded from those ads"). Numbers
 * count up from their previous value when the range changes. Labels may take
 * two lines, so long ones ("Cost per link click") are never cut off.
 */
export function KpiPanel({ title, items, columns, countFromZero }: KpiPanelProps) {
  const { fontScale } = useWindowDimensions();
  const labelHeight = Math.ceil(LABEL_LINES_HEIGHT * clampScale(fontScale));
  const rows = chunk(items, columns);
  return (
    <Section title={title}>
      <Card>
        {rows.map((row, r) => (
          <Fragment key={row.map((i) => i.key).join('-')}>
            {r > 0 ? <Divider style={styles.divider} /> : null}
            <View style={styles.row}>
              {row.map((item) => (
                <KpiCell key={item.key} item={item} labelHeight={columns > 1 ? labelHeight : 0} countFromZero={countFromZero} />
              ))}
              {/* A short last row keeps its cell at half width. */}
              {row.length < columns ? <View style={styles.cell} /> : null}
            </View>
          </Fragment>
        ))}
      </Card>
    </Section>
  );
}

function KpiCell({ item, labelHeight, countFromZero }: { item: KpiItem; labelHeight: number; countFromZero: boolean }) {
  const value = item.value;
  const present = value != null && Number.isFinite(value);
  const shown = present ? item.format(value) : 'Not available';
  const spoken = [item.label, shown, item.sub].filter(Boolean).join(', ');
  return (
    <View style={styles.cell} accessible accessibilityLabel={spoken}>
      <View style={[styles.label, { minHeight: labelHeight }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text variant="eyebrow" numberOfLines={2}>
          {item.label}
        </Text>
      </View>
      <View style={styles.number} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {present ? (
          <AnimatedNumber value={value} format={item.format} variant="number" color={item.emphasis ? 'gold' : 'ink'} countFromZero={countFromZero} />
        ) : (
          <Text variant="small" color="ink4" style={styles.missing}>
            Not available
          </Text>
        )}
      </View>
      {item.sub ? (
        <Text variant="small" color="ink3" numberOfLines={2} style={styles.sub} importantForAccessibility="no">
          {item.sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[4] },
  cell: { flex: 1 },
  label: { justifyContent: 'flex-end' },
  number: { marginTop: space[1] },
  // Sits on the number's line so a missing figure does not shorten the cell.
  missing: { paddingVertical: space[1] + 2 },
  sub: { marginTop: space[1] },
  divider: { marginVertical: space[4] },
});
