import { File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';

/** Android's Intent.FLAG_GRANT_READ_URI_PERMISSION: the installer may read our file. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_TYPE = 'application/vnd.android.package-archive';

/** The download failed (offline, an expired link, no space): nothing was opened. */
export class ApkDownloadError extends Error {}
/** The APK downloaded but Android's installer could not be opened. */
export class ApkInstallerError extends Error {}

/**
 * Downloads the APK into the app's cache (one file, replaced each time, so old
 * updates never pile up) and hands it to Android's installer, which asks to
 * update the app. No browser: a Custom Tab can leave an APK download stuck at
 * 100% on some phones. The first time, Android asks to allow installs from
 * this app (REQUEST_INSTALL_PACKAGES in app.json). `onProgress` gets whole
 * percents (0 to 100), or null when the size is unknown.
 */
export async function downloadAndInstallApk(url: string, onProgress?: (percent: number | null) => void): Promise<void> {
  const target = new File(Paths.cache, 'tekmadev-admin-update.apk');
  let last = -1;
  let file: File;
  try {
    file = await File.downloadFileAsync(url, target, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const percent = totalBytes > 0 ? Math.min(100, Math.floor((bytesWritten / totalBytes) * 100)) : null;
        if (percent === last) return;
        last = percent ?? -1;
        onProgress?.(percent);
      },
    });
  } catch (e) {
    throw new ApkDownloadError(e instanceof Error ? e.message : String(e));
  }
  try {
    await startActivityAsync('android.intent.action.VIEW', { data: file.contentUri, type: APK_TYPE, flags: FLAG_GRANT_READ_URI_PERMISSION });
  } catch (e) {
    throw new ApkInstallerError(e instanceof Error ? e.message : String(e));
  }
}
