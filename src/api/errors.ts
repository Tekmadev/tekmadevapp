import type { ErrorBody } from './types';

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'aborted' | 'invalid';

/**
 * Every failed API call surfaces as an ApiError. `message` is always human copy
 * ready for a toast or an inline notice: the server's own message when it sent
 * one, otherwise a plain fallback for the status.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly kind: ApiErrorKind;

  constructor(init: { status: number; code: string; message: string; fields?: Record<string, string>; kind?: ApiErrorKind }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields;
    this.kind = init.kind ?? 'http';
  }

  /** 403 for an owner-only section (code `owner_only`); `isForbidden` covers every 403. */
  get isOwnerOnly() {
    return this.status === 403 && this.code !== 'forbidden';
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isUpgradeRequired() {
    return this.status === 426;
  }
  get isNetwork() {
    return this.kind === 'network' || this.kind === 'timeout';
  }
}

export const MESSAGES = {
  sessionEnded: 'Your session ended. Sign in again.',
  ownerOnly: 'That section is owner only.',
  forbidden: 'Your role cannot do that.',
  offline: 'You are offline',
  network: 'Could not reach the server. Check your connection.',
  timeout: 'That took too long. Nothing is lost: try again in a moment.',
  unavailable: 'Could not load this just now. Nothing is lost: try again in a moment.',
  rateLimited: 'Too many requests. Wait a moment, then try again.',
  upgrade: 'This version of the app is too old. Update to keep going.',
  notFound: 'That item no longer exists.',
  notJson: 'The app sent something the server could not read. Update the app and try again.',
  notConfigured: 'The server is missing a setting for this feature.',
  upstream: 'Stripe or Meta did not answer properly. Try again in a moment.',
  generic: 'Something went wrong. Try again.',
} as const;

/** Fallback copy per status when the server did not send a message. */
export function fallbackMessage(status: number): { code: string; message: string } {
  switch (status) {
    case 400:
      return { code: 'invalid', message: MESSAGES.generic };
    case 401:
      return { code: 'unauthorized', message: MESSAGES.sessionEnded };
    case 403:
      return { code: 'owner_only', message: MESSAGES.ownerOnly };
    case 404:
      return { code: 'not_found', message: MESSAGES.notFound };
    case 415:
      return { code: 'not_json', message: MESSAGES.notJson };
    case 426:
      return { code: 'upgrade_required', message: MESSAGES.upgrade };
    case 429:
      return { code: 'rate_limited', message: MESSAGES.rateLimited };
    case 502:
      return { code: 'upstream', message: MESSAGES.upstream };
    case 503:
      return { code: 'not_configured', message: MESSAGES.notConfigured };
    default:
      return status >= 500 ? { code: 'unavailable', message: MESSAGES.unavailable } : { code: 'error', message: MESSAGES.generic };
  }
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'string' && typeof v.message === 'string';
}

/** Keep only string messages: inline field errors are rendered as text, never as arrays or objects. */
function stringFields(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(value)) {
    if (typeof message === 'string') out[field] = message;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Turn an HTTP status and parsed body into an ApiError. Accepts the documented
 * envelope `{ ok:false, error:{ code, message, fields? } }` and falls back to
 * status-based copy for anything else (HTML error pages, empty bodies).
 * 403: `forbidden` (a role limit on one action) shows "Your role cannot do that.";
 * every other 403 (`owner_only`, `not_staff`) uses the owner-only copy.
 */
export function toApiError(status: number, body: unknown): ApiError {
  const envelope = body && typeof body === 'object' ? (body as { ok?: unknown; error?: unknown }) : undefined;
  const error = envelope && envelope.ok === false && isErrorBody(envelope.error) ? envelope.error : undefined;
  const fallback = fallbackMessage(status);
  if (status === 403) {
    const code = error?.code ?? fallback.code;
    return new ApiError({ status, code, message: code === 'forbidden' ? MESSAGES.forbidden : MESSAGES.ownerOnly });
  }
  return new ApiError({
    status,
    code: error?.code ?? fallback.code,
    message: error?.message?.trim() ? error.message : fallback.message,
    fields: stringFields(error?.fields),
  });
}

export function networkError(kind: 'network' | 'timeout' | 'aborted', offline = false): ApiError {
  if (kind === 'timeout') return new ApiError({ status: 0, code: 'timeout', message: MESSAGES.timeout, kind });
  if (kind === 'aborted') return new ApiError({ status: 0, code: 'aborted', message: 'Cancelled.', kind });
  return new ApiError({ status: 0, code: 'network', message: offline ? MESSAGES.offline : MESSAGES.network, kind });
}

/** Human copy for any thrown value (toasts, ErrorState). */
export function errorMessage(error: unknown, fallback: string = MESSAGES.generic): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return fallback;
  return fallback;
}

/** Inline field errors from a 400 response, keyed by form field. */
export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError && error.fields ? error.fields : {};
}
