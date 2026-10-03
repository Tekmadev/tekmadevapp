import { storage, StorageKeys } from '@/lib/storage';
import { usePushState } from '@/modules/push/store';

/**
 * Whether this phone is registered for push (brief section 9). The push
 * module (src/modules/push) registers the phone with POST /devices, stores
 * the returned id under StorageKeys.pushDeviceId and removes it on sign-out.
 */
export const PUSH_DEVICE_ID_KEY = StorageKeys.pushDeviceId;

/** The id of this phone's /devices row, or null when push is not set up here. */
export function pushDeviceId(): string | null {
  return storage.getString(StorageKeys.pushDeviceId) ?? null;
}

/** The same id, kept current as the phone registers or signs out. */
export function usePushDeviceId(): string | null {
  return usePushState((s) => s.deviceId);
}
