import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { newIdempotencyKey } from '@/api/client';
import { registerPushDevice, unregisterDeviceOnSignOut } from '@/api/endpoints/session';
import { ApiError, errorMessage } from '@/api/errors';
import { setBeforeSignOut, useSession } from '@/auth/session';
import { connectivity } from '@/lib/connectivity';
import { env, isMockApi } from '@/lib/env';
import { readJSON, storage, StorageKeys, writeJSON } from '@/lib/storage';

import {
  deviceLabel,
  needsRegistration,
  parseRegistration,
  registrationIsCurrent,
  registrationSignature,
  SETUP_MESSAGES,
  tokenErrorMessage,
  type PushRegistration,
  type SetupError,
} from './logic';
import { readPermission } from './permission';
import { dropPendingTap, usePushState } from './store';

/**
 * This phone's registration for push (brief section 9): after sign-in and
 * permission, get the Expo push token, POST /devices, keep the returned id;
 * again when the token, the person, the app version or the platform changes,
 * and once a week. Sign-out removes the row first (best effort).
 */

/** Everything about the last successful POST /devices (the id alone is also under StorageKeys.pushDeviceId). */
const REGISTRATION_KEY = 'push.registration.v1';
/** DELETE /devices/:id on sign-out gives up after this (sign-out never waits long). */
const UNREGISTER_TIMEOUT_MS = 3000;
/** Sign-out waits at most this long for a POST /devices already on its way, so that row is removed too. */
const SETTLE_MS = 1500;

export function readRegistration(): PushRegistration | null {
  return parseRegistration(readJSON<unknown>(storage, REGISTRATION_KEY));
}

function saveRegistration(record: PushRegistration) {
  writeJSON(storage, REGISTRATION_KEY, record);
  storage.set(StorageKeys.pushDeviceId, record.deviceId);
}

/** Forget this phone's registration (sign-out, or the server no longer knows it). */
export function forgetRegistration() {
  storage.remove(REGISTRATION_KEY);
  storage.remove(StorageKeys.pushDeviceId);
  pendingIntent = null;
  usePushState.setState({ deviceId: null, status: 'idle', error: null });
}

/** The EAS project id from app.json (expo.extra.eas.projectId), needed for an Expo push token. */
function projectId(): string | null {
  const fromEas = Constants.easConfig?.projectId;
  if (typeof fromEas === 'string' && fromEas) return fromEas;
  const extra: unknown = Constants.expoConfig?.extra;
  if (typeof extra !== 'object' || extra === null || !('eas' in extra)) return null;
  const eas: unknown = extra.eas;
  if (typeof eas !== 'object' || eas === null || !('projectId' in eas)) return null;
  return typeof eas.projectId === 'string' && eas.projectId ? eas.projectId : null;
}

/** One POST /devices intent: a retry of the same intent reuses its Idempotency-Key. */
let pendingIntent: { signature: string; key: string } | null = null;
/** The last native (FCM) token this module fetched: fetching one also fires the token listener. */
let lastDeviceToken: string | null = null;
let inFlight: Promise<void> | null = null;
/**
 * The mock API keeps its devices in memory, so after an app restart it no
 * longer knows this phone: in mock mode the stored registration is trusted
 * only once this process has registered.
 */
let registeredThisProcess = false;
/** Sign-out has started: no new POST /devices until someone is signed in again (resumeRegistration). */
let signingOut = false;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type RegisterOptions = {
  /** Skip the "still current" shortcut and POST /devices again ("Try again", a lost row). */
  force?: boolean;
  /** A new native token from addPushTokenListener. */
  devicePushToken?: Notifications.DevicePushToken;
};

function fail(error: SetupError) {
  usePushState.setState({ status: 'failed', error });
}

const signedInUserId = (): string | null => {
  const state = useSession.getState();
  return state.status === 'signedIn' ? (state.me?.user.id ?? null) : null;
};

async function register(options: RegisterOptions): Promise<void> {
  const userId = signedInUserId();
  if (!userId || signingOut) return;
  const permission = await readPermission();
  // Off: nothing to register. The Notifications screen offers "Turn on".
  if (permission.status !== 'granted') return;

  const record = readRegistration();
  const current = { userId, appVersion: env.appVersion, platform: Platform.OS, now: Date.now() };
  const trusted = !isMockApi || registeredThisProcess;
  if (trusted && !options.force && !options.devicePushToken && registrationIsCurrent(record, current)) {
    usePushState.setState({ status: 'registered', deviceId: record.deviceId, error: null });
    return;
  }

  const project = projectId();
  if (!project) {
    fail({ message: SETUP_MESSAGES.project, detail: null });
    return;
  }

  usePushState.setState({ status: 'registering', error: null });
  let token: string;
  try {
    const device = options.devicePushToken ?? (await Notifications.getDevicePushTokenAsync());
    lastDeviceToken = typeof device.data === 'string' ? device.data : null;
    const expo = await Notifications.getExpoPushTokenAsync({ projectId: project, devicePushToken: device });
    token = expo.data;
  } catch (error) {
    fail(tokenErrorMessage(error, connectivity.isOnline()));
    return;
  }

  if (trusted && !options.force && !needsRegistration(record, { ...current, token })) {
    usePushState.setState({ status: 'registered', deviceId: record?.deviceId ?? null, error: null });
    return;
  }
  // Sign-out started while the token was on its way: register nothing.
  if (signingOut) {
    usePushState.setState({ status: 'idle', error: null });
    return;
  }

  const signature = registrationSignature({ userId, token, appVersion: current.appVersion, platform: current.platform });
  if (pendingIntent?.signature !== signature) pendingIntent = { signature, key: newIdempotencyKey() };
  try {
    const { id } = await registerPushDevice(
      {
        token,
        platform: current.platform,
        appVersion: current.appVersion,
        deviceName: deviceLabel(Device.deviceName, Device.modelName),
      },
      pendingIntent.key,
    );
    pendingIntent = null;
    registeredThisProcess = true;
    // Signed out (or someone else signed in) while this was on its way: keep nothing.
    if (signedInUserId() !== userId) return;
    saveRegistration({ deviceId: id, token, userId, appVersion: current.appVersion, platform: current.platform, registeredAt: Date.now() });
    usePushState.setState({ status: 'registered', deviceId: id, error: null });
  } catch (error) {
    // Offline: say so, and set up by itself once the connection is back (the push host retries).
    if (error instanceof ApiError && error.isNetwork && !connectivity.isOnline()) fail({ message: SETUP_MESSAGES.offline, detail: null });
    else fail({ message: errorMessage(error), detail: null });
  }
}

/**
 * Register this phone when it needs it. Cheap when nothing changed (no token
 * request). One run at a time; a call during a run waits for it, then runs.
 * Never throws: failures land in the push state for the Notifications screen.
 */
export function registerThisPhone(options: RegisterOptions = {}): Promise<void> {
  const previous = inFlight ?? Promise.resolve();
  const run = previous
    .then(() => register(options))
    .catch(() => fail({ message: SETUP_MESSAGES.generic, detail: null }))
    .finally(() => {
      if (inFlight === run) inFlight = null;
    });
  inFlight = run;
  return run;
}

/**
 * addPushTokenListener: the native token rolled. Fetching a token fires this
 * too, so the token this module fetched itself, and anything during a run, is
 * ignored.
 */
export function onDevicePushToken(token: Notifications.DevicePushToken) {
  if (inFlight) return;
  const data = typeof token.data === 'string' ? token.data : null;
  if (data === null || data === lastDeviceToken) return;
  void registerThisPhone({ devicePushToken: token });
}

/**
 * Sign-out: DELETE /devices/:id while the session is still valid, then forget
 * the registration whatever happened. A POST /devices already on its way is
 * given a moment to land first, so its row goes too, and no new one starts.
 * A tap still waiting to open is dropped (it never opens for the next person).
 * Skipped offline. A 404 means the row is gone already. Never throws, never
 * waits more than a few seconds.
 */
export async function unregisterThisPhone(): Promise<void> {
  signingOut = true;
  dropPendingTap();
  const running = inFlight;
  if (running) await Promise.race([running, delay(SETTLE_MS)]);
  const id = storage.getString(StorageKeys.pushDeviceId) ?? readRegistration()?.deviceId ?? null;
  forgetRegistration();
  if (!id || !connectivity.isOnline()) return;
  // Best effort: a 404 is already gone; anything else leaves the row for the server to prune.
  await unregisterDeviceOnSignOut(id, UNREGISTER_TIMEOUT_MS).catch(() => undefined);
}

/** Someone is signed in (the push host mounted): registering is allowed again. */
export function resumeRegistration() {
  signingOut = false;
}

let signOutInstalled = false;

/** Hook the unregister into sign-out (once per process). */
export function installPushSignOut() {
  if (signOutInstalled) return;
  signOutInstalled = true;
  setBeforeSignOut(unregisterThisPhone);
}
