import { storage } from '@/lib/storage';

/**
 * Whether this phone is registered for push (brief section 9). Registration
 * (POST /devices with the FCM-backed Expo push token) arrives with the push
 * phase, once the owner provides the Firebase file. That code stores the `id`
 * POST /devices returns under this key and removes it on sign-out; until then
 * nothing writes it, so this phone honestly reads as not set up.
 */
export const PUSH_DEVICE_ID_KEY = 'push.deviceId.v1';

/** The id of this phone's /devices row, or null when push is not set up here. */
export function pushDeviceId(): string | null {
  return storage.getString(PUSH_DEVICE_ID_KEY) ?? null;
}
