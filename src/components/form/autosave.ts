import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { toDate } from '@/lib/dates';
import { drafts } from '@/lib/storage';

/**
 * Local drafts for long text (brief section 4, Offline): what the user types is
 * written to encrypted MMKV every few seconds, so a crash or a kill in the
 * background loses at most the last few seconds. On open, a draft newer than
 * the server copy is offered back ("Restore your unsaved changes?").
 *
 * Callers clear the draft once the server has the text (clearDraft or
 * autosave.clear()).
 */

export const AUTOSAVE_MS = 3000;

export type StoredDraft<T> = { value: T; savedAt: number };

/**
 * When each key was last cleared. A field can still hold unsaved keystrokes when
 * the screen saves and clears its draft; those must not be written back on
 * blur or unmount, or the next visit would offer a stale "restore".
 */
const clearedAt = new Map<string, number>();

export type Autosave<T> = {
  /** Remember the latest value; it is written at most every `delayMs` while typing. */
  schedule: (value: T) => void;
  /** Write the pending value now (blur, leaving the screen). */
  flush: () => void;
  /** Forget the pending value and delete the stored draft (after a successful save). */
  clear: () => void;
};

/**
 * Throttled draft writer. The first change starts the clock and the write
 * stores whatever is newest when it fires, so steady typing still saves every
 * few seconds (a pure debounce would never save while someone keeps typing).
 * Pending text is also written when the app goes to the background and when
 * the component unmounts.
 */
export function useAutosave<T>(key: string | null | undefined, delayMs: number = AUTOSAVE_MS): Autosave<T> {
  const pending = useRef<{ value: T; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(key);

  const write = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    pending.current = null;
    const k = keyRef.current;
    if (!next || !k) return;
    // Typed before the draft was cleared (saved to the server): already safe, so skip.
    if ((clearedAt.get(k) ?? -1) >= next.at) return;
    drafts.set(k, next.value);
  };

  useEffect(() => {
    keyRef.current = key;
    // Switching to another key (or unmounting) first writes what belongs to the old one.
    return () => write();
  }, [key]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') write();
    });
    return () => sub.remove();
  }, []);

  return {
    schedule: (value: T) => {
      if (!keyRef.current) return;
      pending.current = { value, at: Date.now() };
      if (!timer.current) timer.current = setTimeout(write, delayMs);
    },
    flush: write,
    clear: () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      pending.current = null;
      if (keyRef.current) clearDraft(keyRef.current);
    },
  };
}

/** Delete a stored draft (e.g. after the server saved it), including keystrokes still waiting to be written. */
export function clearDraft(key: string) {
  clearedAt.set(key, Date.now());
  drafts.remove(key);
}

const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Whether a stored draft is worth offering: it differs from the server copy and
 * was saved after the server copy was last updated. With no server timestamp
 * (a new item), any different draft counts.
 */
export function isDraftNewer<T>(
  draft: StoredDraft<T> | null | undefined,
  serverValue: T,
  serverUpdatedAt?: string | null,
  isEqual: (a: T, b: T) => boolean = sameValue,
): boolean {
  if (!draft) return false;
  if (isEqual(draft.value, serverValue)) return false;
  const server = toDate(serverUpdatedAt ?? null);
  if (!server) return true;
  return draft.savedAt > server.getTime();
}

export type DraftRestore<T> = {
  /** The draft to offer, or null when there is nothing newer than the server copy. */
  draft: StoredDraft<T> | null;
  /** Hide the offer and return the draft's value for the caller to put back in the form. */
  restore: () => T | null;
  /** Hide the offer and delete the draft. */
  discard: () => void;
};

/**
 * Decide whether to offer "Restore your unsaved changes?" for a draft key.
 * Pass `serverValue` as undefined while the server copy is still loading; the
 * offer waits for it. The draft is read once per key, when the screen opens,
 * so autosaves made while the offer is showing do not change what it restores.
 */
export function useDraftRestore<T>(
  key: string | null | undefined,
  serverValue: T | undefined,
  serverUpdatedAt?: string | null,
  isEqual?: (a: T, b: T) => boolean,
): DraftRestore<T> {
  const stored = useMemo(() => (key ? (drafts.get<T>(key) ?? null) : null), [key]);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);

  const offer =
    key != null && answeredKey !== key && serverValue !== undefined && isDraftNewer(stored, serverValue, serverUpdatedAt, isEqual)
      ? stored
      : null;

  return {
    draft: offer,
    restore: () => {
      if (key) setAnsweredKey(key);
      return stored ? stored.value : null;
    },
    discard: () => {
      if (!key) return;
      clearDraft(key);
      setAnsweredKey(key);
    },
  };
}
