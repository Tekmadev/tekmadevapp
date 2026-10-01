import type { ApiResponse, Transport } from '../types';

import { mockControls } from './controls';
import { findStaffByEmail, findStaffById, MOCK_PORTAL_USER } from './fixtures/staff';
import { fail, type Latency, type MockContext, type MockRoute, type MockStaff } from './router';
import { allRoutes } from './routes';

/**
 * The mock adapter: same types, same envelope, same error codes as the live API.
 * Selected with EXPO_PUBLIC_API_MODE=mock (the default until the API is live).
 */

type Compiled = MockRoute & { segments: string[] };
let compiled: Compiled[] | undefined;
function routes(): Compiled[] {
  if (!compiled) {
    compiled = allRoutes().map((r) => ({ ...r, segments: r.path.split('/').filter(Boolean) }));
  }
  return compiled;
}

function match(method: string, path: string): { route: Compiled; params: Record<string, string> } | 'method' | undefined {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  let pathMatched = false;
  for (const route of routes()) {
    if (route.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let okMatch = true;
    for (let i = 0; i < parts.length; i++) {
      const seg = route.segments[i];
      if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
      else if (seg !== parts[i]) {
        okMatch = false;
        break;
      }
    }
    if (!okMatch) continue;
    pathMatched = true;
    if (route.method === method) return { route, params };
  }
  return pathMatched ? 'method' : undefined;
}

const LATENCY: Record<Exclude<Latency, 'long'>, [number, number]> = {
  fast: [90, 220],
  normal: [220, 650],
  slow: [600, 1300],
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(t);
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    // Already cancelled (like fetch, which rejects at once), else listen for it.
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const part = token.split('.')[1];
  if (!part) return undefined;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(globalThis.atob(padded)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

type Resolved = { staff: MockStaff } | { status: 401 | 403 };

/** Who is calling: a mock token "mock.<userId>.<expiresAtMs>" or a real Supabase JWT. */
function resolveCaller(authorization: string | undefined): Resolved {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (!token) return { status: 401 };
  if (token.startsWith('mock.')) {
    const [, userId, expires] = token.split('.');
    if (mockControls.state.expireTokens || Number(expires) < Date.now()) return { status: 401 };
    if (userId === MOCK_PORTAL_USER.id) return { status: 403 };
    const staff = findStaffById(userId);
    return staff ? { staff } : { status: 401 };
  }
  const payload = decodeJwtPayload(token);
  if (!payload) return { status: 401 };
  const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  if (exp && exp < Date.now()) return { status: 401 };
  const email = typeof payload.email === 'string' ? payload.email : '';
  const staff = findStaffByEmail(email);
  // A valid Supabase session is not enough: client portal users share the pool.
  return staff ? { staff } : { status: 403 };
}

const idempotent = new Map<string, ApiResponse>();

export const mockTransport: Transport = async (request) => {
  const controls = mockControls.state;
  const found = match(request.method, request.path);
  const route = typeof found === 'object' ? found.route : undefined;

  if (controls.offline) {
    await sleep(300, request.signal);
    throw new TypeError('Network request failed');
  }

  if (route?.latency === 'long') {
    const jobMs = route.jobMs ?? 5000;
    if (jobMs > request.timeoutMs) {
      await sleep(request.timeoutMs, request.signal);
      const e = new Error('timeout');
      e.name = 'TimeoutError';
      throw e;
    }
    await sleep(jobMs * controls.latencyScale, request.signal);
  } else {
    const [min, max] = LATENCY[route?.latency ?? 'normal'];
    await sleep((min + Math.random() * (max - min)) * controls.latencyScale, request.signal);
  }

  if (controls.minVersion && compareVersions(request.headers['X-App-Version'] ?? '0.0.0', controls.minVersion) < 0) {
    return fail(426, 'upgrade_required', 'This version of the app is too old. Update to keep going.');
  }

  if (found === undefined) return fail(404, 'not_found', `No mock route for ${request.method} ${request.path}.`);
  if (found === 'method') return fail(405, 'method', 'Method not allowed.');
  const { params } = found;
  const r = found.route;

  let staff: MockStaff | undefined;
  if (r.auth !== false) {
    const caller = resolveCaller(request.headers.Authorization);
    if ('status' in caller) {
      return caller.status === 401
        ? fail(401, 'unauthorized', 'Sign in again.')
        : fail(403, 'not_staff', 'That account is not allowed here.');
    }
    staff = caller.staff;
  }
  const user = staff ?? { id: 'anon', email: '', name: null, role: 'manager' as const, locked: false };

  if (r.ownerOnly && user.role !== 'owner') return fail(403, 'owner_only', 'That section is owner only.');

  const failure = controls.failNext.find((f) => request.path.startsWith(f.pathPrefix));
  if (failure || controls.failAll) {
    if (failure) mockControls.consumeFailure(failure);
    const status = failure?.status ?? 500;
    return fail(status, status === 503 ? 'not_configured' : 'unavailable', 'Could not load this just now. Nothing is lost: try again in a moment.');
  }

  const idemKey = request.headers['Idempotency-Key'];
  const idemId = idemKey ? `${user.id}:${request.method}:${request.path}:${idemKey}` : undefined;
  if (idemId && idempotent.has(idemId)) return idempotent.get(idemId)!;

  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') query[k] = String(v);
  }
  const ctx: MockContext = {
    method: request.method,
    path: request.path,
    params,
    query,
    body: request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {},
    headers: request.headers,
    user,
    role: user.role,
    isOwner: user.role === 'owner',
  };

  let result: ApiResponse;
  try {
    // Deep-copy so screens can never mutate the fixture database by reference.
    const raw = await r.handler(ctx);
    result = { status: raw.status, body: raw.body === undefined ? null : JSON.parse(JSON.stringify(raw.body)) };
  } catch (e) {
    if (__DEV__) console.warn(`[mock] ${request.method} ${request.path} threw`, e);
    result = fail(500, 'unavailable', 'Could not load this just now. Nothing is lost: try again in a moment.');
  }
  if (idemId && result.status < 500) idempotent.set(idemId, result);
  return result;
};

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
