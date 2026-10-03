import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { PUSH_CHANNELS, PUSH_GOLD } from './logic';

let ready: Promise<void> | null = null;

/**
 * Create the Android notification channels (brief section 9): one per
 * category plus a high-importance "critical" variant each (heads-up). Safe to
 * call again: Android keeps a channel's importance once the person has seen
 * it, and only the name and description are refreshed. The small icon and the
 * accent come from the expo-notifications plugin in app.json. Channels do not
 * exist on iOS. Never throws.
 */
export function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!ready) {
    ready = Promise.all(
      PUSH_CHANNELS.map((channel) =>
        Notifications.setNotificationChannelAsync(channel.id, {
          name: channel.name,
          description: channel.description,
          importance: channel.critical ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
          lightColor: PUSH_GOLD,
          enableLights: true,
          enableVibrate: true,
          showBadge: true,
          // Shown on the lock screen, with the content hidden when the phone hides sensitive content.
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        }),
      ),
    )
      .then(() => undefined)
      .catch(() => {
        // Try again next time (a push on a missing channel is not shown).
        ready = null;
      });
  }
  return ready;
}
