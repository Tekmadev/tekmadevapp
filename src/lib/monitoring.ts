import * as Sentry from '@sentry/react-native';
import type { QueryClient } from '@tanstack/react-query';
import type { ComponentType } from 'react';

import { ApiError } from '@/api/errors';
import { env } from '@/lib/env';

/**
 * Crash and error reporting (Sentry): errors and crashes only. No tracing, no
 * session replay, no feedback widget, no profiling, no screenshots.
 *
 * The app shows client and lead details, so nothing personal leaves in a report:
 * no default PII, the user is only the signed-in admin's id, console breadcrumbs
 * are dropped, HTTP breadcrumbs keep only method, status and URL path, every URL
 * loses its query string (and any email in its path), and request data, cookies
 * and headers are dropped.
 *
 * Off in development, under jest, and when EXPO_PUBLIC_SENTRY_DSN is empty.
 *
 * Importing this module starts reporting (app/_layout.tsx imports it first), so a
 * crash while the rest of the app loads is still reported.
 */

type Options = Sentry.ReactNativeOptions;
type Breadcrumb = Sentry.Breadcrumb;
type ErrorEvent = Sentry.ErrorEvent;
type EventHint = Parameters<NonNullable<Options['beforeSend']>>[1];

const isJest = typeof process !== 'undefined' && process.env.JEST_WORKER_ID !== undefined;
export const monitoringEnabled = env.sentryDsn !== '' && !__DEV__ && !isJest;

/**
 * Whether an error is worth a report. Expected API answers are not: 4xx (shown
 * to the user with the server's message), offline, timeouts and cancels.
 * Server errors (5xx), invalid responses and anything that is not an ApiError
 * (a bug in the app) are.
 */
export function isReportable(error: unknown): boolean {
  if (error instanceof ApiError) return error.kind === 'invalid' || (error.kind === 'http' && error.status >= 500);
  return true;
}

/** The URL without its query string or fragment, with any email in the path replaced. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  const bare = cut === -1 ? url : url.slice(0, cut);
  return bare
    .split('/')
    .map((segment) => (/@|%40/i.test(segment) ? '[email]' : segment))
    .join('/');
}

/** Only the path of a URL (no scheme, host, query or fragment), scrubbed like scrubUrl. */
export function urlPath(url: string): string {
  return scrubUrl(url).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '') || '/';
}

/** Free text (error messages): URLs lose their query string, email addresses are replaced. */
export function scrubText(text: string): string {
  return text
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi, '$1')
    .replace(/[^\s@"'<>:/]+@[^\s@"'<>/]+\.[a-z]{2,}/gi, '[email]');
}

const HTTP_CATEGORIES = new Set(['fetch', 'xhr', 'http']);

/**
 * beforeBreadcrumb, also applied to the native breadcrumbs merged into each event:
 * console breadcrumbs are dropped (logs can hold anything), HTTP breadcrumbs keep
 * method, status and URL path only, any other URL in breadcrumb data loses its query.
 */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'console') return null;
  const data = crumb.data;
  if (crumb.type === 'http' || HTTP_CATEGORIES.has(crumb.category ?? '')) {
    const kept: Record<string, unknown> = {};
    if (typeof data?.method === 'string') kept.method = data.method;
    if (typeof data?.status_code === 'number') kept.status_code = data.status_code;
    if (typeof data?.url === 'string') kept.url = urlPath(data.url);
    return { type: crumb.type, category: crumb.category, level: crumb.level, timestamp: crumb.timestamp, data: kept };
  }
  if (!data) return crumb;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    cleaned[key] = typeof value === 'string' && /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? scrubUrl(value) : value;
  }
  return { ...crumb, data: cleaned };
}

/**
 * beforeSend: drops expected API errors that escaped as unhandled rejections, and
 * removes anything personal the SDK or the native layer attached (or an error
 * message carried: URLs with a query string, email addresses).
 */
export function scrubEvent(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (!isReportable(hint.originalException)) return null;
  if (event.message) event.message = scrubText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  if (event.request) {
    const { url, method } = event.request;
    event.request = { url: url ? scrubUrl(url) : undefined, method };
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter((crumb): crumb is Breadcrumb => crumb !== null);
  }
  if (event.user) {
    const id = event.user.id;
    event.user = id !== undefined && id !== null ? { id: String(id) } : undefined;
  }
  const device = event.contexts?.device;
  if (device && 'name' in device) delete device.name;
  return event;
}

let started = false;

/** Starts Sentry once. A no-op when monitoring is off. */
export function initMonitoring(): void {
  if (started || !monitoringEnabled) return;
  started = true;
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.apiMode === 'live' ? 'production' : 'development',
    // Release and dist: the SDK's defaults from the native app (bundle id, version, build number).
    sendDefaultPii: false,
    // Tracing off: no tracesSampleRate, so no tracing integrations and no trace headers on API calls.
    enableAutoPerformanceTracing: false,
    enableAppStartTracking: false,
    enableNativeFramesTracking: false,
    enableStallTracking: false,
    enableUserInteractionTracing: false,
    // No replay (no replay sample rates), no profiling (no profilesSampleRate), no logs.
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
    // Native iOS option (passed through to the Cocoa SDK): its own network breadcrumbs keep
    // query strings and skip our JS scrubbing in native crash reports. The JS fetch/xhr
    // breadcrumbs above already cover every request.
    ...{ enableNetworkBreadcrumbs: false },
  });
}

/** Wraps the root component (Sentry.wrap: touch breadcrumbs, no UI of its own while the feedback widget is unused). */
export function withMonitoring<P extends Record<string, unknown>>(Root: ComponentType<P>): ComponentType<P> {
  return Sentry.wrap(Root);
}

let currentUserId: string | null = null;

/** The signed-in admin's id, or null when signed out. Never the email or name. */
export function setMonitoringUser(id: string | null): void {
  if (!started || id === currentUserId) return;
  currentUserId = id;
  Sentry.setUser(id ? { id } : null);
}

/** Reports an unexpected error (see isReportable). Safe to call with any thrown value. */
export function captureError(error: unknown): void {
  if (!started || !isReportable(error)) return;
  Sentry.captureException(error);
}

/**
 * Reports failed reads that are not expected answers (5xx, unknown errors), once
 * per domain and status per app session: a broken endpoint refetched on every
 * focus would otherwise send the same report again and again.
 */
export function reportQueryErrors(client: QueryClient): void {
  if (!started) return;
  const seen = new Set<string>();
  client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'error') return;
    const error: unknown = event.action.error;
    if (!isReportable(error)) return;
    const domain = String(event.query.queryKey[0] ?? 'unknown');
    const key = `${domain} ${error instanceof ApiError ? error.status : 'app'}`;
    if (seen.has(key)) return;
    seen.add(key);
    Sentry.captureException(error, { tags: { source: 'query', query: domain } });
  });
}

initMonitoring();
