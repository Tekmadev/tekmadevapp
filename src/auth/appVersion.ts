import { Platform } from 'react-native';

import type { Me } from '@/api/schemas/session';
import { env } from '@/lib/env';

/**
 * Version gates from GET /me (brief section 10). Behind `latestVersion`: a
 * gentle "Update available" card. Below `minVersion` (or any 426): the blocking
 * update screen. Pure functions, so Home, About and the session can share them.
 */

export type AppVersions = Me['app'];

/** "v1.2.3-beta.1+45" to [1, 2, 3]. Pre-release and build tags are ignored; junk parts count as 0. */
function parts(version: string): number[] {
  const core = version.trim().replace(/^v/i, '').split(/[-+]/)[0] ?? '';
  return core.split('.').map((n) => {
    const value = parseInt(n, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
}

/** Numeric, part by part: "1.10.0" is newer than "1.9.3", and "1.2" equals "1.2.0". */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** This build is too old for the server: show the blocking update screen. */
export function isBelowMinVersion(app: AppVersions, current: string = env.appVersion): boolean {
  return compareVersions(current, app.minVersion) < 0;
}

/** A newer build exists: show the gentle card (Home, About). */
export function isUpdateAvailable(app: AppVersions, current: string = env.appVersion): boolean {
  return compareVersions(current, app.latestVersion) < 0;
}

/** Only an https link is opened for the APK download; anything else is treated as missing. */
export function safeApkUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https:\/\/[^\s/]+\.[^\s]+$/i.test(trimmed) ? trimmed : null;
}

/**
 * The link "Download" opens: the APK on Android. An iPhone never installs an
 * APK, so it gets no link and is told who to ask instead.
 */
export function updateDownloadUrl(apkUrl: string | null | undefined, platform: string = Platform.OS): string | null {
  return platform === 'ios' ? null : safeApkUrl(apkUrl);
}

/** When the server has no download link yet, the update comes from the founder by hand. */
export const ASK_FOR_APK = 'Ask Shajeed I. for the latest APK.';
export const ASK_FOR_UPDATE_IOS = 'Ask Shajeed I. for the latest iPhone version.';

/** Who to ask for the update when there is nothing to download, in the words of the platform. */
export function askForUpdate(platform: string = Platform.OS): string {
  return platform === 'ios' ? ASK_FOR_UPDATE_IOS : ASK_FOR_APK;
}
