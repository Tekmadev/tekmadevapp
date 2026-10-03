/**
 * Mock API mode only. The mock hands out a fake upload token, so nothing
 * reaches storage and the slot's public URL points nowhere. The post keeps that
 * https URL (so saving works exactly like live), and previews show the file
 * still on the phone instead. Memory only: after a restart the mock URL shows
 * the "could not load" fallback, like any broken link.
 */

const localByUrl = new Map<string, string>();
const standIns = new Set<string>();

/** Remember the local file that stands in for `publicUrl` in previews. */
export function rememberLocalImage(publicUrl: string, localUri: string) {
  localByUrl.set(publicUrl, localUri);
  standIns.add(localUri);
}

/** The URI to draw for an image URL: the local stand-in when there is one, otherwise the URL itself. */
export function displayUri(url: string): string {
  return localByUrl.get(url) ?? url;
}

/** A local file that previews still draw (never delete it). */
export function isLocalStandIn(uri: string): boolean {
  return standIns.has(uri);
}
