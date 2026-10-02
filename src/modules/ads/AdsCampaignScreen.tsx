import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { adsKeys } from '@/api/endpoints/ads';
import { MESSAGES } from '@/api/errors';
import type { AdsAd, AdsConnectedReport } from '@/api/schemas/ads';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { countLabel, formatCount } from '@/lib/format';
import { metaQuery } from '@/modules/overview/hooks';

import { CampaignSkeleton } from './components/AdsSkeleton';
import { MetricsCard } from './components/MetricsCard';
import { NotConnectedCard } from './components/NotConnectedCard';
import { RangeChips } from './components/RangeChips';
import { cachedCampaignName, useAdsReport, useMetricColumns } from './hooks';
import { adsOf, campaignStatusBadge, cardMetrics, findCampaign, NO_CAMPAIGN_SPEND } from './logic';

const STALE_OPACITY = 0.5;
const NO_ADS = 'No ad in this campaign spent in this range.';

const adKey = (ad: AdsAd) => ad.id;

/**
 * The campaign drill-down (/ads/[campaignId], owner only): the campaign's
 * numbers for the shared range chip, then its ads as cards with the same
 * metrics, by spend. It reads the same GET /ads report as the Ads screen
 * (already cached when opened from there) and filters it by campaign.
 */
export function AdsCampaignScreen() {
  return (
    <OwnerOnly>
      <CampaignBody />
    </OwnerOnly>
  );
}

function CampaignBody() {
  const params = useLocalSearchParams<{ campaignId: string | string[] }>();
  const raw = params.campaignId;
  const campaignId = (Array.isArray(raw) ? raw[0] : raw) ?? '';

  const queryClient = useQueryClient();
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const { range, query } = useAdsReport();
  const meta = useQuery(metaQuery());
  const [cachedName] = useState(() => cachedCampaignName(queryClient, campaignId));
  const [countFromZero] = useState(() => query.data === undefined);

  // Offline on a range that was never loaded: say why instead of leaving the previous range up.
  const stuck = query.isPlaceholderData && query.fetchStatus === 'paused';
  const data = stuck ? undefined : query.data;
  const stale = query.isPlaceholderData && !stuck;
  const report: AdsConnectedReport | null = data?.connected ? data : null;
  const campaign = report ? findCampaign(report, campaignId) : null;
  const ads = report && campaign ? adsOf(report, campaign.id) : [];
  const notConnected = data !== undefined && !data.connected;

  const summaryMetrics = campaign ? cardMetrics(campaign) : [];
  const columns = useMetricColumns([...summaryMetrics, ...ads.flatMap(cardMetrics)].map((m) => m.value));

  const onRefresh = async () => {
    if (!connectivity.isOnline()) return;
    await Promise.all([query.refetch(), meta.refetch()]);
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<AdsAd>) => (
    <AdItem ad={item} index={index} columns={columns} still={reduceMotion} dim={stale} />
  );

  const header = (
    <View>
      {notConnected ? null : <RangeChips value={range} />}
      <View style={styles.gutter}>
        {query.isRefetchError && data !== undefined && online && !stale ? (
          <ErrorState compact error={query.error} onRetry={() => query.refetch()} style={styles.refetchError} />
        ) : null}
        {campaign ? (
          <View style={stale ? styles.stale : null}>
            <View style={styles.summary}>
              <MetricsCard
                badge={campaignStatusBadge(meta.data, campaign.status)}
                spend={campaign.spend}
                metrics={summaryMetrics}
                columns={columns}
                hero
                countFromZero={countFromZero}
              />
            </View>
            {ads.length > 0 ? (
              <Section
                title="Ads"
                spacing={space[3]}
                right={
                  <Text variant="small" color="ink4" tabular style={styles.count} accessibilityLabel={countLabel(ads.length, 'ad', 'ads')}>
                    {formatCount(ads.length)}
                  </Text>
                }
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  let empty: ReactNode;
  if (notConnected) {
    empty = <NotConnectedCard />;
  } else if (report) {
    // A campaign that spent nothing in this range has no row: say so calmly; another range may have it.
    empty = campaign ? <EmptyState message={NO_ADS} compact /> : <EmptyState message={NO_CAMPAIGN_SPEND} />;
  } else if (query.isError) {
    empty = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  } else if (stuck || (query.isPending && query.fetchStatus === 'paused')) {
    empty = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} />;
  } else {
    empty = <CampaignSkeleton metricColumns={columns} />;
  }

  return (
    <ScreenList<AdsAd>
      eyebrow="Campaign"
      title={campaign?.name ?? cachedName ?? 'Campaign'}
      back
      data={ads}
      renderItem={renderItem}
      keyExtractor={adKey}
      extraData={[columns, stale, reduceMotion]}
      ListHeaderComponent={header}
      ListEmptyComponent={<View style={styles.gutter}>{empty}</View>}
      ListFooterComponent={<View style={styles.footer} />}
      onRefresh={onRefresh}
      refetching={query.isFetching && data !== undefined}
      offlineBanner={data !== undefined}
      queryKey={adsKeys.range(range)}
    />
  );
}

type AdItemProps = { ad: AdsAd; index: number; columns: number; still: boolean; dim: boolean };

function AdItem({ ad, index, columns, still, dim }: AdItemProps) {
  const animate = !still && index < STAGGER_MAX;
  return (
    <Animated.View entering={animate ? enterPull(index) : undefined} style={[styles.item, dim ? styles.stale : null]}>
      <MetricsCard title={ad.name} spend={ad.spend} metrics={cardMetrics(ad)} columns={columns} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  refetchError: { marginBottom: space[4] },
  stale: { opacity: STALE_OPACITY },
  summary: { marginBottom: layout.sectionGap },
  count: { marginBottom: 2 },
  item: { paddingHorizontal: layout.gutter, paddingBottom: space[3] },
  footer: { height: space[8] },
});
