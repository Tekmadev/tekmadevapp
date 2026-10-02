import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { OverviewKpis } from '@/api/schemas/overview';
import { StatCard } from '@/components/StatCard';
import { space } from '@/design/tokens';

import { formatKpi, kpiColumns } from './logic';

type Kpi = {
  key: keyof OverviewKpis;
  label: string;
  href: Href;
  hint: string;
};

/** Brief 8.3 item 3, in reading order. Each card opens the list its number comes from. */
const KPIS: readonly Kpi[] = [
  { key: 'totalLeads', label: 'Total leads', href: { pathname: '/customers', params: { segment: 'leads' } }, hint: 'Opens Leads' },
  {
    key: 'bookedCalls',
    label: 'Booked calls',
    // `view` is the segment's quick filter, the same param the "Needs you" cards use for Clients.
    href: { pathname: '/customers', params: { segment: 'leads', view: 'booked' } },
    hint: 'Opens booked leads',
  },
  {
    key: 'activeSubs',
    label: 'Active subs',
    href: { pathname: '/customers', params: { segment: 'subscriptions' } },
    hint: 'Opens Subscriptions',
  },
  { key: 'pageviews30d', label: 'Pageviews 30d', href: '/analytics', hint: 'Opens Analytics' },
];

/** 2 x 2, or 1 column when the longest label would not fit a half-width card at this font scale. */
export function useKpiColumns(): 1 | 2 {
  const { width, fontScale } = useWindowDimensions();
  return kpiColumns(width, fontScale);
}

/**
 * The 2 x 2 KPI grid. Numbers count up from their previous value when a
 * refetch changes them (from zero on the very first load, when nothing was
 * cached). Stacks to one column when the labels would not fit at large font sizes.
 */
export function KpiGrid({ kpis, countFromZero }: { kpis: OverviewKpis; countFromZero: boolean }) {
  const columns = useKpiColumns();
  return (
    <KpiLayout columns={columns}>
      {KPIS.map((k) => (
        <StatCard
          key={k.key}
          label={k.label}
          value={kpis[k.key]}
          format={formatKpi}
          size="md"
          countFromZero={countFromZero}
          onPress={() => router.push(k.href)}
          accessibilityHint={k.hint}
          style={kpiCellStyle(columns)}
        />
      ))}
    </KpiLayout>
  );
}

/** Two rows of two, or one column. Shared with the skeleton. Expects four children. */
export function KpiLayout({ columns, children }: { columns: 1 | 2; children: ReactNode[] }) {
  if (columns === 1) return <View style={styles.column}>{children}</View>;
  return (
    <View style={styles.column}>
      <View style={styles.row}>{children.slice(0, 2)}</View>
      <View style={styles.row}>{children.slice(2, 4)}</View>
    </View>
  );
}

/** Half the row, for a card in the two-column layout. */
export const kpiCellStyle = (columns: 1 | 2) => (columns === 2 ? styles.cell : null);

const styles = StyleSheet.create({
  column: { gap: space[3] },
  row: { flexDirection: 'row', gap: space[3] },
  cell: { flex: 1 },
});
