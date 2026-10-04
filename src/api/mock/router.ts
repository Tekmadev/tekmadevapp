import { addDays, todayToronto } from '@/lib/dates';

import type { HttpMethod, Page, Role } from '../types';

/**
 * Mock adapter building blocks. Each domain file in `routes/` exports a list of
 * MockRoute objects; `index.ts` matches requests against all of them.
 *
 * Mock handlers must behave like the real server contract (section 11):
 * same envelope, same status codes, same error codes and messages, the same
 * capability checks (403 `owner_only` or `forbidden`, see ./permissions.ts),
 * cursors that must be passed back verbatim, and
 * mutations that return the full updated entity and change the in-memory data so
 * lists and details stay consistent.
 */

export type MockStaff = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  /** Owners set by the server environment cannot be removed. */
  locked: boolean;
};

export type MockContext = {
  method: HttpMethod;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  /** Parsed JSON body (unknown shape: validate what you read). */
  body: Record<string, unknown>;
  headers: Record<string, string>;
  /** The caller. What they may do is decided per route with requireCap (./permissions.ts), never by role. */
  user: MockStaff;
};

export type MockResult = { status: number; body: unknown };

/** fast ~150ms, normal ~400ms, slow ~900ms, long: a server job (several seconds). */
export type Latency = 'fast' | 'normal' | 'slow' | 'long';

export type MockRoute = {
  method: HttpMethod;
  /** Path pattern below the API base, e.g. "/clients/:id/calls". */
  path: string;
  /** Set false only for routes that work without a session (none in v1). */
  auth?: boolean;
  latency?: Latency;
  /** For `long` jobs: how long the fake job runs, in ms (default 5000). */
  jobMs?: number;
  handler: (ctx: MockContext) => MockResult | Promise<MockResult>;
};

export const ok = <T>(data: T, status = 200): MockResult => ({ status, body: { ok: true, data } });

export const fail = (status: number, code: string, message: string, fields?: Record<string, string>): MockResult => ({
  status,
  body: { ok: false, error: fields ? { code, message, fields } : { code, message } },
});

export const notFound = (what = 'That item') => fail(404, 'not_found', `${what} no longer exists.`);

/** Opaque mock cursor. Clients must pass it back exactly; never parse it in the app. */
const encodeCursor = (offset: number) => `c1.${offset.toString(36)}.${(offset * 7919).toString(36)}`;
const decodeCursor = (cursor: string | undefined): number => {
  if (!cursor) return 0;
  const parts = cursor.split('.');
  const offset = parts.length === 3 ? parseInt(parts[1], 36) : NaN;
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
};

/** `?cursor=&limit=` paging (default 30, max 100) over an already sorted array. */
export function paginate<T>(items: T[], query: Record<string, string>, defaultLimit = 30): Page<T> {
  const limit = Math.min(Math.max(parseInt(query.limit ?? '', 10) || defaultLimit, 1), 100);
  const offset = decodeCursor(query.cursor);
  const slice = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? encodeCursor(offset + limit) : null;
  return { items: slice, nextCursor: next };
}

/** Case-insensitive "contains" across a few fields (server-side search in the mock). */
export function matches(q: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(needle));
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
export function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
export function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
export const isEmail = (value: string | undefined) => !!value && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

let idCounter = 0;
/** Stable-looking ids: "cl_8f3a2c..." */
export function mockId(prefix: string): string {
  idCounter += 1;
  const rand = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${rand}${idCounter.toString(16).padStart(4, '0')}`;
}
export function mockUuid(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const s = (n: number) => Array.from({ length: n }, hex).join('');
  return `${s(8)}-${s(4)}-4${s(3)}-a${s(3)}-${s(12)}`;
}

/**
 * Instants with microsecond precision, like the server
 * (e.g. "2026-09-30T14:03:22.123456Z"). The app must never round-trip these
 * through a JS Date when sending them back.
 */
export function isoMicros(date: Date): string {
  const base = date.toISOString().slice(0, 19);
  const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
  const micro = ((date.getTime() * 7) % 1000).toString().padStart(3, '0');
  return `${base}.${ms}${micro}Z`;
}

export const nowIso = () => isoMicros(new Date());
export const minutesAgo = (m: number) => isoMicros(new Date(Date.now() - m * 60_000));
export const hoursAgo = (h: number) => minutesAgo(h * 60);
export const daysAgo = (d: number, atHourOffset = 0) => minutesAgo(d * 1440 + atHourOffset * 60);
export const minutesFromNow = (m: number) => isoMicros(new Date(Date.now() + m * 60_000));
export const daysFromNow = (d: number) => minutesFromNow(d * 1440);

/**
 * A Toronto calendar date `YYYY-MM-DD`, offset from today by `days`.
 * Calendar arithmetic, not 24 hour steps: DST days are 23 or 25 hours long.
 */
export function torontoDate(days = 0): string {
  return addDays(todayToronto(new Date(Date.now())), days);
}

/** Sort newest first by an ISO string field (string compare is exact for same-format instants). */
export const byNewest =
  <T>(field: (row: T) => string | null | undefined) =>
  (a: T, b: T) =>
    (field(b) ?? '').localeCompare(field(a) ?? '');

/** Pick a deterministic element (fixtures stay stable across reloads). */
export const pick = <T>(list: readonly T[], i: number): T => list[((i % list.length) + list.length) % list.length];
