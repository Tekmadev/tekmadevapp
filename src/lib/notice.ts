import { create } from 'zustand';

/**
 * Toast / notice queue. Any code (screens, mutations, the API client bridge) can
 * call `notice.ok()` or `notice.err()`; the <ToastHost/> mounted at the root
 * renders them (slides down from the top, auto-dismiss 3.5s, swipe up to dismiss).
 */

export type NoticeTone = 'ok' | 'err';
export type NoticeAction = { label: string; onPress: () => void };
export type Notice = {
  id: number;
  tone: NoticeTone;
  message: string;
  action?: NoticeAction;
  /** ms before auto-dismiss; default 3500. */
  duration?: number;
};

type NoticeState = {
  queue: Notice[];
  push: (n: Omit<Notice, 'id'>) => number;
  dismiss: (id: number) => void;
  clear: () => void;
};

let nextId = 1;

export const useNotices = create<NoticeState>()((set) => ({
  queue: [],
  push: (n) => {
    const id = nextId++;
    // Same message twice in a row replaces the first (no stacking duplicates).
    set((s) => ({ queue: [...s.queue.filter((q) => q.message !== n.message), { ...n, id }].slice(-3) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
  clear: () => set({ queue: [] }),
}));

export const notice = {
  ok: (message: string, options?: { action?: NoticeAction; duration?: number }) =>
    useNotices.getState().push({ tone: 'ok', message, ...options }),
  err: (message: string, options?: { action?: NoticeAction; duration?: number }) =>
    useNotices.getState().push({ tone: 'err', message, ...options }),
  dismiss: (id: number) => useNotices.getState().dismiss(id),
};
