import * as Clipboard from 'expo-clipboard';

import { haptics } from '@/design/haptics';
import { notice } from '@/lib/notice';

/**
 * Copy text exactly as given (no trimming, no re-encoding: template HTML keeps
 * its `{{contact.first_name}}` and `{{unsubscribe}}` merge tags), then say so.
 */
export async function copyExact(value: string, message = 'Copied.'): Promise<void> {
  try {
    await Clipboard.setStringAsync(value);
    haptics.success();
    notice.ok(message);
  } catch {
    haptics.error();
    notice.err('Could not copy that.');
  }
}
