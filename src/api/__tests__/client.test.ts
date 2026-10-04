import { z } from 'zod';

import { api, apiRequest, seg, setAuthBridge, TIMEOUTS, type AuthBridge } from '@/api/client';
import { ApiError, MESSAGES } from '@/api/errors';
import { mockTransport } from '@/api/mock';
import type { ApiRequest, ApiResponse } from '@/api/types';
import { env } from '@/lib/env';
import { useConnectivity } from '@/lib/connectivity';

// A controllable transport in place of the mock adapter (the client picks it in mock mode).
jest.mock('@/api/mock', () => ({ mockTransport: jest.fn() }));

const transport = jest.mocked(mockTransport);

const okBody = <T>(data: T): ApiResponse => ({ status: 200, body: { ok: true, data } });
const failBody = (status: number, code: string, message: string, fields?: Record<string, string>): ApiResponse => ({
  status,
  body: { ok: false, error: fields ? { code, message, fields } : { code, message } },
});

/** Answer each call with the next response (or throw it when it is an Error). */
function respond(...responses: (ApiResponse | Error)[]) {
  for (const r of responses) {
    transport.mockImplementationOnce(async () => {
      if (r instanceof Error) throw r;
      return r;
    });
  }
}

const sent = (i = 0): ApiRequest => {
  const call = transport.mock.calls[i];
  if (!call) throw new Error(`no request #${i}`);
  return call[0];
};

/** Run a request that must fail and return its ApiError. */
async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('expected the request to fail');
}

let bridge: { [K in keyof AuthBridge]: jest.MockedFunction<AuthBridge[K]> };

beforeEach(() => {
  transport.mockReset();
  bridge = {
    getAccessToken: jest.fn<Promise<string | null>, []>(async () => 'token-1'),
    refresh: jest.fn<Promise<string | null>, []>(async () => 'token-2'),
    sessionEnded: jest.fn<void, [string]>(),
    ownerOnly: jest.fn<void, [string]>(),
    upgradeRequired: jest.fn<void, []>(),
  };
  setAuthBridge(bridge);
  useConnectivity.setState({ online: true, simulatedOffline: false });
});

describe('apiRequest: success', () => {
  it('unwraps { ok: true, data }', async () => {
    respond(okBody({ id: 'cl_1', businessName: 'Acme Plumbing' }));
    await expect(apiRequest('GET', '/clients/cl_1')).resolves.toEqual({ id: 'cl_1', businessName: 'Acme Plumbing' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('accepts 201 and null data', async () => {
    respond({ status: 201, body: { ok: true, data: null } });
    await expect(apiRequest('POST', '/notifications/read', { body: { ids: ['n1'] } })).resolves.toBeNull();
  });

  it('sends the method, path, query and body as given', async () => {
    respond(okBody([]));
    await apiRequest('GET', '/leads', { query: { q: 'acme', cursor: 'c1.u.2k', limit: 30 } });
    expect(sent()).toMatchObject({ method: 'GET', path: '/leads', query: { q: 'acme', cursor: 'c1.u.2k', limit: 30 } });
    expect(sent().body).toBeUndefined();
  });
});

describe('apiRequest: headers', () => {
  it('sends Authorization, X-App-Version and Accept on every request', async () => {
    respond(okBody({}));
    await apiRequest('GET', '/me');
    expect(sent().headers).toEqual({
      Accept: 'application/json',
      'X-App-Version': env.appVersion,
      Authorization: 'Bearer token-1',
    });
    expect(env.appVersion).toBe('0.1.0');
  });

  it('adds Content-Type only when there is a JSON body', async () => {
    respond(okBody({}), okBody({}));
    await apiRequest('PATCH', '/profile', { body: { name: 'Shajeed I.' } });
    expect(sent(0).headers['Content-Type']).toBe('application/json');
    expect(sent(0).body).toEqual({ name: 'Shajeed I.' });
    await apiRequest('DELETE', '/links/ln_1');
    expect(sent(1).headers['Content-Type']).toBeUndefined();
  });

  it('sends the Idempotency-Key when one is passed, and only then', async () => {
    respond(okBody({}), okBody({}));
    await apiRequest('POST', '/coupons', { body: { code: 'STARTUP50' }, idempotencyKey: '6f1c2a3b-0000-4000-8000-000000000001' });
    expect(sent(0).headers['Idempotency-Key']).toBe('6f1c2a3b-0000-4000-8000-000000000001');
    await apiRequest('POST', '/coupons/cp_1/disable');
    expect(sent(1).headers['Idempotency-Key']).toBeUndefined();
  });

  it('reuses the same Idempotency-Key on the retry after a refresh', async () => {
    respond(failBody(401, 'unauthorized', 'Sign in again.'), okBody({ id: 'cp_1' }));
    await apiRequest('POST', '/coupons', { body: {}, idempotencyKey: 'key-1' });
    expect(sent(0).headers['Idempotency-Key']).toBe('key-1');
    expect(sent(1).headers['Idempotency-Key']).toBe('key-1');
  });

  it('omits Authorization when signed out', async () => {
    bridge.getAccessToken.mockResolvedValueOnce(null);
    respond(okBody({}));
    await apiRequest('GET', '/meta');
    expect(sent().headers.Authorization).toBeUndefined();
  });
});

describe('apiRequest: timeouts', () => {
  it('uses 15s for reads, 30s for writes, 120s for long jobs', async () => {
    respond(okBody({}), okBody({}), okBody({}), okBody({}));
    await apiRequest('GET', '/overview');
    await apiRequest('POST', '/links', { body: {} });
    await apiRequest('POST', '/ads/refresh', { timeout: 'long' });
    await apiRequest('GET', '/crm/inspect', { timeout: 5000 });
    expect(transport.mock.calls.map(([r]) => r.timeoutMs)).toEqual([TIMEOUTS.read, TIMEOUTS.write, TIMEOUTS.long, 5000]);
    expect(TIMEOUTS).toEqual({ read: 15_000, write: 30_000, long: 120_000 });
  });
});

describe('apiRequest: 401', () => {
  it('refreshes once and retries once with the new token', async () => {
    respond(failBody(401, 'unauthorized', 'Sign in again.'), okBody({ unread: 3 }));
    await expect(apiRequest('GET', '/notifications/summary')).resolves.toEqual({ unread: 3 });
    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(sent(0).headers.Authorization).toBe('Bearer token-1');
    expect(sent(1).headers.Authorization).toBe('Bearer token-2');
    expect(bridge.sessionEnded).not.toHaveBeenCalled();
  });

  it('signs out with "Your session ended. Sign in again." when the retry is still 401', async () => {
    respond(failBody(401, 'unauthorized', 'Sign in again.'), failBody(401, 'unauthorized', 'Sign in again.'));
    const e = await failure(apiRequest('GET', '/me'));
    expect(e.status).toBe(401);
    expect(e.isUnauthorized).toBe(true);
    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(bridge.sessionEnded).toHaveBeenCalledTimes(1);
    expect(bridge.sessionEnded).toHaveBeenCalledWith('Your session ended. Sign in again.');
    expect(MESSAGES.sessionEnded).toBe('Your session ended. Sign in again.');
  });

  it('signs out without a retry when the refresh fails', async () => {
    bridge.refresh.mockResolvedValueOnce(null);
    respond(failBody(401, 'unauthorized', 'Sign in again.'));
    await failure(apiRequest('GET', '/me'));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(bridge.sessionEnded).toHaveBeenCalledWith(MESSAGES.sessionEnded);
  });

  it('treats a refresh that throws like a failed refresh', async () => {
    bridge.refresh.mockRejectedValueOnce(new Error('refresh token revoked'));
    respond(failBody(401, 'unauthorized', 'Sign in again.'));
    const e = await failure(apiRequest('GET', '/me'));
    expect(e.status).toBe(401);
    expect(bridge.sessionEnded).toHaveBeenCalledTimes(1);
  });

  it('rawAuthErrors leaves the 401 to the caller (sign-in)', async () => {
    respond(failBody(401, 'unauthorized', 'Sign in again.'), failBody(401, 'unauthorized', 'Sign in again.'));
    const e = await failure(apiRequest('GET', '/me', { rawAuthErrors: true }));
    expect(e.status).toBe(401);
    expect(bridge.sessionEnded).not.toHaveBeenCalled();
  });
});

describe('apiRequest: 403', () => {
  it('calls ownerOnly and throws the owner-only copy', async () => {
    respond(failBody(403, 'owner_only', 'That section is owner only.'));
    const e = await failure(apiRequest('GET', '/pricing'));
    expect(e.status).toBe(403);
    expect(e.isOwnerOnly).toBe(true);
    expect(e.message).toBe('That section is owner only.');
    expect(bridge.ownerOnly).toHaveBeenCalledTimes(1);
    expect(bridge.ownerOnly).toHaveBeenCalledWith('owner_only');
    expect(bridge.refresh).not.toHaveBeenCalled();
  });

  it('a role limit (forbidden) keeps its own copy and tells the bridge its code', async () => {
    respond(failBody(403, 'forbidden', 'Your role cannot do that.'));
    const e = await failure(apiRequest('DELETE', '/leads/ld_1'));
    expect(e.status).toBe(403);
    expect(e.isForbidden).toBe(true);
    expect(e.isOwnerOnly).toBe(false);
    expect(e.message).toBe('Your role cannot do that.');
    expect(bridge.ownerOnly).toHaveBeenCalledWith('forbidden');
  });

  it('rawAuthErrors skips the bridge and keeps the server code (sign-in shows its own copy)', async () => {
    respond(failBody(403, 'not_staff', 'That account is not allowed here.'));
    const e = await failure(apiRequest('GET', '/me', { rawAuthErrors: true }));
    expect(e.status).toBe(403);
    expect(e.code).toBe('not_staff');
    expect(bridge.ownerOnly).not.toHaveBeenCalled();
  });
});

describe('apiRequest: 426', () => {
  it('calls upgradeRequired', async () => {
    respond(failBody(426, 'upgrade_required', 'This version of the app is too old. Update to keep going.'));
    const e = await failure(apiRequest('GET', '/me'));
    expect(e.isUpgradeRequired).toBe(true);
    expect(e.message).toBe('This version of the app is too old. Update to keep going.');
    expect(bridge.upgradeRequired).toHaveBeenCalledTimes(1);
    expect(bridge.ownerOnly).not.toHaveBeenCalled();
    expect(bridge.sessionEnded).not.toHaveBeenCalled();
  });

  it('also blocks after a refresh retry lands on 426', async () => {
    respond(failBody(401, 'unauthorized', 'Sign in again.'), failBody(426, 'upgrade_required', 'Update.'));
    await failure(apiRequest('GET', '/me'));
    expect(bridge.upgradeRequired).toHaveBeenCalledTimes(1);
    expect(bridge.sessionEnded).not.toHaveBeenCalled();
  });
});

describe('apiRequest: other failures', () => {
  it('passes business errors and field errors through without global handling', async () => {
    respond(failBody(400, 'required', 'Business name and a valid email are required.', { email: 'Enter a valid email.' }));
    const e = await failure(apiRequest('POST', '/clients', { body: {} }));
    expect(e).toMatchObject({ status: 400, code: 'required', message: 'Business name and a valid email are required.' });
    expect(e.fields).toEqual({ email: 'Enter a valid email.' });
    expect(bridge.ownerOnly).not.toHaveBeenCalled();
    expect(bridge.sessionEnded).not.toHaveBeenCalled();
    expect(bridge.upgradeRequired).not.toHaveBeenCalled();
  });

  it('maps an HTML error page to the status copy', async () => {
    respond({ status: 502, body: null });
    const e = await failure(apiRequest('POST', '/ads/refresh'));
    expect(e).toMatchObject({ status: 502, code: 'upstream', message: MESSAGES.upstream });
  });

  it('treats a 2xx without the success envelope as a server failure, never as data', async () => {
    respond({ status: 200, body: null }, { status: 200, body: { items: [] } }, failBody(200, 'db', 'Could not save.'));
    for (let i = 0; i < 3; i++) {
      const e = await failure(apiRequest('GET', '/clients'));
      expect(e.status).toBe(500);
    }
    expect(transport).toHaveBeenCalledTimes(3);
  });
});

describe('apiRequest: transport failures', () => {
  it('maps a network failure to an ApiError of kind network', async () => {
    respond(new TypeError('Network request failed'));
    const e = await failure(apiRequest('GET', '/overview'));
    expect(e.kind).toBe('network');
    expect(e.status).toBe(0);
    expect(e.isNetwork).toBe(true);
    expect(e.message).toBe(MESSAGES.network);
  });

  it('says "You are offline" when the phone is offline', async () => {
    useConnectivity.setState({ online: false });
    respond(new TypeError('Network request failed'));
    const e = await failure(apiRequest('GET', '/overview'));
    expect(e.kind).toBe('network');
    expect(e.message).toBe('You are offline');
  });

  it('maps a timeout', async () => {
    const timeout = new Error('timeout');
    timeout.name = 'TimeoutError';
    respond(timeout);
    const e = await failure(apiRequest('GET', '/overview'));
    expect(e.kind).toBe('timeout');
    expect(e.message).toBe(MESSAGES.timeout);
  });

  it('maps an abort by the caller to aborted, and any other abort to timeout', async () => {
    const abortError = () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return err;
    };
    const controller = new AbortController();
    controller.abort();
    respond(abortError(), abortError());
    expect((await failure(apiRequest('GET', '/overview', { signal: controller.signal }))).kind).toBe('aborted');
    expect((await failure(apiRequest('GET', '/overview'))).kind).toBe('timeout');
  });

  it('passes an ApiError from the transport through unchanged', async () => {
    const original = new ApiError({ status: 0, code: 'custom', message: 'Custom.', kind: 'network' });
    respond(original);
    await expect(apiRequest('GET', '/overview')).rejects.toBe(original);
  });
});

describe('apiRequest: schema drift (dev builds)', () => {
  it('logs drift once per endpoint and still returns the data', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const schema = z.object({ unread: z.number() });
    respond(okBody({ unread: 'three' }), okBody({ unread: 'four' }), okBody({ unread: 5 }));
    await expect(apiRequest('GET', '/drift-check', { schema })).resolves.toEqual({ unread: 'three' });
    await expect(apiRequest('GET', '/drift-check', { schema })).resolves.toEqual({ unread: 'four' });
    await expect(apiRequest('GET', '/drift-check', { schema })).resolves.toEqual({ unread: 5 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('[schema drift] GET /drift-check');
    warn.mockRestore();
  });
});

describe('api helpers', () => {
  it('post sends an empty object when there is no body, so Content-Type is JSON', async () => {
    respond(okBody({}));
    await api.post('/crm/sync', undefined, { timeout: 'long' });
    expect(sent()).toMatchObject({ method: 'POST', path: '/crm/sync', body: {}, timeoutMs: TIMEOUTS.long });
    expect(sent().headers['Content-Type']).toBe('application/json');
  });

  it('get, patch, put and delete use their methods', async () => {
    respond(okBody({}), okBody({}), okBody({}), okBody({}));
    await api.get('/team');
    await api.patch('/profile', { name: 'Shajeed I.' });
    await api.put('/settings/loader', { reset: true });
    await api.delete('/team/a%40b.com');
    expect(transport.mock.calls.map(([r]) => `${r.method} ${r.path}`)).toEqual([
      'GET /team',
      'PATCH /profile',
      'PUT /settings/loader',
      'DELETE /team/a%40b.com',
    ]);
  });

  it('seg encodes path segments', () => {
    expect(seg('a@b.com')).toBe('a%40b.com');
    expect(seg('x/y z')).toBe('x%2Fy%20z');
    expect(seg(42)).toBe('42');
  });
});
