import { createContext } from 'react';

import type { SheetStore } from './sheetStore';

/** The root sheet stack. Null outside a <SheetProvider> (a <Sheet> then renders nothing). */
export const SheetStoreContext = createContext<SheetStore | null>(null);

/**
 * The overlay root (SheetProvider). Toasts register here so they render above
 * every sheet; outside a provider the ToastHost renders them where it stands.
 */
export type OverlayRoot = {
  /** Ask the root to render the toast stack. Returns the release function. */
  hostToasts: () => () => void;
};

export const OverlayRootContext = createContext<OverlayRoot | null>(null);
