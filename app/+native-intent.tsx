import { useSession } from '@/auth/session';
import { mapAdminUrl, parseAdminUrl, toHref } from '@/lib/deeplinks';

const SCHEME = /^tekmadev-admin:\/\/\/?/i;

/**
 * Incoming deep links (tekmadev-admin://admin/..., notification taps, app
 * shortcuts) carry web admin paths. Rewrite them to app routes before Expo
 * Router navigates. Plain app links (tekmadev-admin://kit) are turned into a
 * path too, because the router would otherwise read "kit" as the URL's host.
 * Never throw here: a crash would kill the cold start.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (parseAdminUrl(path)) {
      return toHref(mapAdminUrl(path, useSession.getState().me ?? null));
    }
    if (SCHEME.test(path)) return `/${path.replace(SCHEME, '')}`;
    return path;
  } catch {
    return '/inbox';
  }
}
