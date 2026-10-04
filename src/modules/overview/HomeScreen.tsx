import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { notificationKeys } from '@/api/endpoints/notifications';
import { overviewKeys, overviewQuery } from '@/api/endpoints/overview';
import { errorMessage, MESSAGES } from '@/api/errors';
import type { Meta } from '@/api/schemas/meta';
import type { Overview } from '@/api/schemas/overview';
import { isUpdateAvailable } from '@/auth/appVersion';
import { useCan } from '@/auth/permissions';
import { firstName, session, useMe } from '@/auth/session';
import { ErrorState } from '@/components/ErrorState';
import { Fab } from '@/components/Fab';
import { Screen, type ScreenHandle } from '@/components/Screen';
import { UpdateCard } from '@/components/UpdateCard';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { eyebrowDate, greeting } from '@/lib/dates';
import { env } from '@/lib/env';
import { notice } from '@/lib/notice';
import { PlusSheet } from '@/modules/quickActions/PlusSheet';
import { plusSheetActions, useVisibility } from '@/modules/registry';

import { HeaderGrain, HomeHeaderRight, TitleGrain } from './HomeHeader';
import { HomeSkeleton } from './HomeSkeleton';
import { metaQuery, useDismissedUpdate, useMinuteClock, useRefetchOnFocus, useTabPressScrollToTop } from './hooks';
import { KpiGrid } from './KpiGrid';
import { quickActionsHint } from './logic';
import { NeedsYou } from './NeedsYou';
import { RecentLeads, RecentSubscriptions } from './RecentSections';
import { LinksSection, PagesSection, PageviewsSection, SourcesSection } from './TrafficSections';

/** Room under the last section so the gold + never covers it. */
const FAB_CLEARANCE = 56 + space[4];

/**
 * Home (brief 8.3): in five seconds, what needs you and how the business is
 * doing. One GET /overview feeds every section. Cached data shows at once and
 * refreshes on mount, on focus, on app resume and on a pull (the gold hairline
 * shows while a background refetch runs). A first load shows the skeleton after
 * `showAfterMs`; a failed first load shows ErrorState, never zeros.
 */
export function HomeScreen() {
  const me = useMe();
  const now = useMinuteClock();
  const online = useIsOnline();
  const queryClient = useQueryClient();
  const overview = useQuery(overviewQuery());
  const meta = useQuery(metaQuery());
  const screenRef = useRef<ScreenHandle>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [contentTop, setContentTop] = useState(0);
  const [dismissedUpdate, dismissUpdate] = useDismissedUpdate();
  // The gold + lists only what this person may do; with nothing to offer it is not shown.
  const plusHint = quickActionsHint(plusSheetActions(useVisibility()).map((a) => a.title));
  // Numbers count up from zero only on the very first load; with a cache they count from what was shown.
  const [countFromZero] = useState(() => overview.data === undefined);

  const { data, dataUpdatedAt, refetch } = overview;
  useRefetchOnFocus(refetch, dataUpdatedAt);
  useTabPressScrollToTop(() => screenRef.current?.scrollToTop());

  // The overview carries the caller's inbox summary: keep the bell's count in step with "Needs you".
  const inbox = data?.inbox;
  useEffect(() => {
    if (!inbox) return;
    const key = notificationKeys.summary();
    const current = queryClient.getQueryState(key);
    if (current && current.dataUpdatedAt >= dataUpdatedAt) return;
    queryClient.setQueryData(key, inbox, { updatedAt: dataUpdatedAt });
  }, [inbox, dataUpdatedAt, queryClient]);

  const onRefresh = async () => {
    // Offline a refetch would wait for the connection with the black hole spinning; the banner already explains.
    if (!connectivity.isOnline()) return;
    const [result] = await Promise.all([refetch(), session.refreshMe().catch(() => null)]);
    // With data on screen a failed pull keeps it and says why; offline, the banner already does.
    if (result.isError && result.data !== undefined && connectivity.isOnline()) notice.err(errorMessage(result.error));
  };

  const name = firstName(me);
  const title = name ? `${greeting(now)}, ${name}` : 'Overview';

  const app = me?.app;
  const showUpdate = Boolean(app && env.appVersion !== '0.0.0' && isUpdateAvailable(app) && dismissedUpdate !== app.latestVersion);
  const updateCard =
    app && showUpdate ? (
      <UpdateCard latestVersion={app.latestVersion} apkUrl={app.apkUrl} onDismiss={() => dismissUpdate(app.latestVersion)} />
    ) : null;

  let body: ReactNode;
  if (data) {
    body = (
      <HomeSections
        data={data}
        meta={meta.data}
        now={now}
        updatedAt={dataUpdatedAt}
        countFromZero={countFromZero}
        updateCard={updateCard}
      />
    );
  } else if (overview.isError) {
    body = <ErrorState error={overview.error} onRetry={() => refetch()} />;
  } else if (overview.fetchStatus === 'paused') {
    // Offline with nothing cached. The fetch resumes by itself once the connection is back.
    body = <ErrorState message={MESSAGES.network} onRetry={online ? () => refetch() : undefined} />;
  } else {
    body = <HomeSkeleton />;
  }

  return (
    <View style={styles.fill}>
      <Screen
        ref={screenRef}
        eyebrow={eyebrowDate(now)}
        title={title}
        headerRight={<HomeHeaderRight me={me} />}
        onRefresh={onRefresh}
        refetching={overview.isRefetching && data !== undefined}
        // The banner says "showing what was loaded at ..."; with nothing loaded the ErrorState says it instead.
        offlineBanner={data !== undefined}
        queryKey={overviewKeys.all}
      >
        <TitleGrain key="grain" height={contentTop} />
        <View key="body" onLayout={(e: LayoutChangeEvent) => setContentTop(e.nativeEvent.layout.y)}>
          {body}
          <View style={styles.fabClearance} />
        </View>
      </Screen>
      <HeaderGrain />
      {plusHint ? <Fab accessibilityLabel="Quick actions" accessibilityHint={plusHint} onPress={() => setPlusOpen(true)} /> : null}
      <PlusSheet visible={plusOpen} onClose={() => setPlusOpen(false)} />
    </View>
  );
}

type HomeSectionsProps = {
  data: Overview;
  meta: Meta | undefined;
  now: Date;
  updatedAt: number;
  countFromZero: boolean;
  updateCard: ReactNode;
};

/** The loaded sections in order. The first 8 are pulled into place with the list stagger. */
function HomeSections({ data, meta, now, updatedAt, countFromZero, updateCard }: HomeSectionsProps) {
  const reduceMotion = useReduceMotion();
  // Revenue (Active subs, Recent subscriptions) is for owners and managers. The server sends null to
  // anyone else; the capability decides, so the layout is the same before and after the data lands.
  const seesRevenue = useCan('overview.revenue');
  const seesSubscriptions = useCan('billing.view');
  const seesLeads = useCan('leads.view');
  const links = data.topLinks;
  const subscriptions = seesRevenue ? data.recentSubscriptions : null;

  const blocks: { key: string; node: ReactNode }[] = [
    { key: 'needs', node: <NeedsYou attention={data.attention} countFromZero={countFromZero} /> },
    ...(updateCard ? [{ key: 'update', node: <View style={styles.block}>{updateCard}</View> }] : []),
    {
      key: 'kpis',
      node: (
        <View style={styles.block}>
          <KpiGrid kpis={data.kpis} countFromZero={countFromZero} />
        </View>
      ),
    },
    { key: 'pageviews', node: <PageviewsSection series={data.traffic.series} /> },
    { key: 'sources', node: <SourcesSection sources={data.traffic.topSources} /> },
    { key: 'pages', node: <PagesSection pages={data.traffic.topPages} /> },
    // Null without links.view, and shown only when a link had a visit.
    ...(links && links.length > 0 ? [{ key: 'links', node: <LinksSection links={links} /> }] : []),
    { key: 'leads', node: <RecentLeads leads={data.recentLeads} meta={meta} now={now} updatedAt={updatedAt} canOpen={seesLeads} /> },
    ...(subscriptions
      ? [
          {
            key: 'subs',
            node: <RecentSubscriptions subscriptions={subscriptions} meta={meta} now={now} canOpenAll={seesSubscriptions} />,
          },
        ]
      : []),
  ];

  return blocks.map((b, i) => (
    <Animated.View key={b.key} entering={reduceMotion || i >= STAGGER_MAX ? undefined : enterPull(i)}>
      {b.node}
    </Animated.View>
  ));
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: { marginBottom: layout.sectionGap },
  fabClearance: { height: FAB_CLEARANCE },
});
