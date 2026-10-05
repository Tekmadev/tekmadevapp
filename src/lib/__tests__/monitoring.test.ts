import { ApiError, networkError } from '@/api/errors';
import { isReportable, monitoringEnabled, scrubBreadcrumb, scrubEvent, scrubText, scrubUrl, urlPath } from '@/lib/monitoring';

type Event = Parameters<typeof scrubEvent>[0];

describe('monitoring', () => {
  it('is off under jest', () => {
    expect(monitoringEnabled).toBe(false);
  });

  it('reports server errors and bugs, never expected API answers', () => {
    expect(isReportable(new ApiError({ status: 500, code: 'unavailable', message: 'x' }))).toBe(true);
    expect(isReportable(new ApiError({ status: 502, code: 'upstream', message: 'x' }))).toBe(true);
    expect(isReportable(new ApiError({ status: 0, code: 'invalid', message: 'x', kind: 'invalid' }))).toBe(true);
    expect(isReportable(new TypeError('undefined is not a function'))).toBe(true);
    expect(isReportable('thrown string')).toBe(true);
    for (const status of [400, 401, 403, 404, 409, 426, 429]) {
      expect(isReportable(new ApiError({ status, code: 'x', message: 'x' }))).toBe(false);
    }
    expect(isReportable(networkError('network'))).toBe(false);
    expect(isReportable(networkError('timeout'))).toBe(false);
    expect(isReportable(networkError('aborted'))).toBe(false);
  });

  it('strips query strings, fragments and emails from URLs', () => {
    expect(scrubUrl('https://www.tekmadev.com/api/admin/v1/search?q=Jane%20Doe#top')).toBe('https://www.tekmadev.com/api/admin/v1/search');
    expect(scrubUrl('https://www.tekmadev.com/api/admin/v1/team/jane%40example.com')).toBe('https://www.tekmadev.com/api/admin/v1/team/[email]');
    expect(urlPath('https://x.supabase.co/auth/v1/token?grant_type=refresh_token')).toBe('/auth/v1/token');
    expect(urlPath('https://www.tekmadev.com')).toBe('/');
    expect(urlPath('/api/admin/v1/clients?page=2')).toBe('/api/admin/v1/clients');
  });

  it('scrubs URLs and emails out of error messages', () => {
    expect(scrubText('GET https://www.tekmadev.com/api/admin/v1/search?q=Jane failed')).toBe('GET https://www.tekmadev.com/api/admin/v1/search failed');
    expect(scrubText('Could not email jane.doe+x@example.co.uk today')).toBe('Could not email [email] today');
    expect(scrubText("undefined is not an object (evaluating 'a.b')")).toBe("undefined is not an object (evaluating 'a.b')");
  });

  it('drops console breadcrumbs and keeps only method, status and path for HTTP ones', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'Jane Doe jane@example.com' })).toBeNull();
    const http = scrubBreadcrumb({
      type: 'http',
      category: 'xhr',
      data: {
        method: 'POST',
        url: 'https://www.tekmadev.com/api/admin/v1/leads?email=jane%40example.com',
        status_code: 500,
        request_body_size: 120,
        body: '{"name":"Jane Doe"}',
      },
    });
    expect(http?.data).toEqual({ method: 'POST', status_code: 500, url: '/api/admin/v1/leads' });
    const native = scrubBreadcrumb({
      type: 'http',
      category: 'http',
      data: { url: 'https://www.tekmadev.com/api/admin/v1/search', 'http.query': 'q=Jane', method: 'GET', status_code: 200 },
    });
    expect(native?.data).toEqual({ method: 'GET', status_code: 200, url: '/api/admin/v1/search' });
    const touch = scrubBreadcrumb({ category: 'touch', message: 'Touch event within element: PressableScale' });
    expect(touch?.message).toBe('Touch event within element: PressableScale');
  });

  it('scrubs events and drops expected API errors that escaped', () => {
    const event: Event = {
      type: undefined,
      request: {
        url: 'https://www.tekmadev.com/admin/clients?q=Jane',
        method: 'GET',
        headers: { Authorization: 'Bearer secret' },
        cookies: { sb: 'token' },
        data: { name: 'Jane' },
        query_string: 'q=Jane',
      },
      user: { id: 'u_1', email: 'jane@example.com', username: 'Jane', ip_address: '1.2.3.4' },
      breadcrumbs: [
        { category: 'console', message: 'secret' },
        { type: 'http', category: 'fetch', data: { method: 'GET', url: 'https://x.test/a?b=c', status_code: 200 } },
      ],
      contexts: { device: { name: "Jane's phone", model: 'Pixel' } },
      exception: { values: [{ type: 'Error', value: 'Upload for jane@example.com to https://x.test/u?token=abc failed' }] },
    };
    const out = scrubEvent(event, { originalException: new Error('boom') });
    expect(out?.request).toEqual({ url: 'https://www.tekmadev.com/admin/clients', method: 'GET' });
    expect(out?.user).toEqual({ id: 'u_1' });
    expect(out?.breadcrumbs).toEqual([{ type: 'http', category: 'fetch', data: { method: 'GET', url: '/a', status_code: 200 } }]);
    expect(out?.contexts?.device).toEqual({ model: 'Pixel' });
    expect(out?.exception?.values?.[0]?.value).toBe('Upload for [email] to https://x.test/u failed');

    const expected = new ApiError({ status: 404, code: 'not_found', message: 'That item no longer exists.' });
    expect(scrubEvent({ type: undefined }, { originalException: expected })).toBeNull();
  });
});
