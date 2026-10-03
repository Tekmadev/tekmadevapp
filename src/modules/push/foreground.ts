import * as Notifications from 'expo-notifications';

import { notificationKeys } from '@/api/endpoints/notifications';
import { queryClient } from '@/api/query';
import { notice } from '@/lib/notice';

import { foregroundBehavior, LOCAL_TEST_IDENTIFIER, parsePushPayload, PUSH_COPY, responseKey, rowIdOf, toastMessage, toastTone } from './logic';
import { queueTap } from './store';

/**
 * What a push does while the app is open, and what a tap on one does (brief
 * section 9). Installed by the push host while someone is signed in.
 */

/** A toast with "Open" stays a little longer than the usual 3.5s. */
const TOAST_WITH_OPEN_MS = 6000;

/** Mirrors the app lock (the push host keeps it current): a locked app lets the system show pushes. */
let appLocked = false;
export function setPushAppLocked(locked: boolean) {
  appLocked = locked;
}

/** The bell and every Inbox list fetch again (a new or bumped row). */
function refreshInbox() {
  void queryClient.invalidateQueries({ queryKey: notificationKeys.summary() });
  void queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
}

function showToast(notification: Notifications.Notification) {
  const { content, identifier } = notification.request;
  const payload = parsePushPayload(content.data);
  const message = toastMessage(content.title, content.body);
  const options = payload?.url
    ? {
        duration: TOAST_WITH_OPEN_MS,
        action: { label: PUSH_COPY.open, onPress: () => queueTap(responseKey(identifier, notification.date, 'toast'), payload) },
      }
    : undefined;
  if (toastTone(payload?.severity ?? 'info') === 'err') notice.err(message, options);
  else notice.ok(message, options);
}

/**
 * setNotificationHandler: a push that arrives while the app is open shows an
 * in-app toast (with "Open" when it has a link) instead of a system banner,
 * and the bell and the Inbox refresh. Returns the uninstaller.
 */
export function installForegroundHandler(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const localTest = notification.request.identifier === LOCAL_TEST_IDENTIFIER;
      const behavior = foregroundBehavior({ locked: appLocked, localTest });
      if (behavior.toast) showToast(notification);
      const payload = parsePushPayload(notification.request.content.data);
      if (payload && rowIdOf(payload)) refreshInbox();
      return {
        shouldShowBanner: behavior.system,
        shouldShowList: behavior.system,
        shouldPlaySound: behavior.system,
        shouldSetBadge: false,
      };
    },
  });
  return () => Notifications.setNotificationHandler(null);
}

/** A tap on a notification: queued once, opened by the push host when the app is unlocked. */
function acceptResponse(response: Notifications.NotificationResponse | null) {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const { notification } = response;
  const payload = parsePushPayload(notification.request.content.data);
  if (payload) queueTap(responseKey(notification.request.identifier, notification.date, response.actionIdentifier), payload);
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Not available on this platform: the tap key already keeps it from opening twice.
  }
}

/**
 * Taps, warm and cold: the response that launched (or was tapped while signed
 * out) is picked up here once someone is signed in, and later taps arrive
 * through the listener. Returns the uninstaller.
 */
export function installResponseListener(): () => void {
  try {
    acceptResponse(Notifications.getLastNotificationResponse());
  } catch {
    // Not available on this platform.
  }
  const subscription = Notifications.addNotificationResponseReceivedListener(acceptResponse);
  return () => subscription.remove();
}
