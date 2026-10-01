import { queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import {
  zCrmBatchResult,
  zCrmConnection,
  zCrmInspect,
  zCrmReconcileResult,
  zCrmStatus,
  zCrmSwitchResult,
  zCrmSyncResult,
  type CrmBatchResult,
  type CrmConnection,
  type CrmInspect,
  type CrmQueueName,
  type CrmReconcileResult,
  type CrmStatus,
  type CrmSurface,
  type CrmSwitchResult,
  type CrmSyncResult,
} from '../schemas/crm';

/**
 * Typed endpoints and query keys for the "crm" domain (owner only). Always
 * "the CRM": never a vendor name.
 *
 * Verify, Sync now and Run now are long jobs (120s timeout, JobProgress UI).
 * They never auto-retry: on a timeout, refetch `crmKeys.status()` and read
 * the run log to see what happened. After any mutation, invalidate
 * `crmKeys.status()`.
 */

export const crmKeys = {
  all: ['crm'] as const,
  status: () => ['crm', 'status'] as const,
  inspect: (email: string) => ['crm', 'inspect', email.trim().toLowerCase()] as const,
};

/** GET /crm: connection, switches, webhook app, merge fields, queue, runs, last reconcile, attention. */
export function getCrm(signal?: AbortSignal) {
  return api.get<CrmStatus>('/crm', { schema: zCrmStatus, signal });
}

/** POST /crm/verify (long job, about 20 seconds live): runs every probe and returns the connection. */
export function verifyCrm(signal?: AbortSignal) {
  return api.post<CrmConnection>('/crm/verify', {}, { schema: zCrmConnection, timeout: 'long', signal });
}

/**
 * PUT /crm/switches/:surface. Turning on needs a verified connection (422
 * `unverified`). Turning Outbound on returns `queued`: contacts queued for
 * their first push ("N existing contact(s) queued for their first push.").
 */
export function setCrmSwitch(surface: CrmSurface, on: boolean) {
  return api.put<CrmSwitchResult>(`/crm/switches/${seg(surface)}`, { on }, { schema: zCrmSwitchResult });
}

/** POST /crm/sync ("Sync now", long job): pushes and applies what is queued. */
export function syncCrm(signal?: AbortSignal) {
  return api.post<CrmSyncResult>('/crm/sync', {}, { schema: zCrmSyncResult, timeout: 'long', signal });
}

/** POST /crm/reconcile ("Run now", long job). `halted`: the safety stop fired and nothing changed. */
export function reconcileCrm(signal?: AbortSignal) {
  return api.post<CrmReconcileResult>('/crm/reconcile', {}, { schema: zCrmReconcileResult, timeout: 'long', signal });
}

/** POST /crm/retry: signed items only. 422 `nothing` when none of the ids can be retried. */
export function retryCrmItems(queue: CrmQueueName, ids: string[]) {
  return api.post<CrmBatchResult>('/crm/retry', { queue, ids }, { schema: zCrmBatchResult });
}

/** POST /crm/discard: stop trying for good (items stay on record). 422 `nothing` when none match. */
export function discardCrmItems(queue: CrmQueueName, ids: string[]) {
  return api.post<CrmBatchResult>('/crm/discard', { queue, ids }, { schema: zCrmBatchResult });
}

/** GET /crm/inspect?email=: "This site" vs "CRM" for one address. Calls the CRM live. */
export function inspectCrmContact(email: string, signal?: AbortSignal) {
  return api.get<CrmInspect>('/crm/inspect', { query: { email: email.trim() }, schema: zCrmInspect, signal });
}

/**
 * POST /crm/resubscribe ("They asked to come back, resubscribe them"). Returns
 * the fresh comparison. Errors: `resub_refused` (bounced or complained),
 * `resub_notfound`, `resub_stale` (look them up again).
 */
export function resubscribeCrmContact(email: string) {
  return api.post<CrmInspect>('/crm/resubscribe', { email: email.trim() }, { schema: zCrmInspect });
}

export function crmQuery() {
  return queryOptions({
    queryKey: crmKeys.status(),
    queryFn: ({ signal }) => getCrm(signal),
  });
}

/**
 * One inspector lookup. It calls the CRM live, so it never refreshes on its
 * own (no focus, reconnect or stale refetch) and is not persisted. Run it on
 * submit (`enabled` once an email is entered) and refetch only on request.
 */
export function crmInspectQuery(email: string) {
  return queryOptions({
    queryKey: crmKeys.inspect(email),
    queryFn: ({ signal }) => inspectCrmContact(email, signal),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    meta: { persist: false },
  });
}
