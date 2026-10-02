import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { useLatestCallback } from '@/lib/useLatestCallback';

/**
 * Refetch this screen's queries when it comes back into focus (returning from a
 * detail screen, switching tabs). Only active queries that are already stale
 * refetch, so a quick back and forth costs nothing. The first focus is skipped:
 * mounting already fetched. App resume is handled by TanStack's focus manager.
 *
 *   useRefreshOnFocus([clientKeys.lists(), sessionKeys.meta]);
 */
export function useRefreshOnFocus(keys: readonly QueryKey[]) {
  const client = useQueryClient();
  const first = useRef(true);
  const refresh = useLatestCallback(() => {
    for (const queryKey of keys) {
      void client.refetchQueries({ queryKey, type: 'active', stale: true });
    }
  });

  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refresh();
    }, [refresh]),
  );
}
