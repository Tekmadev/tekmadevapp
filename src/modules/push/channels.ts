import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { useSession } from '@/auth/session';

import { channelsFor, PUSH_CHANNELS, PUSH_GOLD, readableCategories, type PushChannel } from './logic';

/** The categories the channels were last set up for ("leads,clients"), and that run. */
let applied: string | null = null;
let ready: Promise<void> | null = null;

function createChannel(channel: PushChannel) {
  return Notifications.setNotificationChannelAsync(channel.id, {
    name: channel.name,
    description: channel.description,
    importance: channel.critical ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
    lightColor: PUSH_GOLD,
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
    // Shown on the lock screen, with the content hidden when the phone hides sensitive content.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/**
 * Create the Android notification channels (brief section 9) for the
 * categories the signed-in person may read (`inbox.<category>`): one per
 * category plus a high-importance "critical" variant each (heads-up). The
 * channels of other categories are deleted, so a staff member's phone does not
 * list Sales or Team in the system settings (Android brings a deleted
 * channel's settings back if it is created again). Run again when the
 * person's capabilities change; nobody signed in leaves the channels alone.
 * Safe to call again: Android keeps a channel's importance once the person
 * has seen it, and only the name and description are refreshed. The small
 * icon and the accent come from the expo-notifications plugin in app.json.
 * Channels do not exist on iOS. Never throws.
 */
export function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  const me = useSession.getState().me;
  if (!me) return ready ?? Promise.resolve();
  const categories = readableCategories(me);
  const key = categories.join(',');
  if (ready && applied === key) return ready;
  const keep = channelsFor(categories);
  const drop = PUSH_CHANNELS.filter((channel) => !keep.includes(channel));
  applied = key;
  const run: Promise<void> = Promise.all([
    ...keep.map(createChannel),
    ...drop.map((channel) => Notifications.deleteNotificationChannelAsync(channel.id)),
  ])
    .then(() => undefined)
    .catch(() => {
      // Try again next time (a push on a missing channel is not shown).
      if (ready === run) {
        ready = null;
        applied = null;
      }
    });
  ready = run;
  return run;
}
