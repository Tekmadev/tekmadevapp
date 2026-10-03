import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ensureChannels } from './channels';
import { channelIdFor, LOCAL_TEST_IDENTIFIER, PUSH_GOLD, TEST_NOTIFICATION_ID, type PushPayload } from './logic';

/** Same title and body as the server's test push (docs/api-requests/notifications.md). */
export const TEST_PUSH_COPY = { title: 'Test notification', body: 'Push works on this phone.' } as const;

/**
 * Mock API mode only: the mock cannot reach Expo, so after its answer this
 * phone shows a local notification with the same payload shape, on the Leads
 * channel, so the channel, the icon, the tap routing and the foreground toast
 * can all be checked. A second test replaces the first in the shade.
 */
export async function presentLocalTest(): Promise<void> {
  await ensureChannels();
  const payload: PushPayload = { notificationId: TEST_NOTIFICATION_ID, url: '/admin/notifications', category: 'leads', severity: 'info' };
  await Notifications.scheduleNotificationAsync({
    identifier: LOCAL_TEST_IDENTIFIER,
    content: { title: TEST_PUSH_COPY.title, body: TEST_PUSH_COPY.body, data: payload, color: PUSH_GOLD },
    // Android: at once, on the Leads channel. iOS: at once.
    trigger: Platform.OS === 'android' ? { channelId: channelIdFor(payload.category, payload.severity) } : null,
  });
}
