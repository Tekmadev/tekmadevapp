import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageManipulatorContext, type ImageRef, type ImageResult } from 'expo-image-manipulator';

import { MEDIA_MESSAGES, MediaError } from './errors';
import type { PickedImage } from './pick';
import {
  fitsLimit,
  FORMAT_EXTENSION,
  FORMAT_MIME,
  keepsOriginal,
  QUALITY_STEPS,
  resizeWidth,
  uploadFileName,
  type OutputFormat,
} from './process';
import { discardTempFile } from './tempFiles';

/** An image ready to upload: a local file and what POST /blog/media needs to know about it. */
export type PreparedImage = {
  /** A local file:// URI. */
  uri: string;
  width: number;
  height: number;
  /** MIME type: image/webp, image/jpeg, or image/gif for a GIF kept as it is. */
  type: string;
  fileName: string;
  /** Bytes on disk (the upload reads the exact count again). */
  size: number;
};

const SAVE_FORMAT: Record<OutputFormat, SaveFormat> = { webp: SaveFormat.WEBP, jpeg: SaveFormat.JPEG };

function sizeOf(uri: string): number {
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

/**
 * Resize to at most 2400px wide, then compress to WebP under 10 MB, lowering
 * the quality step by step while the file is still too big. Where WebP cannot
 * be written the same steps run as JPEG. A GIF that already fits goes up
 * unchanged (it keeps its animation). Runs on the native image thread; the JS
 * thread stays free, so the editor stays usable meanwhile.
 *
 * If even the lowest quality is over the limit, the last file is returned
 * anyway: the server then answers with its own "over 10 MB" message.
 */
export async function prepareImage(picked: PickedImage): Promise<PreparedImage> {
  if (keepsOriginal(picked)) {
    return {
      uri: picked.uri,
      width: picked.width,
      height: picked.height,
      type: 'image/gif',
      fileName: uploadFileName(picked.fileName, 'gif'),
      size: sizeOf(picked.uri) || (picked.fileSize ?? 0),
    };
  }

  let context: ImageManipulatorContext | null = null;
  let image: ImageRef | null = null;
  let last: PreparedImage | null = null;
  try {
    context = ImageManipulator.manipulate(picked.uri);
    image = await context.renderAsync();
    // The rendered image has its EXIF rotation applied, so its width is the real one
    // (the picker's own width and height can be unrotated, or 0 when it could not read them).
    const width = resizeWidth(image.width);
    if (width !== null) {
      const full = image;
      context.resize({ width });
      image = await context.renderAsync();
      // Done with the full-size ref (the context lets go of its bitmap when released below).
      full.release();
    }

    let format: OutputFormat = 'webp';
    for (const compress of QUALITY_STEPS) {
      let saved: ImageResult;
      try {
        saved = await image.saveAsync({ format: SAVE_FORMAT[format], compress });
      } catch (error) {
        if (format !== 'webp') throw error;
        // No WebP encoder on this device: JPEG from here on.
        format = 'jpeg';
        saved = await image.saveAsync({ format: SAVE_FORMAT[format], compress });
      }
      if (last) discardTempFile(last.uri);
      last = {
        uri: saved.uri,
        width: saved.width,
        height: saved.height,
        type: FORMAT_MIME[format],
        fileName: uploadFileName(picked.fileName, FORMAT_EXTENSION[format]),
        size: sizeOf(saved.uri),
      };
      if (fitsLimit(last.size)) return last;
    }
    if (!last) throw new MediaError('unreadable', MEDIA_MESSAGES.unreadable);
    return last;
  } catch (error) {
    // A file from an earlier quality step is not handed back: delete it here.
    if (last) discardTempFile(last.uri);
    if (error instanceof MediaError) throw error;
    throw new MediaError('unreadable', MEDIA_MESSAGES.unreadable);
  } finally {
    image?.release();
    context?.release();
  }
}
