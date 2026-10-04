import type { ListRenderItemInfo } from '@shopify/flash-list';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { staffActivityQuery, teamKeys } from '@/api/endpoints/team';
import { MESSAGES } from '@/api/errors';
import type { ActivityRange, StaffActivityRow } from '@/api/schemas/team';
import { useMe } from '@/auth/session';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FilterChips } from '@/components/FilterChips';
import { ScreenList } from '@/components/ScreenList';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { connectivity, useIsOnline } from '@/lib/connectivity';
import { formatShortDate } from '@/lib/dates';
import { useMeta } from '@/modules/clients/detail/meta';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';
import { useMinuteClock } from '@/modules/overview/hooks';

import { ActivityCard, ActivityCardSkeleton } from './ActivityCard';
import { isSelf } from './logic';
import { rangeChips, sortScoreboard, STAFF_COPY } from './staff';

export type ActivityBoardMode = 'team' | 'mine';

const rowKey = (row: StaffActivityRow) => row.email;
const Gap = () => <View style={styles.gap} />;

/** "Since Sep 27" for a ranged board, "All time" otherwise. */
function sinceText(since: string | null, now: Date): string {
  return since ? `Since ${formatShortDate(since, now)}, Toronto time` : 'All time';
}

/**
 * The activity board (the website's docs/admin-api/staff.md section 5).
 * "team": everyone on the team, most clients won first, then most touches
 * (GET /team/activity, `team.activity`). "mine": the signed-in person's own
 * row with every credit (GET /me/activity, `activity.own`). Range chips 7
 * days, 30 days and All; a range never loaded shows the network error
 * offline, never the previous range's numbers.
 */
export function ActivityBoard({ mode }: { mode: ActivityBoardMode }) {
  const team = mode === 'team';
  const me = useMe();
  const online = useIsOnline();
  const now = useMinuteClock();
  const reduceMotion = useReduceMotion();
  const meta = useMeta();
  const [range, setRange] = useState<ActivityRange>('7d');
  const query = useQuery({ ...staffActivityQuery(mode, range), placeholderData: keepPreviousData });
  useRefreshOnFocus([teamKeys.all]);

  // Offline on a range that never loaded: the placeholder is the previous range, so say so instead.
  const pausedWithoutData = query.fetchStatus === 'paused' && (query.data === undefined || query.isPlaceholderData);
  const board = pausedWithoutData ? undefined : query.data;
  const rows = board ? (team ? sortScoreboard(board.rows) : board.rows) : [];
  const myEmail = me?.user.email ?? null;

  const onRefresh = async () => {
    if (!connectivity.isOnline()) return;
    await Promise.all([query.refetch(), meta.refetch()]);
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<StaffActivityRow>) => (
    <Animated.View entering={!reduceMotion && index < STAGGER_MAX ? enterPull(index) : undefined} style={styles.item}>
      <ActivityCard
        row={item}
        meta={meta.data}
        now={now}
        identity={team}
        mine={team && isSelf(item, myEmail)}
        creditLimit={team ? 3 : undefined}
      />
    </Animated.View>
  );

  const header = (
    <View>
      <FilterChips<ActivityRange>
        items={rangeChips(meta.data)}
        value={range}
        onChange={(next) => {
          if (next) setRange(next);
        }}
        accessibilityLabel="Date range"
      />
      <Text variant="small" color="ink3" style={styles.since}>
        {board ? sinceText(board.since, now) : ' '}
      </Text>
      {team ? null : (
        <Text variant="small" color="ink3" style={styles.private}>
          {STAFF_COPY.privateNote}
        </Text>
      )}
      {query.isRefetchError && board && online ? <ErrorState compact error={query.error} onRetry={() => query.refetch()} style={styles.refetchError} /> : null}
    </View>
  );

  let empty: ReactNode;
  if (board) {
    empty = rows.length === 0 ? <EmptyState message={STAFF_COPY.activityEmpty} style={styles.gutter} /> : null;
  } else if (query.isError) {
    empty = <ErrorState error={query.error} onRetry={() => query.refetch()} style={styles.gutter} />;
  } else if (pausedWithoutData) {
    empty = <ErrorState message={MESSAGES.network} onRetry={online ? () => query.refetch() : undefined} style={styles.gutter} />;
  } else {
    empty = (
      <View style={styles.skeletons}>
        <ActivityCardSkeleton identity={team} />
        {team ? <ActivityCardSkeleton identity /> : null}
      </View>
    );
  }

  return (
    <ScreenList<StaffActivityRow>
      title={team ? STAFF_COPY.teamActivity : STAFF_COPY.myActivity}
      back
      data={rows}
      renderItem={renderItem}
      keyExtractor={rowKey}
      ItemSeparatorComponent={Gap}
      extraData={[now, meta.data, myEmail, reduceMotion]}
      ListHeaderComponent={header}
      ListEmptyComponent={empty ? <View>{empty}</View> : null}
      ListFooterComponent={<View style={styles.footer} />}
      onRefresh={onRefresh}
      refetching={query.isFetching && board !== undefined}
      offlineBanner={board !== undefined}
      queryKey={team ? teamKeys.activity(range) : teamKeys.myActivity(range)}
    />
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  item: { paddingHorizontal: layout.gutter },
  gap: { height: space[3] },
  since: { marginTop: space[2], marginBottom: space[4] },
  private: { marginTop: -space[2], marginBottom: space[4] },
  refetchError: { marginBottom: space[4] },
  skeletons: { paddingHorizontal: layout.gutter, gap: space[3] },
  footer: { height: space[6] },
});
