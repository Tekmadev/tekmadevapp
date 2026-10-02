import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

import { haptics } from '@/design/haptics';
import { notice } from '@/lib/notice';

/**
 * Copy and Share for a short link. Both work offline (nothing is sent to our
 * server). Share uses React Native's share sheet: on Android the URL goes as
 * the message (what every target reads); on iOS as `url`, so targets get a
 * real link with its preview.
 */

export async function copyLink(url: string) {
  try {
    await Clipboard.setStringAsync(url);
    haptics.success();
    notice.ok('Link copied.');
  } catch {
    haptics.error();
    notice.err('Could not copy that.');
  }
}

export async function shareLink(url: string) {
  try {
    await Share.share(Platform.OS === 'ios' ? { url } : { message: url }, { dialogTitle: 'Share link' });
  } catch {
    notice.err('Could not open the share sheet.');
  }
}
