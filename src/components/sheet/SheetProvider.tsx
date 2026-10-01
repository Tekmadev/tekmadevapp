import type { ReactNode } from 'react';

/**
 * STUB (replaced by the component kit): hosts bottom sheets above every screen
 * (same window, so FLAG_SECURE covers them) and owns the Android back handling.
 */
export function SheetProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
