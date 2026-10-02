import { useFocusEffect } from 'expo-router';
import { useInfiniteQuery, useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { notificationKeys, notificationsInfiniteQuery, type NotificationListParams } from '@/api/endpoints/notifications';
import type { NotificationSummary } from '@/api/schemas/notifications';
import { todayToronto } from '@/lib/dates';
import { useLatestCallback } from '@/lib/useLatestCallback';

import { buildEntries, flattenPages } from './logic';
import { inboxMutationKey } from './useInboxActions';

/**
 * The Inbox list: one infinite query per filter, category and "Include test",
 * flattened (one row per id, newest version wins) and grouped by Toronto day.
 */
export function useInboxList(params: Required<Pick<NotificationListParams, 'filter' | 'category' | 'includeTest'>>) {
  const query = useInfiniteQuery(notificationsInfiniteQuery(params));
  const today = useTorontoToday();
  const pages = query.data?.pages;

  const items = useMemo(() => flattenPages(pages ?? []), [pages]);
  const { entries, sticky } = useMemo(() => buildEntries(items, today), [items, today]);
  // The newest page answered last, so its summary is the freshest one.
  const summary: NotificationSummary | null = pages?.[pages.length - 1]?.summary ?? null;

  return { query, items, entries, sticky, summary, queryKey: notificationKeys.list(params) };
}

/** Today's Toronto date, rechecked every minute so "Today" and "Yesterday" roll over at midnight. */
export function useTorontoToday(): string {
  const [today, setToday] = useState(todayToronto);
  useEffect(() => {
    const id = setInterval(() => setToday(todayToronto()), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

/** Refetch when the screen comes back into focus (not on the first focus: mounting already fetches). */
export function useRefetchOnFocus(refetch: () => unknown) {
  const run = useLatestCallback(refetch);
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      run();
    }, [run]),
  );
}

const summaryKey = (s: NotificationSummary | null | undefined) => (s ? `${s.unread}:${s.needsAction}:${s.criticalUnread}` : null);

/**
 * The bell's summary polls every 45s. When it changes while the Inbox is open
 * (a new event, a bump, someone else handled a row), refresh the list so the
 * new or bumped row shows. Writes are excluded: they refresh the list themselves.
 */
export function useLiveInboxSync({
  badge,
  listSummary,
  includeTest,
  listFetching,
}: {
  badge: NotificationSummary | undefined;
  listSummary: NotificationSummary | null;
  includeTest: boolean;
  listFetching: boolean;
}) {
  const qc = useQueryClient();
  const writing = useIsMutating({ mutationKey: inboxMutationKey }) > 0;
  const lastBadge = useRef<string | null>(null);
  const badgeKey = summaryKey(badge);
  const listKey = summaryKey(listSummary);

  useEffect(() => {
    if (!badgeKey || writing || listFetching) return;
    if (lastBadge.current === null || lastBadge.current === badgeKey) {
      lastBadge.current = badgeKey;
      return;
    }
    lastBadge.current = badgeKey;
    // Without test rows the list's own summary is comparable: already in step means nothing to fetch.
    if (!includeTest && badgeKey === listKey) return;
    void qc.invalidateQueries({ queryKey: notificationKeys.lists() }, { cancelRefetch: false });
  }, [badgeKey, listKey, includeTest, writing, listFetching, qc]);
}
