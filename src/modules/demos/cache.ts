import type { QueryClient } from '@tanstack/react-query';

import { demoKeys } from '@/api/endpoints/demos';
import { ApiError } from '@/api/errors';
import type { DemoRequest } from '@/api/schemas/demos';
import { reportSubmitError } from '@/components/SubmitGroup';
import { haptics } from '@/design/haptics';
import { notice } from '@/lib/notice';

/**
 * A request the server just answered (a write returns the full request with
 * its events): it replaces the detail in the cache, and the lists and the
 * client and lead Demo cards refresh, since status and counts moved.
 */
export function applyDemo(queryClient: QueryClient, demo: DemoRequest) {
  queryClient.setQueryData(demoKeys.detail(demo.id), demo);
  void queryClient.invalidateQueries({ queryKey: demoKeys.lists() });
}

/**
 * A refused write: the server's message as a toast. A role limit (403
 * `forbidden`) stays on the screen and says why, like any other refusal; the
 * request is read again so the buttons match what the server allows now
 * (someone else may have moved it: 409 `demo_closed`, 404).
 */
export function showDemoError(error: unknown, queryClient?: QueryClient, id?: string) {
  haptics.error();
  if (error instanceof ApiError && error.status === 403 && error.code === 'forbidden') notice.err(error.message);
  else reportSubmitError(error);
  if (queryClient && id && error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 409)) {
    void queryClient.invalidateQueries({ queryKey: demoKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: demoKeys.lists() });
  }
}
