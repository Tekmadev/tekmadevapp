import { File } from 'expo-file-system';

import { requestMediaUpload } from '@/api/endpoints/blog';
import { MESSAGES } from '@/api/errors';
import { getSupabase, isSupabaseConfigured } from '@/auth/supabase';
import { connectivity } from '@/lib/connectivity';
import { env } from '@/lib/env';

import { MEDIA_MESSAGES, MediaError } from './errors';
import { rememberLocalImage } from './localImages';
import type { PreparedImage } from './prepare';

/** Up to 10 MB on a slow mobile connection, with room to spare. */
const STORAGE_TIMEOUT_MS = 180_000;

/**
 * Uploads a prepared image and resolves its public URL (brief update
 * 2026-09-30):
 *
 * 1. read the file into an ArrayBuffer (its byte count is the size we declare),
 * 2. POST /blog/media { fileName, size, type } for a signed slot (owner only;
 *    a 400 `type` or `size` comes back as an ApiError with the server's message),
 * 3. upload the bytes straight to Supabase Storage with the app's client:
 *    `uploadToSignedUrl(path, token, bytes, { contentType })`. The token
 *    authorizes it; the publishable key is enough. The bytes never go through
 *    the admin API.
 *
 * In mock API mode the token is fake: step 3 is skipped and the local file
 * stands in for the public URL in previews (see localImages.ts).
 */
export async function uploadImage(image: PreparedImage): Promise<string> {
  if (!connectivity.isOnline()) throw new MediaError('offline', MESSAGES.offline);
  // Checked before asking for a slot, so a build without Supabase never takes one it cannot use.
  const mock = env.apiMode === 'mock';
  if (!mock && !isSupabaseConfigured()) throw new MediaError('not_configured', MEDIA_MESSAGES.notConfigured);

  let bytes: ArrayBuffer;
  try {
    bytes = await new File(image.uri).arrayBuffer();
  } catch {
    throw new MediaError('unreadable', MEDIA_MESSAGES.unreadable);
  }

  const slot = await requestMediaUpload({ fileName: image.fileName, size: bytes.byteLength, type: image.type });

  if (mock) {
    rememberLocalImage(slot.publicUrl, image.uri);
    return slot.publicUrl;
  }

  const failed = () => new MediaError('storage', connectivity.isOnline() ? MEDIA_MESSAGES.storage : MESSAGES.network);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The storage request has no timeout of its own: on a dead connection "Uploading" would never end.
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new MediaError('storage', MESSAGES.timeout)), STORAGE_TIMEOUT_MS);
  });
  try {
    const upload = getSupabase().storage.from(slot.bucket).uploadToSignedUrl(slot.path, slot.token, bytes, {
      contentType: image.type,
    });
    const { error } = await Promise.race([upload, timeout]);
    if (error) throw failed();
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw failed();
  } finally {
    clearTimeout(timer);
  }
  return slot.publicUrl;
}
