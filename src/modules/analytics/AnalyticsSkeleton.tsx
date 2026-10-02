import { StyleSheet, useWindowDimensions, View, type DimensionValue } from 'react-native';

import type { AnalyticsRange } from '@/api/schemas/analytics';
import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { layout, radius, space } from '@/design/tokens';

import { cellStyle, KpiBlock, useSmallKpiColumns } from './AnalyticsKpis';
import { averageLabel, chartTitle, clampScale, expectedAveragePer, expectedBucket, peakLabel } from './logic';

/** AreaChart plot (180) plus its x labels (20). */
const CHART_HEIGHT = 200;
const DONUT_SIZE = 168;
/** Donut legend rows are 44dp with a 2dp gap, 16dp under the ring. */
const LEGEND_ROW = 44;
/** Sources usually fill the top 7 plus Other. */
const LEGEND_WIDTHS: DimensionValue[] = ['46%', '38%', '52%', '34%', '42%', '30%', '44%', '28%'];

/** StatCard parts: the eyebrow row, the number lines (lg 40sp, md 28sp at 1.16) and the small sub line. */
const LABEL_ROW = 28;
const NUMBER_LINE = { lg: 46, md: 32 } as const;
const SUB_LINE = 18;

/**
 * The Analytics tab while the first load runs: the loaded layout in warm
 * blocks with the real labels (the range already says the bucket), so nothing
 * moves when the data lands. The group waits for `showAfterMs` (a fast load
 * shows nothing) and shares one shimmer clock. It stops after the two donuts;
 * nobody sees further before the data arrives.
 */
export function AnalyticsSkeleton({ range }: { range: AnalyticsRange }) {
  const bucket = expectedBucket(range);
  const avg = averageLabel(expectedAveragePer(range));
  const busiest = peakLabel(bucket);
  const columns = useSmallKpiColumns([avg, busiest]);

  return (
    <SkeletonGroup>
      <View style={styles.kpis}>
        <KpiBlock
          hero={<KpiCardSkeleton label="Pageviews" size="lg" sub />}
          columns={columns}
          first={<KpiCardSkeleton label={avg} size="md" columns={columns} />}
          second={<KpiCardSkeleton label={busiest} size="md" sub columns={columns} />}
        />
      </View>

      <Section title={chartTitle(bucket)}>
        <Card>
          <Skeleton shape="block" height={CHART_HEIGHT} />
        </Card>
      </Section>

      <DonutSkeleton title="Traffic sources" rows={LEGEND_WIDTHS.length} />
      <DonutSkeleton title="Devices" rows={3} />
    </SkeletonGroup>
  );
}

type KpiCardSkeletonProps = {
  label: string;
  size: keyof typeof NUMBER_LINE;
  /** Holds a sub line under the number. */
  sub?: boolean;
  columns?: 1 | 2;
};

/** Sized like a StatCard of that size: the real eyebrow, then blocks for the number and sub line (they grow with font scale). */
function KpiCardSkeleton({ label, size, sub = false, columns }: KpiCardSkeletonProps) {
  const { fontScale } = useWindowDimensions();
  const scale = clampScale(fontScale);
  return (
    <Card style={columns ? cellStyle(columns) : null}>
      <View style={styles.label}>
        <Text variant="eyebrow" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={[styles.number, { height: Math.round(NUMBER_LINE[size] * scale) }]}>
        <Skeleton width={size === 'lg' ? '42%' : '56%'} height={size === 'lg' ? 34 : 24} />
      </View>
      {sub ? (
        <View style={[styles.sub, { height: Math.round(SUB_LINE * scale) }]}>
          <Skeleton width={size === 'lg' ? '64%' : '70%'} height={12} />
        </View>
      ) : null}
    </Card>
  );
}

function DonutSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <Section title={title}>
      <Card>
        <View style={styles.donut}>
          <Skeleton shape="circle" size={DONUT_SIZE} />
        </View>
        <View style={styles.legend}>
          {LEGEND_WIDTHS.slice(0, rows).map((w, i) => (
            <View key={i} style={styles.legendRow}>
              <Skeleton shape="circle" size={10} />
              <Skeleton width={w} height={13} />
            </View>
          ))}
        </View>
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  kpis: { marginBottom: layout.sectionGap },
  label: { minHeight: LABEL_ROW, justifyContent: 'center' },
  number: { marginTop: space[2], justifyContent: 'center' },
  sub: { marginTop: space[3], justifyContent: 'center' },
  donut: { alignItems: 'center' },
  legend: { marginTop: space[4], gap: 2 },
  legendRow: {
    minHeight: LEGEND_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[2],
    borderRadius: radius.sm,
  },
});
