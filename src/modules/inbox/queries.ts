import { queryOptions } from '@tanstack/react-query';

/**
 * STUB until the notifications domain lands: the inbox summary feeds the tab badge.
 * Polls every 45s while the app is in the foreground (120s once push is live).
 */
export function inboxSummaryQuery() {
  return queryOptions({
    queryKey: ['notifications', 'summary'] as const,
    queryFn: async () => ({ unread: 0, needsAction: 0, criticalUnread: 0 }),
    refetchInterval: 45_000,
  });
}
