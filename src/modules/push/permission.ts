import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

import { duringSystemPrompt } from '@/auth/lock/biometrics';

import { permissionAction, type PermissionSnapshot } from './logic';
import { usePushState } from './store';

/**
 * The notification permission (POST_NOTIFICATIONS on Android 13 and newer,
 * the system prompt on iOS). Never asked on a cold start: only from the
 * one-time offer after sign-in and the Notifications screen's "Turn on".
 */

function toSnapshot(response: Notifications.NotificationPermissionsStatus): PermissionSnapshot {
  // iOS "provisional" (quiet delivery) counts as allowed (expo reports it as "undetermined").
  const provisional = response.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (response.status === 'granted' || provisional) return { status: 'granted', canAskAgain: response.canAskAgain };
  // Android: the permission is granted but the app's notifications are off in the system settings
  // (expo reports "denied" with granted true). Asking again shows nothing: only the settings help.
  if (response.granted) return { status: 'denied', canAskAgain: false };
  return { status: response.status === 'denied' ? 'denied' : 'undetermined', canAskAgain: response.canAskAgain };
}

const UNKNOWN: PermissionSnapshot = { status: 'undetermined', canAskAgain: false };

/** Read the permission (no prompt) and keep it in the push state. Never throws. */
export async function readPermission(): Promise<PermissionSnapshot> {
  const snapshot = await Notifications.getPermissionsAsync().then(toSnapshot, () => UNKNOWN);
  usePushState.setState({ permission: snapshot });
  return snapshot;
}

/** Show the system prompt. Never throws. */
export async function askPermission(): Promise<PermissionSnapshot> {
  // The system dialog sends the app to the background on Android; it is not the person leaving.
  const snapshot = await duringSystemPrompt(() =>
    Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    }),
  ).then(toSnapshot, () => UNKNOWN);
  usePushState.setState({ permission: snapshot });
  return snapshot;
}

/**
 * "Turn on": ask when the system still asks, otherwise open this app's page in
 * the system settings (the screen reads the permission again on return).
 */
export async function turnOnPush(): Promise<PermissionSnapshot> {
  const current = await readPermission();
  const action = permissionAction(current);
  if (action === 'ask') return askPermission();
  if (action === 'settings') await Linking.openSettings().catch(() => undefined);
  return current;
}
