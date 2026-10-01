import type { SheetProps } from './Sheet';

/**
 * The stack of sheets the root host renders. A <Sheet> calls `show` on every
 * render while `visible` (so the portalled content stays reactive to its props)
 * and `close` when `visible` turns false or it unmounts. The host plays the
 * close animation, then calls `remove`.
 */

export type SheetEntry = {
  readonly id: string;
  readonly props: SheetProps;
  /** The owner asked to close: the sheet is animating out. */
  readonly closing: boolean;
};

export type SheetStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => readonly SheetEntry[];
  /**
   * Show a sheet on top of the stack, or refresh the props of one already shown.
   * A sheet that was closing comes back in place (it keeps its spot in the stack).
   * Nothing is committed when the props did not change.
   */
  show: (id: string, props: SheetProps) => void;
  /** Start closing (the host animates, then calls `remove`). */
  close: (id: string) => void;
  remove: (id: string) => void;
  /** The host registers how to dismiss each sheet (it checks `dismissible` itself). */
  setDismisser: (id: string, dismiss: (() => void) | null) => void;
  /** Ask one sheet to close the way the user would (drag, backdrop, handle): runs its dismisser. */
  dismiss: (id: string) => void;
  /** Android back: dismiss the topmost open sheet. True while any sheet is open, so back never leaks to the screen. */
  dismissTop: () => boolean;
};

function sameProps(a: SheetProps, b: SheetProps): boolean {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key as keyof SheetProps] !== b[key as keyof SheetProps]) return false;
  }
  return true;
}

export function topOpenEntry(entries: readonly SheetEntry[]): SheetEntry | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (!entries[i].closing) return entries[i];
  }
  return undefined;
}

export function createSheetStore(): SheetStore {
  let entries: readonly SheetEntry[] = [];
  const listeners = new Set<() => void>();
  const dismissers = new Map<string, () => void>();

  const commit = (next: readonly SheetEntry[]) => {
    entries = next;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => entries,
    show: (id, props) => {
      const current = entries.find((e) => e.id === id);
      if (!current) {
        commit([...entries, { id, props, closing: false }]);
        return;
      }
      if (!current.closing && sameProps(current.props, props)) return;
      commit(entries.map((e) => (e.id === id ? { id, props, closing: false } : e)));
    },
    close: (id) => {
      const current = entries.find((e) => e.id === id);
      if (!current || current.closing) return;
      commit(entries.map((e) => (e.id === id ? { ...e, closing: true } : e)));
    },
    remove: (id) => {
      dismissers.delete(id);
      if (!entries.some((e) => e.id === id)) return;
      commit(entries.filter((e) => e.id !== id));
    },
    setDismisser: (id, dismiss) => {
      if (dismiss) dismissers.set(id, dismiss);
      else dismissers.delete(id);
    },
    dismiss: (id) => {
      dismissers.get(id)?.();
    },
    dismissTop: () => {
      const top = topOpenEntry(entries);
      if (!top) return false;
      dismissers.get(top.id)?.();
      return true;
    },
  };
}
