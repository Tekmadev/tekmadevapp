import { create } from 'zustand';

import { readJSON, storage, StorageKeys, writeJSON } from '@/lib/storage';

import { rememberTap, type PermissionSnapshot, type PushPayload, type SetupError } from './logic';

/**
 * Push state the screens read (App settings, Notifications) and the queue of
 * taps waiting to be opened. Plain zustand, so the push host, the foreground
 * handler and the screens share one source.
 */

export type RegistrationStatus = 'idle' | 'registering' | 'registered' | 'failed';

type PushState = {
  /** The notification permission as last read (null until the first read). */
  permission: PermissionSnapshot | null;
  status: RegistrationStatus;
  /** This phone's /devices id, or null when push is not set up here. */
  deviceId: string | null;
  /** Why setup failed (status "failed"). */
  error: SetupError | null;
};

export const usePushState = create<PushState>()(() => ({
  permission: null,
  status: 'idle',
  deviceId: storage.getString(StorageKeys.pushDeviceId) ?? null,
  error: null,
}));

/* ------------------------------------------------------------------ */
/* Taps waiting to open                                                */
/* ------------------------------------------------------------------ */

export type PendingTap = { key: string; payload: PushPayload };

/** The keys of the taps already handled on this phone (each response opens once, even across restarts). */
const HANDLED_TAPS_KEY = 'push.handledTaps.v1';

function handledTaps(): string[] {
  const raw = readJSON<unknown>(storage, HANDLED_TAPS_KEY);
  return Array.isArray(raw) ? raw.filter((key): key is string => typeof key === 'string') : [];
}

export const usePushTaps = create<{ pending: PendingTap | null }>()(() => ({ pending: null }));

/**
 * Queue a tap (or a toast's "Open"). It waits while the app is locked; the
 * signed-in area opens it once it can. A newer tap replaces one still waiting.
 */
export function queueTap(key: string, payload: PushPayload): void {
  const handled = handledTaps();
  if (handled.includes(key)) return;
  writeJSON(storage, HANDLED_TAPS_KEY, rememberTap(handled, key));
  usePushTaps.setState({ pending: { key, payload } });
}

/** Take the waiting tap if it is still `key` (true), so it is opened exactly once. */
export function takeTap(key: string): boolean {
  const pending = usePushTaps.getState().pending;
  if (!pending || pending.key !== key) return false;
  usePushTaps.setState({ pending: null });
  return true;
}

/** Drop a tap still waiting (sign-out: it never opens for the next person). */
export function dropPendingTap(): void {
  if (usePushTaps.getState().pending) usePushTaps.setState({ pending: null });
}
