import { env } from '@/lib/env';

import type { ApiRequest, ApiResponse, Transport } from './types';

export function buildUrl(base: string, path: string, query?: ApiRequest['query']): string {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `${url}?${parts.join('&')}` : url;
}

/** fetch() against https://www.tekmadev.com/api/admin/v1 with a hard timeout. */
export const liveTransport: Transport = async (request) => {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs);
  const onAbort = () => controller.abort();
  request.signal?.addEventListener('abort', onAbort);
  // Cancelled while the access token was being read: the abort event has already fired.
  if (request.signal?.aborted) controller.abort();

  try {
    const response = await fetch(buildUrl(env.apiBase, request.path, request.query), {
      method: request.method,
      headers: request.headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: response.status, body } satisfies ApiResponse;
  } catch (e) {
    if (timedOut) {
      const error = new Error('timeout');
      error.name = 'TimeoutError';
      throw error;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onAbort);
  }
};
