import { randomUUID } from 'expo-crypto';
import { z } from 'zod';

import { env } from '@/lib/env';
import { connectivity } from '@/lib/connectivity';

import { ApiError, MESSAGES, networkError, toApiError } from './errors';
import { liveTransport } from './live';
import type { ApiRequest, ApiResponse, HttpMethod, Transport } from './types';

/**
 * The typed admin API client. Every screen talks to the server through this
 * (never to Supabase tables). It is transport agnostic: `EXPO_PUBLIC_API_MODE`
 * picks the live fetch transport or the mock adapter, with identical behaviour
 * for auth, errors and retries.
 */

export const TIMEOUTS = { read: 15_000, write: 30_000, long: 120_000 } as const;
export type TimeoutKind = keyof typeof TIMEOUTS;

/** Hooks the auth layer installs at startup (kept as a bridge to avoid import cycles). */
export type AuthBridge = {
  getAccessToken: () => Promise<string | null>;
  /** Refresh the Supabase session once; resolve the new access token or null. */
  refresh: () => Promise<string | null>;
  /** Called when a refreshed request is still 401: sign out with this message. */
  sessionEnded: (message: string) => void;
  /** Called on 403: toast "That section is owner only." and go back. */
  ownerOnly: () => void;
  /** Called on 426: block with the update screen. */
  upgradeRequired: () => void;
};

let bridge: AuthBridge = {
  getAccessToken: async () => null,
  refresh: async () => null,
  sessionEnded: () => undefined,
  ownerOnly: () => undefined,
  upgradeRequired: () => undefined,
};

export function setAuthBridge(next: Partial<AuthBridge>) {
  bridge = { ...bridge, ...next };
}

let mockTransport: Transport | undefined;
function transport(): Transport {
  if (env.apiMode === 'live') return liveTransport;
  if (!mockTransport) {
    // Loaded lazily so live builds never evaluate the fixtures.
    mockTransport = (require('./mock') as typeof import('./mock')).mockTransport;
  }
  return mockTransport;
}

export type RequestOptions<T> = {
  query?: ApiRequest['query'];
  body?: unknown;
  /** Validates the `data` payload in dev builds and logs schema drift. */
  schema?: z.ZodType<T>;
  timeout?: TimeoutKind | number;
  /** Required on every POST that creates something; reuse it when retrying the same intent. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /**
   * Leave 401/403 to the caller instead of the global session/owner handling.
   * Sign-in uses this so "not staff" shows "That account is not allowed here."
   */
  rawAuthErrors?: boolean;
};

export function newIdempotencyKey(): string {
  return randomUUID();
}

const driftSeen = new Set<string>();
function reportDrift(method: HttpMethod, path: string, error: z.ZodError) {
  const key = `${method} ${path.replace(/\/[0-9a-f-]{8,}|\/\d+/gi, '/:id')}`;
  if (driftSeen.has(key)) return;
  driftSeen.add(key);
  console.warn(`[schema drift] ${key}\n${z.prettifyError(error)}`);
}

async function send(request: ApiRequest): Promise<ApiResponse> {
  try {
    return await transport()(request);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError') throw networkError('timeout');
    if (name === 'AbortError') throw networkError(request.signal?.aborted ? 'aborted' : 'timeout');
    throw networkError('network', !connectivity.isOnline());
  }
}

export async function apiRequest<T>(method: HttpMethod, path: string, options: RequestOptions<T> = {}): Promise<T> {
  const timeoutKind: TimeoutKind = method === 'GET' ? 'read' : 'write';
  const timeoutMs = typeof options.timeout === 'number' ? options.timeout : TIMEOUTS[options.timeout ?? timeoutKind];

  const build = async (token: string | null): Promise<ApiRequest> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-App-Version': env.appVersion,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    return { method, path, query: options.query, body: options.body, headers, timeoutMs, signal: options.signal };
  };

  let response = await send(await build(await bridge.getAccessToken()));

  if (response.status === 401) {
    // Refresh once and retry once.
    const fresh = await bridge.refresh().catch(() => null);
    if (fresh) response = await send(await build(fresh));
    if (response.status === 401) {
      const error = toApiError(401, response.body);
      if (!options.rawAuthErrors) bridge.sessionEnded(MESSAGES.sessionEnded);
      throw error;
    }
  }

  if (response.status === 403) {
    if (!options.rawAuthErrors) bridge.ownerOnly();
    throw toApiError(403, response.body);
  }

  if (response.status === 426) {
    bridge.upgradeRequired();
    throw toApiError(426, response.body);
  }

  const body = response.body as { ok?: unknown; data?: unknown } | null;
  if (response.status >= 200 && response.status < 300 && body && body.ok === true) {
    const data = body.data as T;
    if (__DEV__ && options.schema) {
      const parsed = options.schema.safeParse(data);
      if (!parsed.success) reportDrift(method, path, parsed.error);
    }
    return data;
  }

  throw toApiError(response.status >= 200 && response.status < 300 ? 500 : response.status, response.body);
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions<T>, 'body' | 'idempotencyKey'>) => apiRequest<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, 'body'>) =>
    apiRequest<T>('POST', path, { ...options, body: body ?? {} }),
  patch: <T>(path: string, body: unknown, options?: Omit<RequestOptions<T>, 'body'>) =>
    apiRequest<T>('PATCH', path, { ...options, body }),
  put: <T>(path: string, body: unknown, options?: Omit<RequestOptions<T>, 'body'>) =>
    apiRequest<T>('PUT', path, { ...options, body }),
  delete: <T>(path: string, options?: Omit<RequestOptions<T>, 'body'>) => apiRequest<T>('DELETE', path, options),
};

/** Encode a path segment (ids, emails, keys). */
export const seg = (value: string | number) => encodeURIComponent(String(value));
