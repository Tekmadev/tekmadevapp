import { router } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';

import { MESSAGES } from '@/api/errors';
import { notice } from '@/lib/notice';

import { useRole } from './session';

/**
 * Wrap every owner-only screen. Hiding owner-only UI is a courtesy: the API
 * enforces it with 403. If a manager still lands here (an old deep link, a
 * shared URL), show "That section is owner only." and go back. Renders nothing
 * for managers, so no owner-only data or chrome is ever drawn.
 */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const role = useRole();
  const handled = useRef(false);
  const blocked = role !== null && role !== 'owner';

  useEffect(() => {
    if (!blocked || handled.current) return;
    handled.current = true;
    notice.err(MESSAGES.ownerOnly);
    if (router.canGoBack()) router.back();
    else router.replace('/inbox');
  }, [blocked]);

  if (role !== 'owner') return null;
  return <>{children}</>;
}
