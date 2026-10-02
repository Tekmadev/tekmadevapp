import { StyleSheet } from 'react-native';

import type { AnalyticsBucket, AnalyticsPoint, AnalyticsRange, CountryCount } from '@/api/schemas/analytics';
import type { LabelCount } from '@/api/types';
import { Card } from '@/components/Card';
import { AreaChart } from '@/components/charts/AreaChart';
import { Donut } from '@/components/charts/Donut';
import { HBars, type HBarDatum } from '@/components/charts/HBars';
import { EmptyState } from '@/components/EmptyState';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import { chartPoints, chartTitle, countryRows, FOOTNOTE, hasTraffic, NO_DATA, periodPhrase } from './logic';

/** "No data yet." in a card: empty is not failed (failures are ErrorState). */
function NoData() {
  return <EmptyState message={NO_DATA} compact />;
}

/**
 * "Pageviews by {bucket}": the gold area chart with scrub. Labels and tooltip
 * titles are the server's text, never parsed as dates. An all-zero series
 * (nothing tracked yet) says "No data yet." instead of drawing a flat line.
 */
export function PageviewsChart({ series, bucket, range }: { series: readonly AnalyticsPoint[]; bucket: AnalyticsBucket; range: AnalyticsRange }) {
  return (
    <Section title={chartTitle(bucket)}>
      <Card>{hasTraffic(series) ? <AreaChart data={chartPoints(series)} name="Pageviews" period={periodPhrase(range)} /> : <NoData />}</Card>
    </Section>
  );
}

/** A share-of-total ring (top 7 plus Other) with its legend: Traffic sources, Devices. */
export function ShareSection({ title, rows }: { title: string; rows: readonly LabelCount[] }) {
  return (
    <Section title={title}>
      <Card>{hasTraffic(rows) ? <Donut data={rows} limit={7} name={title} /> : <NoData />}</Card>
    </Section>
  );
}

type BarsSectionProps = {
  title: string;
  rows: readonly HBarDatum[];
  /** Paths keep their end readable ("/blog/…-checklist"). */
  ellipsize?: 'tail' | 'middle';
};

/** A ranked top list as bars (Top pages, Top countries, Referrers), in the API's order. */
export function BarsSection({ title, rows, ellipsize = 'tail' }: BarsSectionProps) {
  return (
    <Section title={title}>
      <Card style={styles.bars}>{rows.length > 0 ? <HBars data={rows} limit={10} ellipsize={ellipsize} /> : <NoData />}</Card>
    </Section>
  );
}

export function labelRows(rows: readonly LabelCount[]): HBarDatum[] {
  return rows.map((r) => ({ label: r.label, value: r.count }));
}

/** Top countries: flag emoji (built from the ISO code) plus the name. */
export function CountriesSection({ countries }: { countries: readonly CountryCount[] }) {
  return <BarsSection title="Top countries" rows={countryRows(countries)} />;
}

/** Brief 8.9: the quiet line under the last list. */
export function Footnote() {
  return (
    <Text variant="small" color="ink4" align="center" style={styles.footnote}>
      {FOOTNOTE}
    </Text>
  );
}

const styles = StyleSheet.create({
  // The bars carry their own side padding; the card's would double it.
  bars: { paddingHorizontal: space[2] },
  footnote: { paddingHorizontal: space[4], paddingBottom: space[2] },
});
