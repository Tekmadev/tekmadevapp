import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { Analytics } from '@/api/schemas/analytics';
import { StatCard } from '@/components/StatCard';
import { space } from '@/design/tokens';

import {
  averageLabel,
  formatAverage,
  formatKpi,
  formatTotal,
  kpiColumns,
  pageviewsSub,
  peakCaption,
  peakLabel,
  peakValue,
} from './logic';

type Props = {
  data: Analytics;
  now: Date;
  countFromZero: boolean;
};

/**
 * Brief 8.9 KPIs: Pageviews (the screen's key number, in gold, with the
 * comparison line), then the average per hour or day and the busiest bucket.
 * Numbers count up from what was on screen when the range changes.
 */
export function AnalyticsKpis({ data, now, countFromZero }: Props) {
  const avg = averageLabel(data.averagePer);
  const busiest = peakLabel(data.bucket);
  const columns = useSmallKpiColumns([avg, busiest]);
  return (
    <KpiBlock
      hero={
        <StatCard
          label="Pageviews"
          value={data.total}
          format={formatTotal}
          sub={pageviewsSub(data, now)}
          emphasis
          countFromZero={countFromZero}
        />
      }
      columns={columns}
      first={
        <StatCard
          label={avg}
          value={data.average}
          format={formatAverage}
          size="md"
          countFromZero={countFromZero}
          style={cellStyle(columns)}
        />
      }
      second={
        <StatCard
          label={busiest}
          value={peakValue(data)}
          format={formatKpi}
          sub={peakCaption(data)}
          size="md"
          countFromZero={countFromZero}
          style={cellStyle(columns)}
        />
      }
    />
  );
}

/** Side by side when both labels fit a half-width card at this font scale; stacked otherwise. */
export function useSmallKpiColumns(labels: readonly string[]): 1 | 2 {
  const { width, fontScale } = useWindowDimensions();
  return kpiColumns(width, fontScale, labels);
}

type KpiBlockProps = {
  hero: ReactNode;
  columns: 1 | 2;
  first: ReactNode;
  second: ReactNode;
};

/**
 * The KPI layout, shared with the skeleton so nothing moves when the numbers
 * land: the full-width hero card, then the two small cards in a row (both
 * stretch to the taller one) or stacked. Pass `cellStyle(columns)` to the small cards.
 */
export function KpiBlock({ hero, columns, first, second }: KpiBlockProps) {
  return (
    <View style={styles.block}>
      {hero}
      <View style={columns === 2 ? styles.row : styles.column}>
        {first}
        {second}
      </View>
    </View>
  );
}

/** Half the row, for a small card in the two-column layout. */
export const cellStyle = (columns: 1 | 2) => (columns === 2 ? styles.cell : null);

const styles = StyleSheet.create({
  block: { gap: space[3] },
  row: { flexDirection: 'row', gap: space[3] },
  column: { gap: space[3] },
  cell: { flex: 1 },
});
