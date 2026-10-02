import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import {
  addOnboardingTask,
  clientKeys,
  completeOnboarding,
  updateOnboarding,
  updateTaskStatus,
  type NewTaskInput,
  type OnboardingPatch,
} from '@/api/endpoints/clients';
import { MESSAGES } from '@/api/errors';
import type { ClientBundle, OnboardingTask, TaskStatus } from '@/api/schemas/clients';
import { reportSubmitError } from '@/components/SubmitGroup';
import { useMe } from '@/auth/session';
import { haptics } from '@/design/haptics';
import { connectivity } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import { clientWriteKey, setBundle, settleClientWrite } from '../cache';
import { optimisticTask, withRun, withTask, withTaskResult } from './logic';

type StatusVars = { task: OnboardingTask; status: TaskStatus; seq: number };

/**
 * Every write the Onboarding section makes. Run fields, completion and new
 * tasks wait for the server and put the returned entity in the cache. A task
 * status change is optimistic (its outcome is certain) with an undo toast; an
 * older answer never overwrites a newer change to the same task.
 */
export function useOnboardingWrites(clientId: string) {
  const queryClient = useQueryClient();
  const me = useMe();
  const who = me?.user.name ?? me?.user.email ?? null;
  const key = clientWriteKey(clientId);
  /** The newest status change per task: only its answer (or failure) may touch that task. */
  const newest = useRef(new Map<string, number>());
  const seq = useRef(0);

  const cachedTask = (taskId: string) =>
    queryClient.getQueryData<ClientBundle>(clientKeys.detail(clientId))?.onboarding?.tasks.find((t) => t.id === taskId);

  const patchRun = useMutation({
    mutationKey: key,
    mutationFn: ({ runId, patch }: { runId: string; patch: OnboardingPatch }) => updateOnboarding(runId, patch),
    onSuccess: (run) => setBundle(queryClient, clientId, (b) => withRun(b, run)),
    onSettled: () => settleClientWrite(queryClient, clientId),
  });

  const complete = useMutation({
    mutationKey: key,
    mutationFn: (runId: string) => completeOnboarding(runId),
    onSuccess: (run) => {
      setBundle(queryClient, clientId, (b) => withRun(b, run));
      haptics.success();
      notice.ok('Onboarding marked complete.');
    },
    onSettled: () => settleClientWrite(queryClient, clientId),
  });

  const addTask = useMutation({
    mutationKey: key,
    mutationFn: ({ runId, input, idempotencyKey }: { runId: string; input: NewTaskInput; idempotencyKey: string }) =>
      addOnboardingTask(runId, input, idempotencyKey),
    onSuccess: (result) => {
      setBundle(queryClient, clientId, (b) => withTaskResult(b, result));
      notice.ok('Task added.');
    },
    onSettled: () => settleClientWrite(queryClient, clientId),
  });

  const status = useMutation({
    mutationKey: key,
    mutationFn: ({ task, status: next }: StatusVars) => updateTaskStatus(task.id, next),
    onMutate: async ({ task, status: next }: StatusVars) => {
      // A refetch already on its way would land with the old status.
      await queryClient.cancelQueries({ queryKey: clientKeys.detail(clientId) });
      const before = cachedTask(task.id) ?? task;
      setBundle(queryClient, clientId, (b) => withTask(b, optimisticTask(before, next, who, new Date().toISOString())));
      return { before };
    },
    onError: (error, vars, context) => {
      if (newest.current.get(vars.task.id) === vars.seq && context) {
        setBundle(queryClient, clientId, (b) => withTask(b, context.before));
      }
      reportSubmitError(error);
    },
    onSuccess: (result, vars) => {
      if (newest.current.get(vars.task.id) !== vars.seq) return;
      setBundle(queryClient, clientId, (b) => withTaskResult(b, result));
    },
    onSettled: () => settleClientWrite(queryClient, clientId),
  });

  /** Change a task's status now; the server confirms in the background. */
  const setTaskStatus = (task: OnboardingTask, next: TaskStatus) => {
    seq.current += 1;
    newest.current.set(task.id, seq.current);
    status.mutate({ task, status: next, seq: seq.current });
  };

  /** Undo from the toast: put the old status back, the same way. */
  const undoTaskStatus = (task: OnboardingTask, previous: TaskStatus) => {
    if (!connectivity.isOnline()) {
      notice.err(MESSAGES.offline);
      return;
    }
    setTaskStatus(cachedTask(task.id) ?? task, previous);
  };

  return { patchRun, complete, addTask, setTaskStatus, undoTaskStatus };
}

export type OnboardingWrites = ReturnType<typeof useOnboardingWrites>;
