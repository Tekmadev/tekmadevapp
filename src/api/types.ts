import { z } from 'zod';

/**
 * Shared API primitives (contract v1, section 11 of the brief).
 *
 * Schema rules for the whole app:
 * - Schemas validate only: no `.transform()`, no defaults that change data, because
 *   production builds skip parsing and must see exactly the same shape.
 * - Instants are ISO 8601 UTC strings, calendar dates are `YYYY-MM-DD` (Toronto).
 *   Both stay strings; format them with src/lib/dates.ts.
 * - Money is integer cents. Never divide in a schema.
 * - Cursors and `seen` watermarks are opaque strings: pass them back exactly.
 */

export const zInstant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'ISO instant');
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const zCents = z.number().int();
export const zMoney = z.object({ amount: zCents, currency: z.string() });
export type Money = z.infer<typeof zMoney>;

/** Staff roles (owner decision 2026-10-03). What each may do is in src/auth/capabilities.ts. */
export const zRole = z.enum(['owner', 'manager', 'staff']);
export type Role = z.infer<typeof zRole>;

export const zTone = z.enum(['neutral', 'gold', 'ok', 'warn', 'muted', 'signal']);

export const zPage = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export type Page<T> = { items: T[]; nextCursor: string | null };

/** `{ label, count }` rows used by analytics top lists. */
export const zLabelCount = z.object({ label: z.string(), count: z.number() });
export type LabelCount = z.infer<typeof zLabelCount>;

export const zErrorBody = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ErrorBody = z.infer<typeof zErrorBody>;

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: ErrorBody };

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** What a transport (live fetch or mock adapter) receives. */
export type ApiRequest = {
  method: HttpMethod;
  /** Path below the API base, starting with "/" (e.g. "/clients/abc"). */
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
};

/** What a transport returns: the HTTP status and the parsed JSON body (or null). */
export type ApiResponse = { status: number; body: unknown };

export type Transport = (request: ApiRequest) => Promise<ApiResponse>;
