import type { Notice } from '@/lib/notice';

/**
 * Which notices the toast stack draws. Pure so it can be unit tested.
 *
 * The newest notice sits on top and older ones are pushed down under it. At
 * most two are on screen; anything that leaves the queue (dismissed, timed out,
 * pushed out) stays in the list as `leaving` until its exit animation is done.
 */

export const MAX_VISIBLE_TOASTS = 2;
/** Vertical gap between stacked toasts. */
export const TOAST_GAP = 8;
/** Used for stacking until a toast has measured itself. */
export const TOAST_ESTIMATED_HEIGHT = 56;

export type ToastItem = { readonly notice: Notice; readonly leaving: boolean };

/**
 * Newest first (notice ids only grow), leaving items included, so the draw
 * order never changes while a toast animates out.
 */
export function reconcileToasts(previous: readonly ToastItem[], queue: readonly Notice[]): ToastItem[] {
  const shown = queue.slice(-MAX_VISIBLE_TOASTS);
  const shownIds = new Set(shown.map((n) => n.id));
  const next: ToastItem[] = shown.map((notice) => ({ notice, leaving: false }));
  for (const item of previous) {
    if (!shownIds.has(item.notice.id)) next.push({ notice: item.notice, leaving: true });
  }
  return next.sort((a, b) => b.notice.id - a.notice.id);
}

/** Notices that fell out of the visible stack: the host dismisses them so they never come back stale. */
export function overflowNotices(queue: readonly Notice[]): Notice[] {
  return queue.length > MAX_VISIBLE_TOASTS ? queue.slice(0, queue.length - MAX_VISIBLE_TOASTS) : [];
}

/** Distance from the top of the stack for each toast that is not leaving. */
export function stackOffsets(items: readonly ToastItem[], heights: Readonly<Record<number, number>>): Map<number, number> {
  const offsets = new Map<number, number>();
  let y = 0;
  for (const item of items) {
    if (item.leaving) continue;
    offsets.set(item.notice.id, y);
    y += (heights[item.notice.id] ?? TOAST_ESTIMATED_HEIGHT) + TOAST_GAP;
  }
  return offsets;
}
