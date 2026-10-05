import { StyleSheet, useWindowDimensions, View, type DimensionValue } from 'react-native';

import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Section } from '@/components/Section';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { layout, radius, space } from '@/design/tokens';
import { type } from '@/design/typography';

import { kpiCellStyle, KpiLayout, useKpiColumns, useVisibleKpis } from './KpiGrid';
import { clampScale } from './logic';
import { useAttentionCardSize } from './NeedsYou';

/** AreaChart plot (180) plus its x labels (20). */
const CHART_HEIGHT = 200;
const DONUT_SIZE = 168;
/** HBars rows are 40dp with a 4dp gap. */
const BAR_HEIGHT = 40;
const BAR_WIDTHS: DimensionValue[] = ['92%', '74%', '61%', '48%', '40%', '33%'];
const ROW_WIDTHS: DimensionValue[] = ['64%', '52%', '70%', '58%'];

/**
 * Home while the first load runs: the loaded layout in warm blocks, so nothing
 * moves when the data lands. The whole group waits for `showAfterMs` (a fast
 * load shows nothing at all) and shares one shimmer clock. Below the fold it
 * stops at the recent leads; nobody sees further before the data arrives.
 */
export function HomeSkeleton() {
  const columns = useKpiColumns();
  // The same cards the loaded grid shows (three for staff), so nothing moves when the numbers land.
  const kpis = useVisibleKpis();
  const card = useAttentionCardSize();
  return (
    <SkeletonGroup>
      <Section title="Needs you">
        <View style={styles.cards}>
          <Skeleton shape="block" width={card.width} height={card.minHeight} style={styles.cardBlock} />
          <Skeleton shape="block" width={card.width} height={card.minHeight} style={styles.cardBlock} />
        </View>
      </Section>

      <View style={styles.kpis}>
        <KpiLayout columns={columns}>
          {kpis.map((key) => (
            <KpiCardSkeleton key={key} columns={columns} />
          ))}
        </KpiLayout>
      </View>

      <Section title="Pageviews (last 30 days)">
        <Card>
          <Skeleton shape="block" height={CHART_HEIGHT} />
        </Card>
      </Section>

      <Section title="Traffic sources (30d)">
        <Card>
          <View style={styles.donut}>
            <Skeleton shape="circle" size={DONUT_SIZE} />
          </View>
          <View style={styles.legend}>
            {ROW_WIDTHS.map((w, i) => (
              <Skeleton key={i} width={w} height={13} />
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Top pages (30d)">
        <Card style={styles.barsCard}>
          <View style={styles.bars}>
            {BAR_WIDTHS.map((w, i) => (
              <Skeleton key={i} shape="block" width={w} height={BAR_HEIGHT} />
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Recent leads">
        <Card padded={false}>
          {ROW_WIDTHS.map((w, i) => (
            <View key={i}>
              {i > 0 ? <Divider inset={72} /> : null}
              <View style={styles.row}>
                <Skeleton shape="circle" size={40} />
                <View style={styles.rowLines}>
                  <Skeleton width={w} height={13} />
                  <Skeleton width="40%" height={11} />
                </View>
                <Skeleton width={56} height={20} style={styles.badge} />
              </View>
            </View>
          ))}
        </Card>
      </Section>
    </SkeletonGroup>
  );
}

/** The `number` variant's line (28sp display: 32 on Android, 34 on iOS). */
const KPI_NUMBER_LINE = type.number.lineHeight;

/** Sized like a `md` StatCard with no sub line: 28dp label row, then the number line (it grows with font scale). */
function KpiCardSkeleton({ columns }: { columns: 1 | 2 }) {
  const { fontScale } = useWindowDimensions();
  return (
    <Card style={kpiCellStyle(columns)}>
      <View style={styles.kpiLabel}>
        <Skeleton width="62%" height={11} />
      </View>
      <View style={[styles.kpiNumber, { height: Math.round(KPI_NUMBER_LINE * clampScale(fontScale)) }]}>
        <Skeleton width="48%" height={24} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', gap: space[3], overflow: 'hidden' },
  cardBlock: { borderRadius: radius.card },
  kpis: { marginBottom: layout.sectionGap },
  kpiLabel: { minHeight: 28, justifyContent: 'center' },
  kpiNumber: { marginTop: space[2], justifyContent: 'center' },
  donut: { alignItems: 'center' },
  legend: { marginTop: space[5], gap: space[4] },
  barsCard: { paddingHorizontal: space[2] },
  bars: { gap: space[1] },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: layout.gutter },
  rowLines: { flex: 1, gap: space[2] },
  badge: { borderRadius: radius.pill },
});
