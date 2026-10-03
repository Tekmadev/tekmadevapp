import { File, Paths } from 'expo-file-system';

import { isLocalStandIn } from './localImages';

/** "file:///data/x" and "file:/data/x" are the same file: compare plain paths. */
function pathOf(uri: string): string {
  return uri.replace(/^file:\/*/i, '/');
}

/**
 * Deletes a temporary image this flow made: the picker's copy or a re-encoded
 * file, both in the app's cache directory. Anything outside the cache (never
 * the writer's own photo) and a mock-mode preview stand-in are left alone.
 * Never throws: a leftover in the cache is harmless, the system clears it.
 */
export function discardTempFile(uri: string | null | undefined) {
  if (!uri || isLocalStandIn(uri)) return;
  try {
    const cache = pathOf(Paths.cache.uri).replace(/\/?$/, '/');
    if (!pathOf(uri).startsWith(cache)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Not worth reporting: see above.
  }
}
