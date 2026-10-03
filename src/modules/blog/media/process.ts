import { BLOG_MEDIA_MAX_BYTES } from '@/api/schemas/blog';

/**
 * The pure rules behind preparing a picked image for the "blog-media" bucket
 * (brief update 2026-09-30): at most 2400px wide, WebP (JPEG where WebP cannot
 * be written), under 10 MB. The native steps live in prepare.ts.
 */

/** Images wider than this are resized down to it (the height follows). */
export const MAX_IMAGE_WIDTH = 2400;

/** Compression quality, tried in order until the file fits under the limit. */
export const QUALITY_STEPS: readonly number[] = [0.82, 0.7, 0.55, 0.4];

export type OutputFormat = 'webp' | 'jpeg';

export const FORMAT_MIME: Record<OutputFormat, 'image/webp' | 'image/jpeg'> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

export const FORMAT_EXTENSION: Record<OutputFormat, string> = { webp: 'webp', jpeg: 'jpg' };

/**
 * The width to resize to, or null when the image is already narrow enough.
 * Give it the decoded width (EXIF rotation applied), not the picker's.
 */
export function resizeWidth(width: number): number | null {
  return width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH : null;
}

/** A file the bucket takes: not empty, and at most 10 MB. */
export function fitsLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= BLOG_MEDIA_MAX_BYTES;
}

/**
 * A GIF goes up as it is when it already fits (at most 2400px wide, under
 * 10 MB): the resizer would keep only its first frame. Anything else is
 * re-encoded, which also turns HEIC, PNG and large JPEG photos into WebP.
 */
export function keepsOriginal(image: { mimeType: string | null; width: number; fileSize: number | null }): boolean {
  return (
    image.mimeType?.toLowerCase() === 'image/gif' &&
    // 0 means the picker could not read the size: re-encode, so the width limit still holds.
    image.width > 0 &&
    image.width <= MAX_IMAGE_WIDTH &&
    image.fileSize !== null &&
    fitsLimit(image.fileSize)
  );
}

/**
 * The name sent with the upload: the picked file's name with the new
 * extension ("IMG_2041.HEIC" becomes "IMG_2041.webp"). The server slugifies it
 * and makes the path unique, so this only has to be readable. Camera shots
 * often have no name: they become "photo.webp".
 */
export function uploadFileName(original: string | null | undefined, extension: string, fallback = 'photo'): string {
  const base = (original ?? '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || fallback}.${extension}`;
}
