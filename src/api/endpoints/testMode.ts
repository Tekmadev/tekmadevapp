import { queryOptions } from '@tanstack/react-query';

import { api } from '../client';
import { zTestModeStatus, zTestPurgeResult, type TestModeStatus, type TestPurgeResult } from '../schemas/testMode';

/**
 * Typed endpoints and query keys for the "testMode" domain (owner only).
 * The app cannot switch test mode on (it is a browser cookie on the website);
 * it shows the sandbox status, rebuilds the catalog and deletes test data.
 */

export const testModeKeys = {
  all: ['testMode'] as const,
  status: () => ['testMode', 'status'] as const,
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function getTestMode(signal?: AbortSignal) {
  return api.get<TestModeStatus>('/test-mode', { schema: zTestModeStatus, signal });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/**
 * "Rebuild test catalog": a long job (several seconds) with the 120s timeout.
 * Returns the whole status. Never auto-retry on timeout: refetch the status
 * to see whether it finished.
 */
export function rebuildTestCatalog(signal?: AbortSignal) {
  return api.post<TestModeStatus>('/test-mode/catalog', {}, { schema: zTestModeStatus, timeout: 'long', signal });
}

/** "Delete all test data". Returns how many of each were deleted, for the toast. */
export function purgeTestData() {
  return api.post<TestPurgeResult>('/test-mode/purge', { confirm: true }, { schema: zTestPurgeResult });
}

/* ------------------------------------------------------------------ */
/* Query options                                                       */
/* ------------------------------------------------------------------ */

export function testModeQuery() {
  return queryOptions({
    queryKey: testModeKeys.status(),
    queryFn: ({ signal }) => getTestMode(signal),
  });
}
