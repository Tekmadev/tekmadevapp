import { useContext, useEffect } from 'react';

import { OverlayRootContext } from './sheet/context';
import { ToastStack } from './Toast';

/**
 * Mounts the toast stack once, at the root. Inside a SheetProvider the stack is
 * drawn by the provider, above every open sheet; on its own it draws here.
 * Show toasts with notice.ok() / notice.err() from src/lib/notice.ts.
 */
export function ToastHost() {
  const root = useContext(OverlayRootContext);
  useEffect(() => root?.hostToasts(), [root]);
  return root ? null : <ToastStack />;
}
