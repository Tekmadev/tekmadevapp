import { useEffect, useRef, useState } from 'react';

import { haptics } from '@/design/haptics';
import { useLatestCallback } from '@/lib/useLatestCallback';

import { uploadErrorMessage } from './errors';
import { pickImage, type ImageSource, type PickedImage } from './pick';
import { prepareImage, type PreparedImage } from './prepare';
import { discardTempFile } from './tempFiles';
import { uploadImage } from './upload';

export type ImageUpload = {
  /** An image was picked and is being prepared or uploaded. */
  uploading: boolean;
  /** The last failure: the API's message as given, or a plain local one. */
  error: string | null;
  /** The URL of the last successful upload (its preview can show without waiting for a typing debounce). */
  lastUrl: string | null;
  /** Pick from the gallery or the camera, then prepare and upload. Ignored while one is running. */
  start: (source: ImageSource) => void;
  clearError: () => void;
};

export type ImageUploadOptions = {
  /** The image is in storage: use its public URL. */
  onUploaded: (url: string) => void;
  /** The upload failed (the message is also in `error`). */
  onError?: (message: string) => void;
  /** The writer closed the picker without choosing. Not an error. */
  onCancel?: () => void;
};

/**
 * One upload slot (the cover, the social image, the body's "Insert image"):
 * pick, resize and compress, request the signed upload, upload, report. Keep
 * it in a component that outlives the sheet or tab that started it (the
 * editor), so closing the Details sheet never loses an upload in flight.
 * Callbacks always see the newest props; nothing is reported after unmount,
 * and an image picked or prepared after unmount is never uploaded. The
 * temporary files (the picker's copy, the re-encoded image) are deleted.
 */
export function useImageUpload({ onUploaded, onError, onCancel }: ImageUploadOptions): ImageUpload {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const uploaded = useLatestCallback((url: string) => onUploaded(url));
  const failed = useLatestCallback((message: string) => onError?.(message));
  const cancelled = useLatestCallback(() => onCancel?.());

  const run = async (source: ImageSource) => {
    // Checked synchronously, so two taps in one frame cannot open two pickers.
    if (busy.current) return;
    busy.current = true;
    setError(null);
    let picked: PickedImage | null = null;
    let prepared: PreparedImage | null = null;
    try {
      picked = await pickImage(source);
      if (!alive.current) return;
      if (!picked) {
        cancelled();
        return;
      }
      setUploading(true);
      prepared = await prepareImage(picked);
      // Left the editor meanwhile: nothing goes to the bucket for a screen that is gone.
      if (!alive.current) return;
      const url = await uploadImage(prepared);
      if (!alive.current) return;
      setLastUrl(url);
      uploaded(url);
      haptics.success();
    } catch (e) {
      if (!alive.current) return;
      const message = uploadErrorMessage(e);
      setError(message);
      haptics.error();
      failed(message);
    } finally {
      busy.current = false;
      if (alive.current) setUploading(false);
      // The picker's copy and the re-encoded file are temporary (a mock-mode preview stand-in stays).
      discardTempFile(picked?.uri);
      if (prepared && prepared.uri !== picked?.uri) discardTempFile(prepared.uri);
    }
  };

  return {
    uploading,
    error,
    lastUrl,
    start: (source) => {
      void run(source);
    },
    clearError: () => setError(null),
  };
}
