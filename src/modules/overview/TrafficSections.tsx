import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import type { AnalyticsPoint } from '@/api/schemas/analytics';
import type { TopLink } from '@/api/schemas/overview';
import type { LabelCount } from '@/api/types';
import { Card } from '@/components/Card';
import { AreaChart } from '@/components/charts/AreaChart';
import { Donut } from '@/components/charts/Donut';
import { HBars, type HBarDatum } from '@/components/charts/HBars';
import { EmptyState } from '@/components/EmptyState';
import { Section } from '@/components/Section';
import { space } from '@/design/tokens';

/** Brief 8.3: every chart section says this when its list is empty. */
export const NO_DATA = 'No data yet.';

function NoData() {
  return <EmptyState message={NO_DATA} compact />;
}

/** "Pageviews (last 30 days)": the gold area chart with scrub. */
export function PageviewsSection({ series }: { series: readonly AnalyticsPoint[] }) {
  // Labels are Toronto text from the server ("Sep 12"): never parsed as dates.
  const points = series.map((p) => ({ label: p.label, value: p.count, title: p.title }));
  return (
    <Section title="Pageviews (last 30 days)">
      <Card>{points.length > 0 ? <AreaChart data={points} name="Pageviews" period="last 30 days" /> : <NoData />}</Card>
    </Section>
  );
}

/** "Traffic sources (30d)": top 7 plus Other (the Donut groups the rest). */
export function SourcesSection({ sources }: { sources: readonly LabelCount[] }) {
  const hasData = sources.some((s) => s.count > 0);
  return (
    <Section title="Traffic sources (30d)">
      <Card>{hasData ? <Donut data={sources} limit={7} name="Traffic sources" /> : <NoData />}</Card>
    </Section>
  );
}

/** "Top pages (30d)": the top 10 paths, the end of a long path kept readable. */
export function PagesSection({ pages }: { pages: readonly LabelCount[] }) {
  const rows: HBarDatum[] = pages.map((p) => ({ label: p.label, value: p.count }));
  return (
    <Section title="Top pages (30d)">
      <Card style={styles.bars}>{rows.length > 0 ? <HBars data={rows} limit={10} ellipsize="middle" /> : <NoData />}</Card>
    </Section>
  );
}

/**
 * "Top tracking links (30d)": null without `links.view`, and shown only when a
 * link had a visit, so the caller skips it otherwise. A bar opens the link.
 */
export function LinksSection({ links }: { links: readonly TopLink[] }) {
  const rows: HBarDatum[] = links.map((l) => ({ key: l.id, label: l.label?.trim() || `/${l.slug}`, value: l.count }));
  const open = (row: HBarDatum) => {
    if (row.key) router.push({ pathname: '/links/[id]', params: { id: row.key } });
  };
  return (
    <Section title="Top tracking links (30d)">
      <Card style={styles.bars}>{rows.length > 0 ? <HBars data={rows} limit={10} onPressRow={open} /> : <NoData />}</Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  // The bars carry their own side padding; the card's would double it.
  bars: { paddingHorizontal: space[2] },
});
