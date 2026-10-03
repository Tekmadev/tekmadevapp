import { queryOptions } from '@tanstack/react-query';

import { getNotificationSummary, notificationKeys } from '@/api/endpoints/notifications';
import { usePushState } from '@/modules/push/store';

/**
 * The inbox summary feeds the tab badge and the Inbox header. It polls every 45s
 * while the app is in the foreground (TanStack pauses intervals in the
 * background), and every 120s once push is live, as a safety net.
 */
export function inboxSummaryQuery(options: { pushLive?: boolean } = {}) {
  return queryOptions({
    queryKey: notificationKeys.summary(),
    queryFn: ({ signal }) => getNotificationSummary(signal),
    refetchInterval: options.pushLive ? 120_000 : 45_000,
  });
}

/** Push is registered on this phone: the bell can poll less often (brief section 4). */
export function usePushLive(): boolean {
  return usePushState((state) => state.status === 'registered');
}
