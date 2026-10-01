import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';

import { ApiError, errorMessage } from '@/api/errors';
import { notice } from '@/lib/notice';

/**
 * Submit groups: every submit control of one form shares a group. While one of
 * them runs its action, every other one is disabled, so nothing is sent twice.
 *
 * Nest controls inside <SubmitGroup>, or pass a handle from useSubmitGroupHandle()
 * as `group` when the controls live in different subtrees (a header action and
 * a footer button). A control outside any group gets a private one, which still
 * blocks double taps. Every Sheet is its own group.
 */

export type SubmitGroupHandle = {
  /** Id of the control whose action is running, or null. */
  getPending: () => string | null;
  subscribe: (listener: () => void) => () => void;
  /**
   * Runs `task` for control `id`. Returns null (and runs nothing) while another
   * control of the group is running. Otherwise returns the task's promise, which
   * rejects with whatever the task threw. The group is free again either way.
   */
  run: <T>(id: string, task: () => Promise<T>) => Promise<T> | null;
};

export function createSubmitGroup(): SubmitGroupHandle {
  let pending: string | null = null;
  const listeners = new Set<() => void>();
  const setPending = (next: string | null) => {
    if (pending === next) return;
    pending = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getPending: () => pending,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    run: <T,>(id: string, task: () => Promise<T>): Promise<T> | null => {
      // Checked synchronously, so two taps in the same frame cannot both start.
      if (pending !== null) return null;
      setPending(id);
      let result: Promise<T>;
      try {
        result = task();
      } catch (error) {
        result = Promise.reject(error);
      }
      return result.finally(() => {
        if (pending === id) setPending(null);
      });
    },
  };
}

const SubmitGroupContext = createContext<SubmitGroupHandle | null>(null);

export type SubmitGroupProps = {
  children: ReactNode;
  /** Adopt a handle created with useSubmitGroupHandle() (for controls outside this subtree). */
  group?: SubmitGroupHandle;
};

export function SubmitGroup({ children, group }: SubmitGroupProps) {
  const [own] = useState(createSubmitGroup);
  return <SubmitGroupContext.Provider value={group ?? own}>{children}</SubmitGroupContext.Provider>;
}

/** A group handle that lives as long as the component (pass it to SubmitGroup and to `group` props). */
export function useSubmitGroupHandle(): SubmitGroupHandle {
  const [group] = useState(createSubmitGroup);
  return group;
}

export type SubmitGroupState = {
  group: SubmitGroupHandle;
  /** Id of the running control, or null. */
  pendingId: string | null;
  /** True while any control of the group runs. */
  busy: boolean;
  run: SubmitGroupHandle['run'];
};

/**
 * The nearest submit group (or `explicit`), for custom submit controls:
 *
 *   const id = useId();
 *   const { pendingId, busy, run } = useSubmitGroup();
 *   // disabled={busy && pendingId !== id}, onPress={() => run(id, save)?.catch(reportSubmitError)}
 */
export function useSubmitGroup(explicit?: SubmitGroupHandle): SubmitGroupState {
  const nearest = useContext(SubmitGroupContext);
  const [solo] = useState(createSubmitGroup);
  const group = explicit ?? nearest ?? solo;
  const pendingId = useSyncExternalStore(group.subscribe, group.getPending, group.getPending);
  return { group, pendingId, busy: pendingId !== null, run: group.run };
}

/**
 * What a submit control does with a failed action. With `onError` the caller
 * owns the error (inline field errors, a custom message). Otherwise the API's
 * message is shown as a notice. 401, 403 and 426 are already handled globally
 * (sign out, owner-only notice, update screen), so they are not shown twice.
 */
export function reportSubmitError(error: unknown, onError?: (error: unknown) => void): void {
  if (onError) {
    onError(error);
    return;
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403 || error.status === 426 || error.kind === 'aborted') return;
  } else if (__DEV__) {
    // Not an API error: most likely a bug in the action itself. Keep it visible in development.
    console.warn('[submit] action failed', error);
  }
  notice.err(errorMessage(error));
}
