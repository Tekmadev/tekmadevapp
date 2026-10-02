import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import { notificationKeys } from '@/api/endpoints/notifications';
import type { NotificationItem, NotificationList, NotificationPrefs, NotificationSummary } from '@/api/schemas/notifications';

import { shiftSummary } from './logic';

/**
 * Inbox cache surgery for optimistic updates. Every cached list (each filter,
 * category and "Include test" combination), every cached detail row and the
 * badge summary are patched together, so whatever screen or sheet shows a row
 * agrees with the others. Rows are always matched by id: a bump keeps its id.
 */

export type InboxPages = InfiniteData<NotificationList, string | null>;

const detailsPrefix = [...notificationKeys.all, 'detail'] as const;

export type InboxSnapshot = {
  lists: [QueryKey, InboxPages | undefined][];
  details: [QueryKey, NotificationItem | undefined][];
  summary: NotificationSummary | undefined;
  prefs: NotificationPrefs | undefined;
};

/** Stop in-flight reads so a late answer cannot overwrite an optimistic change. */
export async function cancelInboxReads(qc: QueryClient) {
  await Promise.all([
    qc.cancelQueries({ queryKey: notificationKeys.lists() }),
    qc.cancelQueries({ queryKey: notificationKeys.summary() }),
    qc.cancelQueries({ queryKey: detailsPrefix }),
  ]);
}

export function takeSnapshot(qc: QueryClient): InboxSnapshot {
  return {
    lists: qc.getQueriesData<InboxPages>({ queryKey: notificationKeys.lists() }),
    details: qc.getQueriesData<NotificationItem>({ queryKey: detailsPrefix }),
    summary: qc.getQueryData<NotificationSummary>(notificationKeys.summary()),
    prefs: qc.getQueryData<NotificationPrefs>(notificationKeys.prefs()),
  };
}

export function restoreSnapshot(qc: QueryClient, snapshot: InboxSnapshot) {
  for (const [key, data] of snapshot.lists) qc.setQueryData(key, data);
  for (const [key, data] of snapshot.details) qc.setQueryData(key, data);
  if (snapshot.summary) qc.setQueryData(notificationKeys.summary(), snapshot.summary);
  if (snapshot.prefs) qc.setQueryData(notificationKeys.prefs(), snapshot.prefs);
}

/** Was this cached list fetched with "Include test"? (Its summary then counts test rows.) */
export function listIncludesTest(key: QueryKey): boolean {
  const params = key[2];
  return typeof params === 'object' && params !== null && 'includeTest' in params && params.includeTest === true;
}

/** Cached rows that match, one per id (lists first, then open detail sheets). */
export function cachedRows(qc: QueryClient, match: (item: NotificationItem) => boolean): NotificationItem[] {
  const found = new Map<string, NotificationItem>();
  for (const [, data] of qc.getQueriesData<InboxPages>({ queryKey: notificationKeys.lists() })) {
    for (const page of data?.pages ?? []) {
      for (const item of page.items) if (!found.has(item.id) && match(item)) found.set(item.id, item);
    }
  }
  for (const [, item] of qc.getQueriesData<NotificationItem>({ queryKey: detailsPrefix })) {
    if (item && !found.has(item.id) && match(item)) found.set(item.id, item);
  }
  return Array.from(found.values());
}

/** Apply `patch` to every cached copy of every row. Return the same object to leave a row alone. */
export function patchRows(qc: QueryClient, patch: (item: NotificationItem) => NotificationItem) {
  for (const [key, data] of qc.getQueriesData<InboxPages>({ queryKey: notificationKeys.lists() })) {
    if (!data) continue;
    let changed = false;
    const pages = data.pages.map((page) => {
      let pageChanged = false;
      const items = page.items.map((item) => {
        const next = patch(item);
        if (next !== item) pageChanged = true;
        return next;
      });
      if (!pageChanged) return page;
      changed = true;
      return { ...page, items };
    });
    if (changed) qc.setQueryData<InboxPages>(key, { ...data, pages });
  }
  for (const [key, item] of qc.getQueriesData<NotificationItem>({ queryKey: detailsPrefix })) {
    if (!item) continue;
    const next = patch(item);
    if (next !== item) qc.setQueryData(key, next);
  }
}

/** Put the server's rows (the source of truth) in place of every cached copy. */
export function replaceRows(qc: QueryClient, rows: readonly NotificationItem[]) {
  if (rows.length === 0) return;
  const byId = new Map(rows.map((row) => [row.id, row]));
  patchRows(qc, (item) => byId.get(item.id) ?? item);
}

/**
 * Optimistic unread counts: `flipped` rows stop (-1) or start (+1) counting.
 * The badge summary skips test rows; each cached list's summary counts them
 * when that list was fetched with "Include test".
 */
export function shiftSummaries(qc: QueryClient, flipped: readonly NotificationItem[], direction: 1 | -1) {
  if (flipped.length === 0) return;
  const badge = qc.getQueryData<NotificationSummary>(notificationKeys.summary());
  if (badge) qc.setQueryData(notificationKeys.summary(), shiftSummary(badge, flipped, direction, false));
  for (const [key, data] of qc.getQueriesData<InboxPages>({ queryKey: notificationKeys.lists() })) {
    if (!data) continue;
    const includeTest = listIncludesTest(key);
    qc.setQueryData<InboxPages>(key, {
      ...data,
      pages: data.pages.map((page) => ({ ...page, summary: shiftSummary(page.summary, flipped, direction, includeTest) })),
    });
  }
}
