import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { crmKeys, crmQuery, discardCrmItems, reconcileCrm, retryCrmItems, setCrmSwitch, syncCrm, verifyCrm } from '@/api/endpoints/crm';
import { emailKeys } from '@/api/endpoints/email';
import { sessionKeys } from '@/api/endpoints/session';
import type { CrmAttentionItem, CrmStatus, CrmSurface } from '@/api/schemas/crm';
import { useJobRunner } from '@/components/automation/useJobRunner';
import { haptics } from '@/design/haptics';
import { notice } from '@/lib/notice';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';

import { discardDoneMessage, groupByQueue, JOB_TIMEOUT, jobFailureMessage, reconcileDoneMessage, retryDoneMessage, switchToast, syncDoneMessage } from './logic';

/**
 * GET /crm, refetched on screen focus (and on app resume through TanStack's
 * focus manager). Only the status key: the contact inspector's lookups live
 * under ['crm', 'inspect'] and must never refresh on their own.
 */
export function useCrmStatus() {
  const query = useQuery(crmQuery());
  useRefreshOnFocus([crmKeys.status(), sessionKeys.meta]);
  return query;
}

export type LongJob = {
  /** True from the tap until the status refetch after the job has landed. */
  running: boolean;
  startedAt: number | null;
  start: () => Promise<void>;
};

type JobKind = 'verify' | 'sync' | 'reconcile';

/**
 * Verify connection, Sync now and Run now: long jobs (120s timeout), one at a
 * time across all three, never retried. Whatever the outcome (a timeout
 * included: the job may still be running on the server), the status is
 * refetched so the run log shows what happened. Leaving the screen stops
 * waiting; the server's job keeps going and the screen refetches on return.
 */
export function useCrmJobs() {
  const queryClient = useQueryClient();
  const verify = useJobRunner((signal) => verifyCrm(signal));
  const sync = useJobRunner((signal) => syncCrm(signal));
  const reconcile = useJobRunner((signal) => reconcileCrm(signal));
  const [settling, setSettling] = useState<JobKind | null>(null);
  const startVerify = verify.start;
  const startSync = sync.start;
  const startReconcile = reconcile.start;

  const busy = verify.running || sync.running || reconcile.running || settling !== null;

  const settle = async (kind: JobKind, emailChanged: boolean) => {
    setSettling(kind);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: crmKeys.status() }),
        // Inbound and reconcile apply unsubscribes here: the Email lists are stale now.
        emailChanged ? queryClient.invalidateQueries({ queryKey: emailKeys.subscribers() }) : null,
        emailChanged ? queryClient.invalidateQueries({ queryKey: emailKeys.overview() }) : null,
      ]);
    } finally {
      setSettling(null);
    }
  };

  const fail = (error: unknown, timedOut: boolean, kind: JobKind) => {
    const message = jobFailureMessage(error, timedOut, JOB_TIMEOUT[kind]);
    if (message) {
      haptics.error();
      notice.err(message);
    }
  };

  const runVerify = async () => {
    if (busy) return;
    const outcome = await startVerify();
    if (outcome.status === 'busy' || outcome.status === 'cancelled') return;
    if (outcome.status === 'done') {
      const connection = outcome.result;
      queryClient.setQueryData<CrmStatus>(crmKeys.status(), (s) => (s ? { ...s, connection } : s));
      if (connection.health === 'verified') {
        haptics.success();
        notice.ok(connection.explanation);
      } else {
        haptics.error();
        notice.err(connection.explanation);
      }
    } else {
      fail(outcome.error, outcome.timedOut, 'verify');
    }
    await settle('verify', false);
  };

  const runSync = async () => {
    if (busy) return;
    const outcome = await startSync();
    if (outcome.status === 'busy' || outcome.status === 'cancelled') return;
    let changed = outcome.status === 'failed' && outcome.timedOut;
    if (outcome.status === 'done') {
      haptics.success();
      notice.ok(syncDoneMessage(outcome.result.handled));
      changed = outcome.result.handled > 0;
    } else {
      fail(outcome.error, outcome.timedOut, 'sync');
    }
    await settle('sync', changed);
  };

  const runReconcile = async () => {
    if (busy) return;
    const outcome = await startReconcile();
    if (outcome.status === 'busy' || outcome.status === 'cancelled') return;
    let changed = outcome.status === 'failed' && outcome.timedOut;
    if (outcome.status === 'done') {
      const { corrected, halted } = outcome.result;
      if (halted) {
        haptics.warning();
        notice.err(reconcileDoneMessage(corrected, true));
      } else {
        haptics.success();
        notice.ok(reconcileDoneMessage(corrected, false));
      }
      changed = corrected > 0;
    } else {
      fail(outcome.error, outcome.timedOut, 'reconcile');
    }
    await settle('reconcile', changed);
  };

  const job = (kind: JobKind, running: boolean, startedAt: number | null, start: () => Promise<void>): LongJob => ({
    running: running || settling === kind,
    startedAt,
    start,
  });

  return {
    busy,
    verify: job('verify', verify.running, verify.startedAt, runVerify),
    sync: job('sync', sync.running, sync.startedAt, runSync),
    reconcile: job('reconcile', reconcile.running, reconcile.startedAt, runReconcile),
  };
}

/**
 * PUT /crm/switches/:surface. Waits for the server (not optimistic: turning a
 * switch on can be refused until the connection is verified), puts the
 * returned switch in the cache, then refetches the status (Outbound on queues
 * contacts and adds a Backfill run). Throws on failure so a confirm sheet stays open.
 */
export function useCrmSwitch(labelFor: (surface: CrmSurface) => string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<CrmSurface | null>(null);

  const set = async (surface: CrmSurface, on: boolean) => {
    setPending(surface);
    try {
      const result = await setCrmSwitch(surface, on);
      queryClient.setQueryData<CrmStatus>(crmKeys.status(), (s) =>
        s ? { ...s, switches: { ...s.switches, [surface]: result.switch } } : s,
      );
      haptics.success();
      notice.ok(switchToast(labelFor(surface), on, result.queued));
    } finally {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: crmKeys.status() });
    }
  };

  return { pending, set };
}

/**
 * Retry (signed items only) and Discard for "Needs attention". One call per
 * queue; the status is refetched whatever happens, since a first queue may
 * have gone through before a second one failed.
 */
export function useAttentionActions() {
  const queryClient = useQueryClient();

  const run = async (items: readonly CrmAttentionItem[], call: typeof retryCrmItems) => {
    let count = 0;
    try {
      for (const group of groupByQueue(items)) {
        const result = await call(group.queue, group.ids);
        count += result.count;
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: crmKeys.status() });
    }
    return count;
  };

  const retry = async (items: readonly CrmAttentionItem[]) => {
    const count = await run(
      items.filter((i) => i.signed),
      retryCrmItems,
    );
    haptics.success();
    notice.ok(retryDoneMessage(count));
  };

  const discard = async (items: readonly CrmAttentionItem[]) => {
    const count = await run(items, discardCrmItems);
    haptics.warning();
    notice.ok(discardDoneMessage(count));
  };

  return { retry, discard };
}
