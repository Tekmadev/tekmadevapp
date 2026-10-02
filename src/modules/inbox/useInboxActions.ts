import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  markAllNotificationsRead,
  markNotificationsRead,
  markNotificationsUnread,
  notificationKeys,
  resolveNotification,
  updateNotificationPref,
} from '@/api/endpoints/notifications';
import type { NotificationCategory, NotificationItem, NotificationPrefs } from '@/api/schemas/notifications';
import { reportSubmitError } from '@/components/SubmitGroup';
import { notice } from '@/lib/notice';

import { cachedRows, cancelInboxReads, patchRows, replaceRows, restoreSnapshot, shiftSummaries, takeSnapshot, type InboxSnapshot } from './cache';
import { countsTowardUnread, INBOX_COPY, quietToast } from './logic';

/**
 * Every Inbox write. Read, unread, read-all and quiet are certain outcomes, so
 * they update the cache at once (rows, badge and list summaries) and roll back
 * if the server refuses. "Mark as handled" is shared by all staff, so it waits
 * for the server. Every write then puts the server's rows and badge summary in
 * the cache and refreshes the lists, keeping the bell in sync.
 */

const keys = {
  read: [...notificationKeys.all, 'mutation', 'read'] as const,
  readAll: [...notificationKeys.all, 'mutation', 'read-all'] as const,
  resolve: [...notificationKeys.all, 'mutation', 'resolve'] as const,
  quiet: [...notificationKeys.all, 'mutation', 'quiet'] as const,
};

/** Every Inbox mutation shares this prefix (useIsMutating, useMutationState). */
export const inboxMutationKey = [...notificationKeys.all, 'mutation'] as const;
export const resolveMutationKey = keys.resolve;

/** Refresh the lists once the last of several overlapping writes settles. */
function settle(qc: QueryClient, alsoSummary = false) {
  if (qc.isMutating({ mutationKey: inboxMutationKey }) > 1) return;
  void qc.invalidateQueries({ queryKey: notificationKeys.lists() });
  if (alsoSummary) void qc.invalidateQueries({ queryKey: notificationKeys.summary() });
}

function rollback(qc: QueryClient, error: unknown, snapshot: InboxSnapshot | undefined) {
  if (snapshot) restoreSnapshot(qc, snapshot);
  reportSubmitError(error);
}

export type InboxActions = ReturnType<typeof useInboxActions>;

export function useInboxActions() {
  const qc = useQueryClient();

  const read = useMutation({
    mutationKey: keys.read,
    mutationFn: ({ ids, read: toRead }: { ids: string[]; read: boolean }) =>
      toRead ? markNotificationsRead(ids) : markNotificationsUnread(ids),
    onMutate: async ({ ids, read: toRead }) => {
      await cancelInboxReads(qc);
      const snapshot = takeSnapshot(qc);
      const wanted = new Set(ids);
      // Rows whose unread count changes: unread -> read, or read -> unread, and not quiet.
      const flipped = cachedRows(qc, (item) => wanted.has(item.id) && item.is_read !== toRead && !item.is_muted);
      patchRows(qc, (item) => (wanted.has(item.id) && item.is_read !== toRead ? { ...item, is_read: toRead } : item));
      shiftSummaries(qc, flipped, toRead ? -1 : 1);
      return snapshot;
    },
    onError: (error, _vars, snapshot) => rollback(qc, error, snapshot),
    onSuccess: (data) => {
      replaceRows(qc, data.items);
      qc.setQueryData(notificationKeys.summary(), data.summary);
    },
    onSettled: () => settle(qc),
  });

  const readAll = useMutation({
    mutationKey: keys.readAll,
    mutationFn: (seen: string) => markAllNotificationsRead(seen),
    onMutate: async (seen) => {
      await cancelInboxReads(qc);
      const snapshot = takeSnapshot(qc);
      // Exact string comparison: the watermark keeps the server's microseconds.
      const covered = (item: NotificationItem) => !item.is_read && item.last_occurred_at <= seen;
      const flipped = cachedRows(qc, (item) => covered(item) && countsTowardUnread(item));
      patchRows(qc, (item) => (covered(item) ? { ...item, is_read: true } : item));
      shiftSummaries(qc, flipped, -1);
      return snapshot;
    },
    onError: (error, _vars, snapshot) => rollback(qc, error, snapshot),
    onSuccess: (data) => qc.setQueryData(notificationKeys.summary(), data.summary),
    onSettled: () => settle(qc),
  });

  const resolve = useMutation({
    mutationKey: keys.resolve,
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) => resolveNotification(id, resolved),
    onError: (error) => reportSubmitError(error),
    onSuccess: (data) => {
      replaceRows(qc, [data.item]);
      qc.setQueryData(notificationKeys.summary(), data.summary);
    },
    onSettled: () => settle(qc),
  });

  const quiet = useMutation({
    mutationKey: keys.quiet,
    mutationFn: ({ category, muted }: { category: NotificationCategory; muted: boolean }) => updateNotificationPref(category, { muted }),
    onMutate: async ({ category, muted }) => {
      await Promise.all([cancelInboxReads(qc), qc.cancelQueries({ queryKey: notificationKeys.prefs() })]);
      const snapshot = takeSnapshot(qc);
      const inCategory = (item: NotificationItem) => item.category === category && item.is_muted !== muted;
      // Unread rows in the category stop counting (quiet) or count again (not quiet).
      const flipped = cachedRows(qc, (item) => inCategory(item) && !item.is_read);
      patchRows(qc, (item) => (inCategory(item) ? { ...item, is_muted: muted } : item));
      shiftSummaries(qc, flipped, muted ? -1 : 1);
      qc.setQueryData<NotificationPrefs>(notificationKeys.prefs(), (prefs) =>
        prefs?.map((pref) => (pref.category === category ? { ...pref, muted } : pref)),
      );
      return snapshot;
    },
    onError: (error, _vars, snapshot) => rollback(qc, error, snapshot),
    onSuccess: (pref) => {
      qc.setQueryData<NotificationPrefs>(notificationKeys.prefs(), (prefs) =>
        prefs?.map((row) => (row.category === pref.category ? pref : row)),
      );
    },
    // PATCH answers with the pref only: fetch the counts and rows again.
    onSettled: () => settle(qc, true),
  });

  /** "Mark as handled" / "Reopen". Resolves (never rejects) once the server answers; offers Undo. */
  const setResolved = async (id: string, resolved: boolean, offerUndo = true): Promise<void> => {
    try {
      await resolve.mutateAsync({ id, resolved });
    } catch {
      return; // Already reported by onError.
    }
    notice.ok(
      resolved ? INBOX_COPY.handledToast : INBOX_COPY.reopenedToast,
      offerUndo ? { action: { label: INBOX_COPY.undo, onPress: () => void setResolved(id, !resolved, false) } } : undefined,
    );
  };

  /** "Make this category quiet", with Undo. */
  const setQuiet = (category: NotificationCategory, muted: boolean, offerUndo = true) => {
    quiet.mutate(
      { category, muted },
      {
        onSuccess: () => {
          if (muted && offerUndo) {
            notice.ok(quietToast(category), { action: { label: INBOX_COPY.undo, onPress: () => setQuiet(category, false, false) } });
          }
        },
      },
    );
  };

  return {
    markRead: (ids: string[]) => {
      if (ids.length) read.mutate({ ids, read: true });
    },
    markUnread: (ids: string[]) => {
      if (ids.length) read.mutate({ ids, read: false });
    },
    /** `seen`: the newest last_occurred_at shown, exactly as received. */
    markAllRead: (seen: string) => readAll.mutate(seen),
    setResolved,
    setQuiet,
  };
}
