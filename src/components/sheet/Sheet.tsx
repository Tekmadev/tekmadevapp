import { useContext, useId, useLayoutEffect, type ReactNode } from 'react';

import { SheetStoreContext } from './context';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** 'content' sizes to the content (max 92% of the screen); numbers are fractions of the screen height. */
  snapPoints?: 'content' | readonly number[];
  /** Wrap children in a scroll view that cooperates with the drag-to-close gesture. */
  scrollable?: boolean;
  /** Pinned under the content (primary actions); stays above the keyboard. */
  footer?: ReactNode;
  /** False blocks drag-to-close, backdrop tap and back (e.g. while a request runs). Default true. */
  dismissible?: boolean;
  children: ReactNode;
  testID?: string;
};

/**
 * Bottom sheet. Declarative: render it where it belongs and drive it with
 * `visible`; while visible it is shown by the root SheetProvider, above every
 * screen and the tab bar, in the same window (so FLAG_SECURE covers it).
 *
 * The content renders at the root, so it sees the app-wide providers (theme,
 * queries, safe area, keyboard) but not React context from the screen that
 * declared it (navigation hooks, a screen's own providers): pass those values
 * in as props. Every sheet is its own SubmitGroup, and while one of its submit
 * buttons runs the sheet cannot be dismissed.
 *
 *   <Sheet visible={open} onClose={() => setOpen(false)} title="New coupon" scrollable
 *     footer={<PendingButton label="Create coupon" pendingLabel="Creating" onPress={create} />}>
 *     <TextField ... />
 *   </Sheet>
 */
export function Sheet(props: SheetProps) {
  const store = useContext(SheetStoreContext);
  const id = useId();
  const { visible } = props;

  // Every render while visible: the host always draws the latest props.
  useLayoutEffect(() => {
    if (!store) return;
    if (visible) store.show(id, props);
    else store.close(id);
  });

  // Unmounting while visible still plays the close animation.
  useLayoutEffect(() => {
    if (!store) return undefined;
    return () => store.close(id);
  }, [store, id]);

  if (__DEV__ && !store && visible) {
    console.warn('[Sheet] rendered outside <SheetProvider>: nothing will show.');
  }
  return null;
}
