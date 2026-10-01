import { useSession } from '@/auth/session';
import { mapAdminUrl, parseAdminUrl, toHref } from '@/lib/deeplinks';

/**
 * Incoming deep links (tekmadev-admin://admin/..., notification taps, app
 * shortcuts) carry web admin paths. Rewrite them to app routes before Expo
 * Router navigates. Never throw here: a crash would kill the cold start.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (!parseAdminUrl(path)) return path;
    const role = useSession.getState().me?.role ?? null;
    return toHref(mapAdminUrl(path, role));
  } catch {
    return '/inbox';
  }
}
