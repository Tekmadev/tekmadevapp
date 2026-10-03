import * as ImagePicker from 'expo-image-picker';

import { MEDIA_MESSAGES, MediaError } from './errors';

export type ImageSource = 'library' | 'camera';

/** The image the writer picked or shot, before any processing. */
export type PickedImage = {
  uri: string;
  width: number;
  height: number;
  mimeType: string | null;
  fileName: string | null;
  /** Bytes, when the picker knows it. */
  fileSize: number | null;
};

/**
 * Full quality from the picker: resizing and compression happen once, in
 * prepare.ts. The gallery is the system photo picker, which needs no storage
 * permission on Android (READ_MEDIA_* stay blocked) or iOS.
 */
const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  allowsMultipleSelection: false,
  quality: 1,
  exif: false,
  base64: false,
};

/**
 * Opens the gallery or the camera. Resolves null when the writer cancels
 * (that is not an error). The camera asks for its permission first.
 */
export async function pickImage(source: ImageSource): Promise<PickedImage | null> {
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    if (!permission?.granted) throw new MediaError('permission', MEDIA_MESSAGES.cameraDenied);
    try {
      result = await ImagePicker.launchCameraAsync(OPTIONS);
    } catch {
      throw new MediaError('picker', MEDIA_MESSAGES.camera);
    }
  } else {
    try {
      result = await ImagePicker.launchImageLibraryAsync(OPTIONS);
    } catch {
      throw new MediaError('picker', MEDIA_MESSAGES.gallery);
    }
  }

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    fileSize: typeof asset.fileSize === 'number' ? asset.fileSize : null,
  };
}
