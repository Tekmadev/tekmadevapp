import { router, type Href } from 'expo-router';

import type { NotificationItem } from '@/api/schemas/notifications';
import { INBOX, mapAdminUrl, toHref, type AppLink, type LinkViewer } from '@/lib/deeplinks';

/** App routes that are tabs: going there switches tab instead of stacking a second tab bar. */
const TAB_PATHS: ReadonlySet<string> = new Set(['/', '/customers', '/analytics', '/marketing', '/more']);

/** The path part of a route ("/customers" for "/customers?segment=leads"). */
function pathnameOf(href: Href): string {
  const path = typeof href === 'string' ? href : href.pathname;
  const cut = path.search(/[?#]/);
  return cut >= 0 ? path.slice(0, cut) : path;
}

/**
 * Where a row's action_url leads in the app, or null when the Inbox itself is
 * the answer (no link, an unknown path, or a page this person cannot open):
 * the detail sheet shows the row instead of pushing the Inbox onto itself.
 * `viewer` is the GET /me profile (its capability list wins), a capability
 * list, or a bare role (its fallback row).
 */
export function destinationOf(item: Pick<NotificationItem, 'action_url'>, viewer: LinkViewer): AppLink | null {
  if (!item.action_url) return null;
  const link = mapAdminUrl(item.action_url, viewer);
  return link.pathname === INBOX.pathname ? null : link;
}

/**
 * Open an app route from anywhere. A stacked screen is pushed. A tab is
 * switched to: from a pushed screen (the Inbox, a client) the stack goes back
 * down to the tabs first, because both push and navigate would otherwise stack
 * a second copy of the tabs on top (the stack's focused route is not the tabs).
 */
export function openHref(href: Href) {
  if (!TAB_PATHS.has(pathnameOf(href))) {
    router.push(href);
    return;
  }
  if (router.canDismiss()) router.dismissTo(href);
  else router.navigate(href);
}

/** Open a mapped web admin path: push a stacked screen, or switch to a tab (with its segment param). */
export function openLink(link: AppLink) {
  // toHref only produces paths of files under app/ (checked by the deep link tests).
  openHref(toHref(link) as Href);
}
