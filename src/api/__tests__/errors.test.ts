import { ApiError, errorMessage, fallbackMessage, fieldErrors, MESSAGES, networkError, toApiError } from '@/api/errors';

const envelope = (code: string, message: string, fields?: Record<string, string>) => ({
  ok: false,
  error: fields ? { code, message, fields } : { code, message },
});

describe('toApiError with the documented envelope', () => {
  it('passes the server code and message through (ready for a toast)', () => {
    const e = toApiError(422, envelope('care_required', 'This client has no Webline Care plan yet.'));
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ApiError');
    expect(e.status).toBe(422);
    expect(e.code).toBe('care_required');
    expect(e.message).toBe('This client has no Webline Care plan yet.');
    expect(e.kind).toBe('http');
    expect(e.fields).toBeUndefined();
  });

  it('passes field errors through for inline form errors', () => {
    const e = toApiError(
      400,
      envelope('required', 'Business name and a valid email are required.', {
        businessName: 'Enter a business name.',
        email: 'Enter a valid email.',
      }),
    );
    expect(e.code).toBe('required');
    expect(e.message).toBe('Business name and a valid email are required.');
    expect(e.fields).toEqual({ businessName: 'Enter a business name.', email: 'Enter a valid email.' });
  });

  it.each([
    [409, 'slug_taken', 'That slug is already used by another post (including one in the trash).'],
    [409, 'dupe', 'A coupon with that code already exists. Pick a different code.'],
    [502, 'stripe', 'The Stripe sync failed. The price was saved; Stripe was not updated.'],
    [503, 'nostripe', "Stripe is not configured, so coupons can't be created."],
    [429, 'rate_limited', 'Slow down: try again in a minute.'],
    [404, 'not_found', 'That client no longer exists.'],
  ])('%d %s keeps the server message', (status, code, message) => {
    const e = toApiError(status, envelope(code, message));
    expect(e.status).toBe(status);
    expect(e.code).toBe(code);
    expect(e.message).toBe(message);
  });

  it('uses the fallback copy when the server message is blank, but keeps its code', () => {
    const e = toApiError(500, envelope('db', '   '));
    expect(e.code).toBe('db');
    expect(e.message).toBe(MESSAGES.unavailable);
  });

  it('ignores an envelope that does not say ok:false', () => {
    const e = toApiError(500, { ok: true, error: { code: 'x', message: 'Nope' } });
    expect(e.code).toBe('unavailable');
    expect(e.message).toBe(MESSAGES.unavailable);
  });

  it('ignores a malformed error object', () => {
    expect(toApiError(400, { ok: false, error: { code: 'x' } }).message).toBe(MESSAGES.generic);
    expect(toApiError(400, { ok: false, error: { message: 'Hi' } }).code).toBe('invalid');
    expect(toApiError(400, { ok: false, error: 'bad' }).code).toBe('invalid');
    expect(toApiError(400, { ok: false, error: { code: 1, message: 2 } }).message).toBe(MESSAGES.generic);
  });
});

describe('toApiError: 403 is always owner only', () => {
  it('uses the owner-only copy whatever the server said', () => {
    const e = toApiError(403, envelope('not_staff', 'That account is not allowed here.'));
    expect(e.status).toBe(403);
    expect(e.code).toBe('not_staff');
    expect(e.message).toBe('That section is owner only.');
    expect(e.isOwnerOnly).toBe(true);
  });

  it('uses the owner-only copy with no body at all', () => {
    const e = toApiError(403, null);
    expect(e.code).toBe('owner_only');
    expect(e.message).toBe('That section is owner only.');
  });

  it('drops fields on a 403', () => {
    expect(toApiError(403, envelope('owner_only', 'x', { a: 'b' })).fields).toBeUndefined();
  });
});

describe('toApiError with empty or non-JSON bodies', () => {
  const html = '<!doctype html><html><body><h1>502 Bad Gateway</h1></body></html>';

  it.each([null, undefined, '', html, 42, [], { message: 'raw' }])('falls back to status copy for %j', (body) => {
    const e = toApiError(502, body);
    expect(e.code).toBe('upstream');
    expect(e.message).toBe(MESSAGES.upstream);
    expect(e.fields).toBeUndefined();
  });
});

describe('fallback copy for every status', () => {
  it.each([
    [400, 'invalid', MESSAGES.generic],
    [401, 'unauthorized', 'Your session ended. Sign in again.'],
    [403, 'owner_only', 'That section is owner only.'],
    [404, 'not_found', MESSAGES.notFound],
    [409, 'error', MESSAGES.generic],
    [415, 'not_json', MESSAGES.notJson],
    [422, 'error', MESSAGES.generic],
    [426, 'upgrade_required', MESSAGES.upgrade],
    [429, 'rate_limited', MESSAGES.rateLimited],
    [500, 'unavailable', 'Could not load this just now. Nothing is lost: try again in a moment.'],
    [502, 'upstream', MESSAGES.upstream],
    [503, 'not_configured', 'The server is missing a setting for this feature.'],
    [504, 'unavailable', MESSAGES.unavailable],
    [418, 'error', MESSAGES.generic],
  ])('%d → %s', (status, code, message) => {
    expect(fallbackMessage(status)).toEqual({ code, message });
    const e = toApiError(status, null);
    expect(e.status).toBe(status);
    expect(e.code).toBe(code);
    expect(e.message).toBe(message);
    expect(e.kind).toBe('http');
  });

  it('flags the statuses the client handles globally', () => {
    expect(toApiError(401, null).isUnauthorized).toBe(true);
    expect(toApiError(403, null).isOwnerOnly).toBe(true);
    expect(toApiError(426, null).isUpgradeRequired).toBe(true);
    const plain = toApiError(500, null);
    expect([plain.isUnauthorized, plain.isOwnerOnly, plain.isUpgradeRequired, plain.isNetwork]).toEqual([false, false, false, false]);
  });

  it('every fallback message is plain copy with no dashes', () => {
    for (const message of Object.values(MESSAGES)) {
      expect(message).not.toMatch(/[\u2013\u2014]/);
      expect(message.trim()).toBe(message);
    }
  });
});

describe('networkError', () => {
  it('network: could not reach the server', () => {
    const e = networkError('network');
    expect(e.kind).toBe('network');
    expect(e.status).toBe(0);
    expect(e.code).toBe('network');
    expect(e.message).toBe(MESSAGES.network);
    expect(e.isNetwork).toBe(true);
  });

  it('network while offline says so', () => {
    const e = networkError('network', true);
    expect(e.message).toBe('You are offline');
    expect(e.kind).toBe('network');
  });

  it('timeout', () => {
    const e = networkError('timeout');
    expect(e.kind).toBe('timeout');
    expect(e.code).toBe('timeout');
    expect(e.message).toBe(MESSAGES.timeout);
    expect(e.isNetwork).toBe(true);
  });

  it('aborted (the user cancelled)', () => {
    const e = networkError('aborted');
    expect(e.kind).toBe('aborted');
    expect(e.code).toBe('aborted');
    expect(e.isNetwork).toBe(false);
  });
});

describe('errorMessage', () => {
  it('uses the ApiError message', () => {
    expect(errorMessage(toApiError(400, envelope('percent', 'Percent off must be between 1 and 100.')))).toBe(
      'Percent off must be between 1 and 100.',
    );
    expect(errorMessage(networkError('network', true))).toBe('You are offline');
  });

  it('never shows raw JavaScript errors to the owner', () => {
    expect(errorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(MESSAGES.generic);
    expect(errorMessage(new Error('boom'), 'Could not save.')).toBe('Could not save.');
  });

  it('handles anything thrown', () => {
    expect(errorMessage('a string')).toBe(MESSAGES.generic);
    expect(errorMessage(undefined)).toBe(MESSAGES.generic);
    expect(errorMessage(null, 'Try again.')).toBe('Try again.');
  });
});

describe('fieldErrors', () => {
  it('returns the field map from a validation error', () => {
    const e = toApiError(400, envelope('email', 'Enter a valid email.', { email: 'Enter a valid email.' }));
    expect(fieldErrors(e)).toEqual({ email: 'Enter a valid email.' });
  });

  it('is empty when there are none', () => {
    expect(fieldErrors(toApiError(500, null))).toEqual({});
    expect(fieldErrors(new Error('x'))).toEqual({});
    expect(fieldErrors(undefined)).toEqual({});
  });

  it('keeps only string messages when the server sends something odd', () => {
    const odd = { ok: false, error: { code: 'input', message: 'Enter valid, non-negative numbers.', fields: { monthly: 'Too low.', setup: ['x'], trial: null } } };
    expect(fieldErrors(toApiError(400, odd))).toEqual({ monthly: 'Too low.' });
    const notAMap = { ok: false, error: { code: 'input', message: 'Enter valid, non-negative numbers.', fields: 'monthly' } };
    expect(fieldErrors(toApiError(400, notAMap))).toEqual({});
    const nullFields = { ok: false, error: { code: 'input', message: 'Enter valid, non-negative numbers.', fields: null } };
    expect(fieldErrors(toApiError(400, nullFields))).toEqual({});
  });
});
