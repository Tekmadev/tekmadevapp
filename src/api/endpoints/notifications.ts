import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import {
  zNotificationItem,
  zNotificationList,
  zNotificationPref,
  zNotificationPrefs,
  zNotificationResolve,
  zNotificationsReadAll,
  zNotificationsUpdate,
  zNotificationSummary,
  zTestPushResult,
  type NotificationItem,
  type NotificationCategory,
  type NotificationFilter,
  type NotificationList,
  type NotificationPref,
  type NotificationPrefs,
  type NotificationResolve,
  type NotificationsReadAll,
  type NotificationsUpdate,
  type NotificationSummary,
  type TestPushResult,
} from '../schemas/notifications';

/**
 * Typed endpoints and query keys for the "notifications" domain (the Inbox,
 * its badge, and the per-category Quiet and Push preferences).
 *
 * Read marks, mutes and resolution are certain outcomes, so screens may update
 * the cache optimistically and then apply the item and summary the server
 * returns. Rows are always updated in place by id: a bumped problem keeps its id.
 */

export const NOTIFICATIONS_PAGE_SIZE = 30;

export type NotificationListParams = {
  filter: NotificationFilter;
  /** One category chip, or null/undefined for "Everything". */
  category?: NotificationCategory | null;
  /** Owner only ("Include test"). The server ignores it for managers. */
  includeTest?: boolean;
  /** Page size (default 30, max 100). */
  limit?: number;
};

/** Normalised so equal filters always share one cache entry. */
const listKeyParams = (params: NotificationListParams) => ({
  filter: params.filter,
  category: params.category ?? null,
  includeTest: params.includeTest ?? false,
  limit: params.limit ?? NOTIFICATIONS_PAGE_SIZE,
});

export const notificationKeys = {
  all: ['notifications'] as const,
  /** The badge and header counts. Keep this key: the tab bar polls it. */
  summary: () => ['notifications', 'summary'] as const,
  lists: () => ['notifications', 'list'] as const,
  list: (params: NotificationListParams) => ['notifications', 'list', listKeyParams(params)] as const,
  detail: (id: string) => ['notifications', 'detail', id] as const,
  prefs: () => ['notifications', 'prefs'] as const,
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** GET /notifications: newest first by last_occurred_at, with the inbox summary. */
export function getNotifications(params: NotificationListParams & { cursor?: string | null }, signal?: AbortSignal) {
  return api.get<NotificationList>('/notifications', {
    query: {
      filter: params.filter,
      category: params.category ?? undefined,
      test: params.includeTest ? 1 : undefined,
      // Passed back exactly as the server sent it.
      cursor: params.cursor ?? undefined,
      limit: params.limit ?? NOTIFICATIONS_PAGE_SIZE,
    },
    schema: zNotificationList,
    signal,
  });
}

/** GET /notifications/summary: { unread, needsAction, criticalUnread } (test rows excluded). */
export function getNotificationSummary(signal?: AbortSignal) {
  return api.get<NotificationSummary>('/notifications/summary', { schema: zNotificationSummary, signal });
}

/** GET /notifications/:id (requested in docs/api-requests/notifications.md): one row, e.g. after a push tap. */
export function getNotification(id: string, signal?: AbortSignal) {
  return api.get<NotificationItem>(`/notifications/${seg(id)}`, { schema: zNotificationItem, signal });
}

/** GET /notifications/prefs: one row per category the caller may see (managers: no Team, no Audience). */
export function getNotificationPrefs(signal?: AbortSignal) {
  return api.get<NotificationPrefs>('/notifications/prefs', { schema: zNotificationPrefs, signal });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** POST /notifications/read: returns the rows (new state) and a fresh summary. */
export function markNotificationsRead(ids: string[]) {
  return api.post<NotificationsUpdate>('/notifications/read', { ids }, { schema: zNotificationsUpdate });
}

/** POST /notifications/unread: returns the rows (new state) and a fresh summary. */
export function markNotificationsUnread(ids: string[]) {
  return api.post<NotificationsUpdate>('/notifications/unread', { ids }, { schema: zNotificationsUpdate });
}

/**
 * POST /notifications/read-all. Send the newest `last_occurred_at` on screen,
 * exactly as received (never through a Date: it carries microseconds), so a
 * row that bumped after the list loaded stays unread.
 */
export function markAllNotificationsRead(seen?: string | null) {
  return api.post<NotificationsReadAll>('/notifications/read-all', seen ? { seen } : {}, { schema: zNotificationsReadAll });
}

/** POST /notifications/:id/resolve: "Mark as handled" (true) or "Reopen" (false). Also marks it read. */
export function resolveNotification(id: string, resolved: boolean) {
  return api.post<NotificationResolve>(`/notifications/${seg(id)}/resolve`, { resolved }, { schema: zNotificationResolve });
}

/** PATCH /notifications/prefs/:category: Quiet (`muted`) and/or Push. Returns the full row. */
export function updateNotificationPref(category: NotificationCategory, patch: { muted?: boolean; push?: boolean }) {
  return api.patch<NotificationPref>(`/notifications/prefs/${seg(category)}`, patch, { schema: zNotificationPref });
}

/**
 * POST /notifications/test-push (requested in docs/api-requests/notifications.md):
 * "Send a test notification" to this phone (or every phone of the caller).
 */
export function sendTestPush(deviceId?: string | null) {
  return api.post<TestPushResult>('/notifications/test-push', deviceId ? { deviceId } : {}, { schema: zTestPushResult });
}

/* ------------------------------------------------------------------ */
/* Query options                                                       */
/* ------------------------------------------------------------------ */

export function notificationSummaryQuery() {
  return queryOptions({
    queryKey: notificationKeys.summary(),
    queryFn: ({ signal }) => getNotificationSummary(signal),
  });
}

/**
 * The Inbox list. Stops when the server sends no cursor, or when a page comes
 * back short or empty (brief 8.4), whichever happens first.
 */
export function notificationsInfiniteQuery(params: NotificationListParams) {
  const limit = params.limit ?? NOTIFICATIONS_PAGE_SIZE;
  return infiniteQueryOptions({
    queryKey: notificationKeys.list(params),
    queryFn: ({ pageParam, signal }) => getNotifications({ ...params, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.items.length < limit ? undefined : (last.nextCursor ?? undefined)),
  });
}

export function notificationQuery(id: string) {
  return queryOptions({
    queryKey: notificationKeys.detail(id),
    queryFn: ({ signal }) => getNotification(id, signal),
  });
}

export function notificationPrefsQuery() {
  return queryOptions({
    queryKey: notificationKeys.prefs(),
    queryFn: ({ signal }) => getNotificationPrefs(signal),
  });
}
