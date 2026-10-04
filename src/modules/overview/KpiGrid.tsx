import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { OverviewKpis } from '@/api/schemas/overview';
import { useCapabilities } from '@/auth/permissions';
import { StatCard } from '@/components/StatCard';
import { space } from '@/design/tokens';

import { formatKpi, KPI_OPENS, kpiColumns, kpiRows, visibleKpis } from './logic';

type Kpi = {
  label: string;
  href: Href;
  hint: string;
};

/** Brief 8.3 item 3. Each card opens the list its number comes from. */
const KPIS: Record<keyof OverviewKpis, Kpi> = {
  totalLeads: { label: 'Total leads', href: { pathname: '/customers', params: { segment: 'leads' } }, hint: 'Opens Leads' },
  bookedCalls: {
    label: 'Booked calls',
    // `view` is the segment's quick filter, the same param the "Needs you" cards use for Clients.
    href: { pathname: '/customers', params: { segment: 'leads', view: 'booked' } },
    hint: 'Opens booked leads',
  },
  activeSubs: {
    label: 'Active subs',
    href: { pathname: '/customers', params: { segment: 'subscriptions' } },
    hint: 'Opens Subscriptions',
  },
  pageviews30d: { label: 'Pageviews 30d', href: { pathname: '/analytics', params: { range: '30d' } }, hint: 'Opens Analytics' },
};

/** The KPI cards the signed-in person sees (Active subs needs `overview.revenue`). Shared with the skeleton. */
export function useVisibleKpis(): (keyof OverviewKpis)[] {
  const caps = useCapabilities();
  return visibleKpis((cap) => caps.includes(cap));
}

/** 2 x 2, or 1 column when the longest label would not fit a half-width card at this font scale. */
export function useKpiColumns(): 1 | 2 {
  const { width, fontScale } = useWindowDimensions();
  return kpiColumns(width, fontScale);
}

/**
 * The 2 x 2 KPI grid (three cards for staff, who never see revenue: the last
 * spans the row). Numbers count up from their previous value when a refetch
 * changes them (from zero on the very first load, when nothing was cached).
 * Stacks to one column when the labels would not fit at large font sizes.
 */
export function KpiGrid({ kpis, countFromZero }: { kpis: OverviewKpis; countFromZero: boolean }) {
  const columns = useKpiColumns();
  const caps = useCapabilities();
  const keys = useVisibleKpis();
  return (
    <KpiLayout columns={columns}>
      {keys.map((key) => {
        const k = KPIS[key];
        const opens = caps.includes(KPI_OPENS[key]);
        return (
          <StatCard
            key={key}
            label={k.label}
            value={kpis[key]}
            format={formatKpi}
            size="md"
            countFromZero={countFromZero}
            onPress={opens ? () => router.push(k.href) : undefined}
            accessibilityHint={opens ? k.hint : undefined}
            style={kpiCellStyle(columns)}
          />
        );
      })}
    </KpiLayout>
  );
}

/** Rows of two (an odd last card spans the row), or one column. Shared with the skeleton. */
export function KpiLayout({ columns, children }: { columns: 1 | 2; children: ReactNode[] }) {
  if (columns === 1) return <View style={styles.column}>{children}</View>;
  return (
    <View style={styles.column}>
      {kpiRows(children).map((row, i) => (
        <View key={i} style={styles.row}>
          {row}
        </View>
      ))}
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
