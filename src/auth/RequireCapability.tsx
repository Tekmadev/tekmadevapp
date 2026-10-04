import { router, type Href } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';

import { notice } from '@/lib/notice';

import { can, canAll, canAny, deniedMessage, type Capability } from './capabilities';
import { useSession } from './session';

/**
 * The blocked-screen behaviour shared by RequireCapability and OwnerOnly: when
 * `blocked` turns true, toast `message` once and leave (back, or `fallback`,
 * the Inbox by default, when there is nothing to go back to).
 */
export function useLeaveWhenBlocked(blocked: boolean, message: string, fallback: Href = '/inbox') {
  const handled = useRef(false);
  useEffect(() => {
    if (!blocked || handled.current) return;
    handled.current = true;
    notice.err(message);
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [blocked, message, fallback]);
}

export type RequireCapabilityProps = {
  /** The capability this screen needs. */
  cap?: Capability;
  /** Several capabilities: any one of them opens the screen (every one with `all`). With `cap` too, both must pass. */
  caps?: readonly Capability[];
  /** With `caps`: require every capability instead of any. */
  all?: boolean;
  /** Where to go when there is nothing to go back to (default the Inbox; the Inbox itself uses Home). */
  fallback?: Href;
  children: ReactNode;
};

/**
 * Wrap every screen that needs a capability. Hiding it from menus is a
 * courtesy: the API enforces it with 403. If someone still lands here (an old
 * deep link, a shared URL, a role change), toast the server's copy ("That
 * section is owner only." when only owners hold it, else "Your role cannot do
 * that.") and go back. Renders nothing until allowed, so no data or chrome of
 * a forbidden screen is ever drawn. While the profile is still loading,
 * nothing is shown and nobody is sent away.
 */
export function RequireCapability({ cap, caps, all = false, fallback, children }: RequireCapabilityProps) {
  const list = caps ?? [];
  const known = useSession((s) => s.me !== null);
  const allowed = useSession(
    (s) => (!cap || can(s.me, cap)) && (list.length === 0 || (all ? canAll(s.me, ...list) : canAny(s.me, ...list))),
  );
  const blocked = known && !allowed;
  const needed: Capability[] = cap ? [cap, ...list] : [...list];

  useLeaveWhenBlocked(blocked, deniedMessage(...needed), fallback);

  if (!known || !allowed) return null;
  return <>{children}</>;
}
