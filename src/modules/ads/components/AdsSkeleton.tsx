import { StyleSheet, View, type DimensionValue } from 'react-native';

import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Section } from '@/components/Section';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { layout, radius, space } from '@/design/tokens';

import { chunk } from '../logic';

/** AreaChart plot (180) plus its x labels (20). */
const CHART_HEIGHT = 200;

/**
 * Ads while the first load runs: the loaded layout in warm blocks (sync card,
 * the two KPI panels, both charts, then campaign cards), so nothing moves when
 * the data lands. Waits for `showAfterMs`, so a fast load shows nothing.
 */
export function AdsSkeleton({ kpiColumns, metricColumns }: { kpiColumns: number; metricColumns: number }) {
  return (
    <SkeletonGroup>
      <Card style={styles.sync}>
        <View style={styles.syncRow}>
          <Skeleton shape="circle" size={18} />
          <Skeleton width="46%" height={14} />
        </View>
        <Skeleton width={176} height={40} style={styles.pill} />
      </Card>
      <PanelSkeleton title="What Meta reports" columns={kpiColumns} />
      <PanelSkeleton title="What the site recorded from those ads" columns={kpiColumns} />
      <Section title="Spend per day">
        <Card>
          <Skeleton shape="block" height={CHART_HEIGHT} />
        </Card>
      </Section>
      <Section title="Visits from ads per day">
        <Card>
          <Skeleton shape="block" height={CHART_HEIGHT} />
        </Card>
      </Section>
      <Section title="Campaigns">
        <View style={styles.cards}>
          <MetricsCardSkeleton columns={metricColumns} withTitle />
          <MetricsCardSkeleton columns={metricColumns} withTitle />
        </View>
      </Section>
    </SkeletonGroup>
  );
}

/** The campaign drill-down while its first load runs: the summary card, then two ad cards. */
export function CampaignSkeleton({ metricColumns }: { metricColumns: number }) {
  return (
    <SkeletonGroup>
      <View style={styles.summary}>
        <MetricsCardSkeleton columns={metricColumns} withTitle={false} />
      </View>
      <Section title="Ads">
        <View style={styles.cards}>
          <MetricsCardSkeleton columns={metricColumns} withTitle />
          <MetricsCardSkeleton columns={metricColumns} withTitle />
        </View>
      </Section>
    </SkeletonGroup>
  );
}

const CELL_WIDTHS: DimensionValue[] = ['58%', '44%', '52%', '40%'];

function PanelSkeleton({ title, columns }: { title: string; columns: number }) {
  const rows = chunk([0, 1, 2, 3], columns);
  return (
    <Section title={title}>
      <Card>
        {rows.map((row, r) => (
          <View key={r}>
            {r > 0 ? <Divider style={styles.panelDivider} /> : null}
            <View style={styles.panelRow}>
              {row.map((i) => (
                <View key={i} style={styles.cell}>
                  <View style={styles.panelLabel}>
                    <Skeleton width="62%" height={11} />
                  </View>
                  <Skeleton width={CELL_WIDTHS[i]} height={24} style={styles.panelNumber} />
                  <Skeleton width="48%" height={11} style={styles.panelSub} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </Card>
    </Section>
  );
}

const METRIC_CELLS = 8;

function MetricsCardSkeleton({ columns, withTitle }: { columns: number; withTitle: boolean }) {
  const rows = chunk(Array.from({ length: METRIC_CELLS }, (_, i) => i), columns);
  return (
    <Card>
      {withTitle ? (
        <View style={styles.cardTop}>
          <Skeleton width="58%" height={16} />
          <Skeleton width={56} height={20} style={styles.pill} />
        </View>
      ) : null}
      <Skeleton width={44} height={11} />
      <Skeleton width="36%" height={26} style={styles.spend} />
      <Divider style={styles.cardDivider} />
      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {Array.from({ length: columns }, (_, c) => (
              <View key={c} style={styles.cell}>
                {row[c] !== undefined ? (
                  <>
                    <Skeleton width="70%" height={11} />
                    <Skeleton width="50%" height={16} style={styles.metricValue} />
                  </>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  sync: { gap: space[3], marginBottom: space[6] },
  syncRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pill: { borderRadius: radius.pill },
  cell: { flex: 1 },
  panelRow: { flexDirection: 'row', gap: space[4] },
  panelLabel: { minHeight: 28, justifyContent: 'flex-end' },
  panelNumber: { marginTop: space[2] },
  panelSub: { marginTop: space[2] },
  panelDivider: { marginVertical: space[4] },
  cards: { gap: space[3] },
  summary: { marginBottom: layout.sectionGap },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4] },
  spend: { marginTop: space[2], borderRadius: radius.xs },
  cardDivider: { marginVertical: space[4] },
  grid: { gap: space[4] },
  gridRow: { flexDirection: 'row', gap: space[3] },
  metricValue: { marginTop: space[2] },
});
