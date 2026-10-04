import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { analyticsKeys, analyticsQuery } from '@/api/endpoints/analytics';
import { errorMessage, MESSAGES } from '@/api/errors';
import { ANALYTICS_RANGES, type Analytics, type AnalyticsRange } from '@/api/schemas/analytics';
import { deniedMessage, useCan } from '@/auth/permissions';
import { useSession } from '@/auth/session';
import { ErrorState } from '@/components/ErrorState';
import { FilterChips, type FilterChipItem } from '@/components/FilterChips';
import { Screen, type ScreenHandle } from '@/components/Screen';
import { enterPull, fade, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { useMinuteClock, useRefetchOnFocus, useTabPressScrollToTop } from '@/modules/overview/hooks';
import { TabHeaderActions } from '@/modules/shell/TabHeaderActions';

import { AnalyticsKpis } from './AnalyticsKpis';
import { BarsSection, CountriesSection, Footnote, labelRows, PageviewsChart, ShareSection } from './AnalyticsSections';
import { AnalyticsSkeleton } from './AnalyticsSkeleton';
import { toRange } from './logic';

const RANGE_CHIPS: readonly FilterChipItem<AnalyticsRange>[] = ANALYTICS_RANGES;

/** Opacity of the previous range's numbers while the new range loads. */
const STALE_OPACITY = 0.55;

type AnalyticsParams = { range?: string };

/**
 * Analytics (brief 8.9, its own tab by owner decision): first-party pageviews
 * for a range. The range lives in the route param `range` (default 30 days),
 * so it survives tab switches and a link can open a given range. Switching
 * range keeps the previous numbers on screen, dimmed, under the gold hairline
 * until the new ones land, so nothing jumps. Cached data shows at once and
 * refreshes on focus, on app resume and on a pull. A first load shows the
 * skeleton after `showAfterMs`; a failure shows ErrorState, never zeros.
 * Needs `analytics.view` (every role by default). It is a tab, so someone
 * without it gets the server's refusal in place rather than being sent away.
 */
export function AnalyticsScreen() {
  const allowed = useCan('analytics.view');
  // Nobody known (the moment of signing out): no data, and no refusal either.
  const known = useSession((s) => s.me !== null);
  return allowed ? <AnalyticsTab /> : <AnalyticsDenied known={known} />;
}

/** The tab for someone whose role cannot see Analytics: the header, and why there is nothing. */
function AnalyticsDenied({ known }: { known: boolean }) {
  return (
    <Screen title="Analytics" headerRight={<TabHeaderActions />}>
      {known ? <ErrorState message={deniedMessage('analytics.view')} /> : null}
    </Screen>
  );
}

function AnalyticsTab() {
  const params = useLocalSearchParams<AnalyticsParams>();
  const range = toRange(params.range);
  const online = useIsOnline();
  const now = useMinuteClock();
  const screenRef = useRef<ScreenHandle>(null);
  const scrollY = useSharedValue(0);
  const query = useQuery({ ...analyticsQuery(range), placeholderData: keepPreviousData });
  // Numbers count up from zero only on the very first load; later they count from what was shown.
  const [countFromZero] = useState(() => query.data === undefined);

  const { data, dataUpdatedAt, refetch, isPlaceholderData } = query;
  useRefetchOnFocus(refetch, dataUpdatedAt);
  useTabPressScrollToTop(() => screenRef.current?.scrollToTop());

  // Offline with nothing cached for this range, the read waits for the connection. The previous
  // range's numbers under the new chip would be wrong, and a skeleton would never end: say so.
  // (While the previous range stands in, TanStack reports success with isPlaceholderData, not pending.)
  const waitingOffline = (query.isPending || isPlaceholderData) && query.fetchStatus === 'paused';

  const setRange = (next: AnalyticsRange | null) => {
    if (next && next !== range) router.setParams({ range: next });
  };

  const onRefresh = async () => {
    // Offline a refetch would wait for the connection with the black hole spinning; the banner already explains.
    if (!connectivity.isOnline()) return;
    const result = await refetch();
    // With data on screen a failed pull keeps it and says why.
    if (result.isError && result.data !== undefined && connectivity.isOnline()) notice.err(errorMessage(result.error));
  };

  let body: ReactNode;
  if (waitingOffline) {
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => refetch() : undefined} />;
  } else if (data) {
    body = (
      <Stale stale={isPlaceholderData}>
        <AnalyticsBody data={data} now={now} countFromZero={countFromZero} />
      </Stale>
    );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => refetch()} />;
  } else {
    body = <AnalyticsSkeleton range={range} />;
  }

  return (
    <Screen
      ref={screenRef}
      title="Analytics"
      headerRight={<TabHeaderActions />}
      onRefresh={onRefresh}
      // The hairline runs for a background refetch and while a new range loads over the old one.
      refetching={query.isFetching && data !== undefined}
      // "Showing what was loaded at ..." for this range; with nothing loaded the ErrorState says it instead.
      offlineBanner={data !== undefined && !waitingOffline}
      queryKey={analyticsKeys.range(range)}
      scrollY={scrollY}
      // The range chips stay under the header, so the range can change from anywhere down the page.
      stickyHeaderIndices={[0]}
    >
      <RangeRow key="range" range={range} onChange={setRange} scrollY={scrollY} />
      <View key="body">{body}</View>
    </Screen>
  );
}

type BodyProps = {
  data: Analytics;
  now: Date;
  countFromZero: boolean;
};

/**
 * The loaded sections in order, pulled into place with the list stagger on
 * the first load. A new range swaps the numbers in place (same keys), so the
 * blocks never re-enter; the charts animate to the new data themselves.
 */
function AnalyticsBody({ data, now, countFromZero }: BodyProps) {
  const reduceMotion = useReduceMotion();
  const blocks: { key: string; node: ReactNode }[] = [
    {
      key: 'kpis',
      node: (
        <View style={styles.block}>
          <AnalyticsKpis data={data} now={now} countFromZero={countFromZero} />
        </View>
      ),
    },
    { key: 'pageviews', node: <PageviewsChart series={data.series} bucket={data.bucket} range={data.range} /> },
    { key: 'sources', node: <ShareSection title="Traffic sources" rows={data.topSources} /> },
    { key: 'devices', node: <ShareSection title="Devices" rows={data.devices} /> },
    { key: 'pages', node: <BarsSection title="Top pages" rows={labelRows(data.topPages)} ellipsize="middle" /> },
    { key: 'countries', node: <CountriesSection countries={data.countries} /> },
    { key: 'referrers', node: <BarsSection title="Referrers" rows={labelRows(data.topReferrers)} /> },
    { key: 'footnote', node: <Footnote /> },
  ];

  return blocks.map((b, i) => (
    <Animated.View key={b.key} entering={reduceMotion || i >= STAGGER_MAX ? undefined : enterPull(i)}>
      {b.node}
    </Animated.View>
  ));
}

type RangeRowProps = {
  range: AnalyticsRange;
  onChange: (next: AnalyticsRange | null) => void;
  scrollY: SharedValue<number>;
};

/**
 * The range chips, sticky under the header. The row is opaque and runs edge to
 * edge so content scrolling under it is covered, and a hairline shows under it
 * only while it is stuck.
 */
function RangeRow({ range, onChange, scrollY }: RangeRowProps) {
  const { colors } = useTheme();
  // Where the row sits in the content; it is stuck once the page scrolls past it.
  const top = useSharedValue(0);
  const stuckStyle = useAnimatedStyle(() => ({ opacity: top.get() > 0 && scrollY.get() > top.get() ? 1 : 0 }));
  return (
    <View onLayout={(e) => top.set(e.nativeEvent.layout.y)} style={[styles.rangeRow, { backgroundColor: colors.bg }]}>
      <FilterChips items={RANGE_CHIPS} value={range} onChange={onChange} accessibilityLabel="Range" />
      <Animated.View pointerEvents="none" style={[styles.line, { backgroundColor: colors.line }, stuckStyle]} />
    </View>
  );
}

/**
 * The previous range's data while the new range loads: dimmed (a 220ms fade,
 * instant with reduced motion) and marked busy for TalkBack.
 */
function Stale({ stale, children }: { stale: boolean; children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(stale ? STALE_OPACITY : 1);
  useEffect(() => {
    const target = stale ? STALE_OPACITY : 1;
    opacity.set(reduceMotion ? target : withTiming(target, fade()));
  }, [stale, reduceMotion, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View style={style} accessibilityState={{ busy: stale }}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Bleeds to the screen edges (the chips line up with the gutter inside). The space under the
  // chips is padding, not margin, so nothing see-through sits between the row and the content.
  rangeRow: {
    marginHorizontal: -layout.gutter,
    paddingHorizontal: layout.gutter,
    paddingBottom: space[4],
  },
  line: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 },
  block: { marginBottom: layout.sectionGap },
});
