import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { clientActivityInfiniteQuery, clientKeys, postClientActivity, type NewActivityInput } from '@/api/endpoints/clients';
import type { ActivityPage } from '@/api/schemas/clients';
import { useCan } from '@/auth/permissions';
import { useMe } from '@/auth/session';
import { EmptyState } from '@/components/EmptyState';
import { PendingButton } from '@/components/PendingButton';
import { Section } from '@/components/Section';
import { space } from '@/design/tokens';

import { ActivityComposer } from './activity/ActivityComposer';
import { ActivityItem } from './activity/ActivityItem';
import { mergeActivity } from './activity/activityText';
import { refreshClient, updateBundle, useClientLabels } from './sectionData';
import type { SectionProps } from './types';

type Pages = InfiniteData<ActivityPage, string | null>;

/**
 * Activity (brief 8.5, section 11): the timeline, newest first, paged with
 * the cursor ("Load more"), and the composer for an internal note or an
 * update to the client.
 *
 * The composer needs `clients.activity.write`.
 *
 * The first page always comes from the bundle (the shell refreshes it on
 * focus and after every write). Older pages live in their own infinite query
 * that only fetches when asked; it is seeded with the bundle's first page so
 * the cursors line up.
 */
export function ActivitySection({ clientId, bundle }: SectionProps) {
  const queryClient = useQueryClient();
  const labels = useClientLabels();
  // Links in updates open what this person may open (their GET /me capabilities).
  const me = useMe();
  const canWrite = useCan('clients.activity.write');
  const key = clientKeys.activity(clientId);
  const older = useInfiniteQuery({ ...clientActivityInfiniteQuery(clientId), enabled: false, meta: { persist: false } });

  // Every loaded page, including the copy of the first page the paging started from: when new
  // entries push items off the fresh first page, they are still found there, so nothing goes missing.
  const loaded = older.data && older.data.pages.length > 1 ? older.data.pages : [];
  const items = mergeActivity(bundle.activity.items, loaded);
  const nextCursor = loaded.length > 0 ? (loaded[loaded.length - 1]?.nextCursor ?? null) : bundle.activity.nextCursor;

  const loadMore = async () => {
    if (loaded.length === 0) {
      // Start from the bundle's page, so the next request uses its cursor.
      queryClient.setQueryData<Pages>(key, { pages: [bundle.activity], pageParams: [null] });
    }
    const result = await older.fetchNextPage();
    // PendingButton shows the API's message (and skips what is handled globally).
    if (result.isFetchNextPageError) throw result.error;
  };

  const post = async (input: NewActivityInput, idempotencyKey: string) => {
    const entry = await postClientActivity(clientId, input, idempotencyKey);
    // Show it at once; the refetch below brings the rest of the page in line.
    updateBundle(queryClient, clientId, (b) =>
      b.activity.items.some((a) => a.id === entry.id) ? b : { ...b, activity: { ...b.activity, items: [entry, ...b.activity.items] } },
    );
    refreshClient(queryClient, clientId);
    return entry;
  };

  return (
    <Section title="Activity">
      {items.length === 0 ? (
        <EmptyState compact message="No activity yet." />
      ) : (
        <View style={styles.timeline}>
          {items.map((entry, i) => (
            <ActivityItem key={entry.id} entry={entry} labels={labels} viewer={me} last={i === items.length - 1 && !nextCursor} />
          ))}
        </View>
      )}
      {nextCursor ? (
        <PendingButton label="Load more" pendingLabel="Loading" variant="secondary" size="sm" onPress={loadMore} style={styles.more} />
      ) : null}
      {canWrite ? (
        <View style={styles.composer}>
          <ActivityComposer onPost={post} />
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  timeline: { paddingTop: space[1] },
  more: { alignSelf: 'center', marginBottom: space[2] },
  composer: { marginTop: space[4] },
});
