import * as WebBrowser from 'expo-web-browser';
import { ArrowDownToLine, X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { askForUpdate, safeApkUrl, updateDownloadUrl } from '@/auth/appVersion';
import { session } from '@/auth/session';
import { useTheme, type Theme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { ApkInstallerError, downloadAndInstallApk } from '@/lib/apkInstall';
import { env } from '@/lib/env';
import { notice } from '@/lib/notice';

import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Text } from './Text';

export { ASK_FOR_APK } from '@/auth/appVersion';

/**
 * Opens the APK link in a Custom Tab tinted like the app; the browser handles
 * the download and Android's installer takes it from there. Returns false when
 * there is no usable https link.
 */
export function openApkDownload(url: string | null | undefined, colors: Theme['colors']): boolean {
  const safe = safeApkUrl(url);
  if (!safe) return false;
  WebBrowser.openBrowserAsync(safe, {
    toolbarColor: colors.bg,
    secondaryToolbarColor: colors.bg,
    showTitle: true,
  }).catch(() => notice.err('Could not open the download link.'));
  return true;
}

/**
 * "Download": the server's APK link is signed and stops working after a few
 * hours, and the card may have been on screen longer than that, so ask GET /me
 * for a fresh link first (offline, or when that read fails, the link already
 * on screen is tried). On Android the app downloads the APK itself and opens
 * Android's installer: a browser download of an APK can hang at 100% and
 * never save the file. The browser is the fallback only when the installer
 * cannot be opened.
 */
export async function downloadLatestApk(current: string | null, colors: Theme['colors'], onProgress?: (percent: number | null) => void): Promise<void> {
  let url = current;
  try {
    const fresh = await session.refreshMe();
    url = (fresh && updateDownloadUrl(fresh.app.apkUrl)) || current;
  } catch {
    // Keep the link on screen.
  }
  const safe = safeApkUrl(url);
  if (!safe) {
    notice.err('The download link is missing. Check for updates again.');
    return;
  }
  if (Platform.OS !== 'android') {
    openApkDownload(safe, colors);
    return;
  }
  try {
    await downloadAndInstallApk(safe, onProgress);
  } catch (e) {
    if (e instanceof ApkInstallerError) {
      openApkDownload(safe, colors);
      return;
    }
    notice.err('The update did not download. Check your connection and try again.');
  }
}

/** A Download button's state: the black hole and "Downloading 45%" while the update downloads. */
export function useApkDownload(current: string | null) {
  const { colors } = useTheme();
  const [pending, setPending] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const start = async () => {
    if (pending) return;
    setPending(true);
    setPercent(null);
    try {
      await downloadLatestApk(current, colors, setPercent);
    } finally {
      setPending(false);
      setPercent(null);
    }
  };
  return { start, pending, pendingLabel: percent === null ? 'Downloading' : `Downloading ${percent}%` };
}

export type UpdateCardProps = {
  /** From GET /me `app.latestVersion`. */
  latestVersion: string;
  /** From GET /me `app.apkUrl`; null (or not https, or an iPhone) shows who to ask instead. */
  apkUrl: string | null;
  /** Hide it. The caller decides how long for (e.g. until the next version). */
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The gentle "Update available" card (brief section 10) for Home and About.
 * Calm on purpose: the app still works, so it informs and offers, never blocks.
 * Below the minimum version the blocking UpdateRequiredScreen takes over instead.
 */
export function UpdateCard({ latestVersion, apkUrl, onDismiss, style, testID }: UpdateCardProps) {
  const { colors } = useTheme();
  const download = updateDownloadUrl(apkUrl);
  const apk = useApkDownload(download);

  return (
    <Card style={style} testID={testID}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: colors.goldTint }]}>
          <Icon icon={ArrowDownToLine} size={20} color="gold" />
        </View>
        <View style={styles.text}>
          <Text variant="title" accessibilityRole="header">
            Update available
          </Text>
          <Text variant="small" color="ink3" tabular>
            {`Version ${latestVersion} is ready. You have ${env.appVersion}.`}
          </Text>
        </View>
        <IconButton icon={X} size={20} color="ink4" accessibilityLabel="Dismiss update" onPress={onDismiss} style={styles.dismiss} />
      </View>
      {download ? (
        <Button
          label="Download"
          icon={ArrowDownToLine}
          variant="secondary"
          size="sm"
          pending={apk.pending}
          pendingLabel={apk.pendingLabel}
          onPress={apk.start}
          accessibilityLabel={`Download version ${latestVersion}`}
          style={styles.action}
        />
      ) : (
        <Text variant="small" color="ink2" style={styles.ask}>
          {askForUpdate()}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  badge: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2, paddingTop: 1 },
  // The 48dp target overhangs the card's padding instead of pushing the text in.
  dismiss: { marginTop: -space[3], marginRight: -space[3] },
  action: { alignSelf: 'flex-start', marginTop: space[3], marginLeft: 40 + space[3] },
  ask: { marginTop: space[2], marginLeft: 40 + space[3] },
});
