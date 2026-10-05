import { createContext, type ReactNode } from 'react';

import type { SheetStore } from './sheetStore';

/** The root sheet stack. Null outside a <SheetProvider> (a <Sheet> then renders nothing). */
export const SheetStoreContext = createContext<SheetStore | null>(null);

/** A full-screen layer the root draws above every sheet and toast. */
export type OverlayLayer = {
  /** One layer per key: showing the same key again replaces it. */
  key: string;
  /** Higher draws on top. */
  order: number;
  /** Hides everything under it from VoiceOver and TalkBack (the app lock). */
  modal: boolean;
  node: ReactNode;
};

/**
 * The overlay root (SheetProvider). Toasts register here so they render above
 * every sheet; outside a provider the ToastHost renders them where it stands.
 */
export type OverlayRoot = {
  /** Ask the root to render the toast stack. Returns the release function. */
  hostToasts: () => () => void;
  /**
   * Draw a layer above the sheets and the toasts, in the app's own view (the
   * iOS app lock and app switcher cover: a Modal there is a separate view
   * controller that cannot show while another one is presented). Returns the
   * remove function.
   */
  showLayer: (layer: OverlayLayer) => () => void;
};

export const OverlayRootContext = createContext<OverlayRoot | null>(null);
