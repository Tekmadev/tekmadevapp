import { api, seg, type RequestOptions } from '../client';
import { zMeta, type Meta } from '../schemas/meta';
import {
  zDeviceRegistration,
  zMe,
  zProfileUpdate,
  zSearchResults,
  type Me,
  type SearchResults,
} from '../schemas/session';

/** Session, meta, search, devices and profile (any staff). */

export const sessionKeys = {
  me: ['me'] as const,
  meta: ['meta'] as const,
  search: (q: string) => ['search', q] as const,
};

export function getMe(options?: Pick<RequestOptions<Me>, 'rawAuthErrors' | 'signal'>) {
  return api.get<Me>('/me', { schema: zMe, ...options });
}

export function getMeta(signal?: AbortSignal) {
  return api.get<Meta>('/meta', { schema: zMeta, signal });
}

export function search(q: string, signal?: AbortSignal) {
  return api.get<SearchResults>('/search', { query: { q }, schema: zSearchResults, signal });
}

export function registerDevice(body: { token: string; platform: 'android'; appVersion: string; deviceName: string }, idempotencyKey: string) {
  return api.post<{ id: string }>('/devices', body, { schema: zDeviceRegistration, idempotencyKey });
}

export function unregisterDevice(id: string) {
  return api.delete<null>(`/devices/${seg(id)}`);
}

export function updateProfile(body: { name: string | null }) {
  return api.patch<{ name: string | null }>('/profile', body, { schema: zProfileUpdate });
}

/* ------------------------------------------------------------------ */
/* Push devices (src/modules/push)                                     */
/* ------------------------------------------------------------------ */

export type PushDeviceBody = {
  /** The Expo push token (ExponentPushToken[...]). */
  token: string;
  /** Platform.OS: "android" now, "ios" with the iPhone build. */
  platform: string;
  appVersion: string;
  /** May be empty: the server stores a generic name. */
  deviceName: string;
};

/** POST /devices from any platform. One row per token: the same token answers with its existing id. */
export function registerPushDevice(body: PushDeviceBody, idempotencyKey: string) {
  return api.post<{ id: string }>('/devices', body, { schema: zDeviceRegistration, idempotencyKey });
}

/**
 * DELETE /devices/:id while signing out: a short timeout so sign-out never
 * waits long, and a 401 or 403 is left to the caller (it never ends the
 * session a second time or toasts "owner only").
 */
export function unregisterDeviceOnSignOut(id: string, timeoutMs: number) {
  return api.delete<null>(`/devices/${seg(id)}`, { timeout: timeoutMs, rawAuthErrors: true });
}
