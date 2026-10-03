import { ApiError, MESSAGES } from '@/api/errors';

/**
 * Typed failures of the image upload flow. The API's own errors stay
 * ApiError (their message is shown as given); everything that fails on the
 * phone or at the storage step is a MediaError with plain copy.
 */

export type MediaErrorKind =
  /** Camera access was refused. */
  | 'permission'
  /** The gallery or camera could not be opened. */
  | 'picker'
  /** The picked file could not be decoded, re-encoded or read. */
  | 'unreadable'
  | 'offline'
  /** The bytes did not reach Supabase Storage. */
  | 'storage'
  /** This build has no Supabase URL or publishable key. */
  | 'not_configured';

export const MEDIA_MESSAGES = {
  cameraDenied: 'Camera access is off. Allow it in Settings, or choose from the gallery.',
  gallery: 'Could not open your photos. Try again.',
  camera: 'Could not open the camera. Try again.',
  unreadable: 'That image could not be read. Try another one.',
  storage: 'The upload did not finish. Try again.',
  notConfigured: 'Image uploads are not set up in this build of the app.',
} as const;

export class MediaError extends Error {
  readonly kind: MediaErrorKind;

  constructor(kind: MediaErrorKind, message: string) {
    super(message);
    this.name = 'MediaError';
    this.kind = kind;
  }
}

/** What to show under the field: the API's message as given, or a plain local one. */
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof MediaError || error instanceof ApiError) return error.message;
  if (__DEV__) {
    // Not a known failure: most likely a bug in the flow. Keep it visible in development.
    console.warn('[blog media] upload failed', error);
  }
  return MESSAGES.generic;
}
