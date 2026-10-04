import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { adsKeys } from '@/api/endpoints/ads';
import { MESSAGES } from '@/api/errors';
import type { AdsCampaign, AdsConnectedReport, AdsMeta } from '@/api/schemas/ads';
import { useCan } from '@/auth/permissions';
import { RequireCapability } from '@/auth/RequireCapability';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { countLabel, formatCount } from '@/lib/format';
import { metaQuery, useMinuteClock } from '@/modules/overview/hooks';

import { AdsSkeleton } from './components/AdsSkeleton';
import { DayCharts } from './components/DayCharts';
import { KpiPanel } from './components/KpiPanel';
import { MetricsCard } from './components/MetricsCard';
import { NotConnectedCard } from './components/NotConnectedCard';
import { RangeChips } from './components/RangeChips';
import { SyncCard } from './components/SyncCard';
import { useAdsReport, useKpiColumns, useMetaPull, useMetricColumns } from './hooks';
import { campaignStatusBadge, cardMetrics, hasSpend, kpiTexts, metaKpis, NO_SPEND, siteKpis } from './logic';

/** Shown while the previous range stays on screen and the new one loads. */
const STALE_OPACITY = 0.5;

const campaignKey = (c: AdsCampaign) => c.id;

/**
 * Ads (brief 8.10, `ads.view`): what Meta reports next to what the site
 * recorded from those ads, for the range chip. The sync line and "Refresh from
 * Meta" (a long job, `ads.refresh` only) sit on top, then the two KPI panels,
 * spend and visits per day, and campaign cards by spend (tap one for the ads
 * inside it).
 */
export function AdsScreen() {
  return (
    <RequireCapability cap="ads.view">
      <AdsBody />
    </RequireCapability>
  );
}

function AdsBody() {
  const now = useMinuteClock();
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const { range, query } = useAdsReport();
  const meta = useQuery(metaQuery());
  const pull = useMetaPull();
  const canRefresh = useCan('ads.refresh');
  // Numbers count up from zero only on a first load with nothing cached; after that from what was shown.
  const [countFromZero] = useState(() => query.data === undefined);

  // Offline on a range that was never loaded: the previous range would sit there forever, so say why instead.
  const stuck = query.isPlaceholderData && query.fetchStatus === 'paused';
  const data = stuck ? undefined : query.data;
  const stale = query.isPlaceholderData && !stuck;
  const report: AdsConnectedReport | null = data?.connected ? data : null;
  const spent = report ? hasSpend(report) : false;
  const campaigns = report && spent ? report.campaigns : [];

  const metaItems = report ? metaKpis(report) : [];
  const siteItems = report ? siteKpis(report) : [];
  const kpiColumns = useKpiColumns(kpiTexts([...metaItems, ...siteItems]));
  const metricColumns = useMetricColumns(campaigns.flatMap((c) => cardMetrics(c).map((m) => m.value)));

  const onRefresh = async () => {
    // Offline a refetch would wait for the connection with the black hole spinning; the banner already explains.
    if (!connectivity.isOnline()) return;
    await Promise.all([query.refetch(), meta.refetch()]);
  };

  const open = (campaign: AdsCampaign) => {
    router.push({ pathname: '/ads/[campaignId]', params: { campaignId: campaign.id } });
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<AdsCampaign>) => (
    <CampaignItem campaign={item} index={index} meta={meta.data} columns={metricColumns} still={reduceMotion} dim={stale} onOpen={open} />
  );

  const notConnected = data !== undefined && !data.connected;

  const header = (
    <View>
      {notConnected ? null : <RangeChips value={range} />}
      <View style={styles.gutter}>
        {query.isRefetchError && data !== undefined && online && !stale ? (
          <ErrorState compact error={query.error} onRetry={() => query.refetch()} style={styles.refetchError} />
        ) : null}
        {/* The last sync is the same for every range, so it never dims while a range loads. */}
        {report ? <SyncCard lastSync={report.lastSync} now={now} pull={canRefresh ? pull : null} /> : null}
        {report && spent ? (
          <View style={stale ? styles.stale : null}>
            <KpiPanel title="What Meta reports" items={metaItems} columns={kpiColumns} countFromZero={countFromZero} />
            <KpiPanel title="What the site recorded from those ads" items={siteItems} columns={kpiColumns} countFromZero={countFromZero} />
            <DayCharts days={report.days} range={range} now={now} />
          </View>
        ) : null}
        {campaigns.length > 0 ? (
          <Section
            title="Campaigns"
            spacing={space[3]}
            right={
              <Text variant="small" color="ink4" tabular style={styles.count} accessibilityLabel={countLabel(campaigns.length, 'campaign', 'campaigns')}>
                {formatCount(campaigns.length)}
              </Text>
            }
            style={stale ? styles.stale : null}
          />
        ) : null}
      </View>
    </View>
  );

  let empty: ReactNode;
  if (notConnected) {
    empty = <NotConnectedCard />;
  } else if (report) {
    // Connected with nothing spent in the range: a calm line, not zeros.
    empty = spent ? null : <EmptyState message={NO_SPEND} />;
  } else if (query.isError) {
    empty = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  } else if (stuck || (query.isPending && query.fetchStatus === 'paused')) {
    // Offline with nothing cached for this range. The fetch resumes by itself once the connection is back.
    empty = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    empty = <AdsSkeleton kpiColumns={kpiColumns} metricColumns={metricColumns} />;
  }

  return (
    <ScreenList<AdsCampaign>
      title="Ads"
      back
      data={campaigns}
      renderItem={renderItem}
      keyExtractor={campaignKey}
      extraData={[meta.data, metricColumns, stale, reduceMotion]}
      ListHeaderComponent={header}
      ListEmptyComponent={empty ? <View style={styles.gutter}>{empty}</View> : null}
      ListFooterComponent={<View style={styles.footer} />}
      onRefresh={onRefresh}
      refetching={query.isFetching && data !== undefined}
      // The banner says "showing what was loaded at ..."; with nothing loaded the ErrorState says it instead.
      offlineBanner={data !== undefined}
      queryKey={adsKeys.range(range)}
    />
  );
}

type CampaignItemProps = {
  campaign: AdsCampaign;
  index: number;
  meta: AdsMeta | undefined;
  columns: number;
  still: boolean;
  dim: boolean;
  onOpen: (campaign: AdsCampaign) => void;
};

function CampaignItem({ campaign, index, meta, columns, still, dim, onOpen }: CampaignItemProps) {
  const animate = !still && index < STAGGER_MAX;
  return (
    <Animated.View entering={animate ? enterPull(index) : undefined} style={[styles.item, dim ? styles.stale : null]}>
      <MetricsCard
        title={campaign.name}
        badge={campaignStatusBadge(meta, campaign.status)}
        spend={campaign.spend}
        metrics={cardMetrics(campaign)}
        columns={columns}
        onPress={() => onOpen(campaign)}
        accessibilityHint="Opens the ads in this campaign"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  refetchError: { marginBottom: space[4] },
  stale: { opacity: STALE_OPACITY },
  count: { marginBottom: 2 },
  item: { paddingHorizontal: layout.gutter, paddingBottom: space[3] },
  footer: { height: space[8] },
});
