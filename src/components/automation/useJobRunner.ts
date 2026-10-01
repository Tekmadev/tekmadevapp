import { useEffect, useState, useSyncExternalStore } from 'react';

import { ApiError } from '@/api/errors';

/**
 * Long jobs (Refresh from Meta, Verify connection, Sync now, the test catalog):
 * one run at a time, cancellable, and never retried automatically. A long job
 * that times out may still be running on the server, so trying again could
 * run it twice. On a timeout the caller refetches the job's status (the run
 * log, the last sync time) instead.
 */

export type JobStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

export type JobState<T> = {
  status: JobStatus;
  running: boolean;
  /** Epoch ms when the current or last run started. */
  startedAt: number | null;
  finishedAt: number | null;
  /** The thrown value of a failed run (an ApiError for API calls). */
  error: unknown;
  /** True when the failure was the request timing out: refetch the status, do not retry. */
  timedOut: boolean;
  result: T | undefined;
};

export type JobOutcome<T> =
  | { status: 'done'; result: T }
  | { status: 'failed'; error: unknown; timedOut: boolean }
  | { status: 'cancelled' }
  /** start() was called while a run was already going: nothing new was started. */
  | { status: 'busy' };

/** The job gets an AbortSignal; pass it to the API call (`signal`) so Cancel stops the request. */
export type JobFn<T, A extends unknown[]> = (signal: AbortSignal, ...args: A) => Promise<T>;

export type JobRunner<T, A extends unknown[]> = {
  getState: () => JobState<T>;
  subscribe: (listener: () => void) => () => void;
  start: (...args: A) => Promise<JobOutcome<T>>;
  cancel: () => void;
  reset: () => void;
  /** Swap in the latest job closure (the hook does this after every render). */
  setJob: (job: JobFn<T, A>) => void;
};

const IDLE: JobState<never> = {
  status: 'idle',
  running: false,
  startedAt: null,
  finishedAt: null,
  error: null,
  timedOut: false,
  result: undefined,
};

const isTimeout = (error: unknown) => error instanceof ApiError && error.kind === 'timeout';

/** Framework-free runner; useJobRunner wraps it. Exported for tests and non-React callers. */
export function createJobRunner<T, A extends unknown[] = []>(initialJob: JobFn<T, A>, now: () => number = Date.now): JobRunner<T, A> {
  let job = initialJob;
  let state: JobState<T> = IDLE;
  let controller: AbortController | null = null;
  // Bumped on every start and cancel, so a late answer from a cancelled run is ignored.
  let generation = 0;
  const listeners = new Set<() => void>();

  const set = (next: JobState<T>) => {
    state = next;
    listeners.forEach((l) => l());
  };

  const cancel = () => {
    if (!state.running) return;
    generation++;
    controller?.abort();
    controller = null;
    set({ ...state, status: 'cancelled', running: false, finishedAt: now() });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setJob: (next) => {
      job = next;
    },
    start: async (...args) => {
      if (state.running) return { status: 'busy' };
      const mine = ++generation;
      const abort = new AbortController();
      controller = abort;
      set({ ...IDLE, status: 'running', running: true, startedAt: now() });
      try {
        const result = await job(abort.signal, ...args);
        if (mine !== generation) return { status: 'cancelled' };
        controller = null;
        set({ ...state, status: 'done', running: false, finishedAt: now(), result });
        return { status: 'done', result };
      } catch (error) {
        if (mine !== generation) return { status: 'cancelled' };
        controller = null;
        const timedOut = isTimeout(error);
        set({ ...state, status: 'failed', running: false, finishedAt: now(), error, timedOut });
        return { status: 'failed', error, timedOut };
      }
    },
    cancel,
    reset: () => {
      cancel();
      set(IDLE);
    },
  };
}

/**
 * Runs a long job with an AbortController and tracks it for JobProgress:
 *
 *   const pull = useJobRunner((signal) => refreshAds({ signal }));
 *   <JobProgress active={pull.running} startedAt={pull.startedAt} title="Pulling from Meta" onCancel={pull.cancel} />
 *   const outcome = await pull.start();
 *
 * Leaving the screen stops waiting for the answer (the request is aborted);
 * the server-side job is not undone, so the screen refetches its status when it opens again.
 */
export function useJobRunner<T, A extends unknown[] = []>(job: JobFn<T, A>) {
  const [runner] = useState(() => createJobRunner<T, A>(job));
  useEffect(() => {
    runner.setJob(job);
  });
  useEffect(() => () => runner.cancel(), [runner]);
  const state = useSyncExternalStore(runner.subscribe, runner.getState, runner.getState);
  return { ...state, start: runner.start, cancel: runner.cancel, reset: runner.reset };
}
