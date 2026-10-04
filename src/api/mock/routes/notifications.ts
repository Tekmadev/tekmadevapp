import { zNotificationCategory, zNotificationFilter } from '../../schemas/notifications';
import type { NotificationFilter } from '../../schemas/notifications';
import {
  callerSees,
  findRow,
  inboxStateFor,
  isMuted,
  isRead,
  mockDevices,
  notificationRows,
  prefsFor,
  serializeNotification,
  summarize,
  visibleRows,
  type NotificationRecord,
} from '../fixtures/notifications';
import { mockCan, requireCap } from '../permissions';
import { bool, fail, nowIso, ok, str, type MockContext, type MockResult, type MockRoute } from '../router';
import { staffLabel } from './session';

/**
 * Mock routes for the "notifications" domain (contract section 11, Inbox).
 * Read marks and quiet categories are per caller; resolution is shared.
 * Endpoints the contract does not list yet (GET /notifications/:id,
 * POST /notifications/test-push) are written up in docs/api-requests/notifications.md.
 *
 * Who sees what follows the capability table, like the server: every route
 * needs `notifications.view`; a row needs `inbox.<category>` (staff read Leads
 * and Clients only); test rows need `testdata.view` and, in lists, `test=1`.
 * Owner-audience events (Stripe webhook, Meta, CRM, coupon redeemed) are read
 * by anyone holding their category: managers hold every category now.
 */

const MAX_IDS = 500;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/* Keyset cursor: "after this row" in the newest-first order. Opaque to the app. */
const toHex = (s: string) => Array.from(s, (ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => (hex.match(/../g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join('');

function encodeCursor(row: NotificationRecord): string {
  return `n1.${toHex(`${row.last_occurred_at}|${row.id}`)}`;
}

function decodeCursor(cursor: string): { at: string; id: string } | null {
  if (!/^n1\.([0-9a-f]{2})+$/.test(cursor)) return null;
  const [at, id] = fromHex(cursor.slice(3)).split('|');
  return at && id && ISO_INSTANT.test(at) ? { at, id } : null;
}

/** Rows strictly after the cursor row (older, or same instant with a smaller id). */
const isAfter = (row: NotificationRecord, cursor: { at: string; id: string }) =>
  row.last_occurred_at < cursor.at || (row.last_occurred_at === cursor.at && row.id < cursor.id);

const wantsTest = (ctx: MockContext) => mockCan(ctx.user, 'testdata.view') && (ctx.query.test === '1' || ctx.query.test === 'true');

/** Any row of the caller's categories by id (test rows too, with `testdata.view`). */
const visibleById = (ctx: MockContext, id: string) => {
  const row = findRow(id);
  return row && callerSees(ctx.user, row, true) ? row : undefined;
};

const missing = () => fail(404, 'not_found', 'That notification no longer exists.');

function parseIds(body: Record<string, unknown>): string[] | MockResult {
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id): id is string => typeof id === 'string' && id.length > 0)) {
    return fail(400, 'ids', 'Pick at least one notification.');
  }
  if (ids.length > MAX_IDS) return fail(400, 'ids', `Pick at most ${MAX_IDS} notifications at a time.`);
  return Array.from(new Set(ids));
}

/** Mark rows read or unread for the caller; returns the rows they can see, in their new state. */
function setRead(ctx: MockContext, read: boolean): MockResult {
  const ids = parseIds(ctx.body);
  if (!Array.isArray(ids)) return ids;
  const state = inboxStateFor(ctx.user.id, ctx.user.role);
  const rows = ids.map((id) => visibleById(ctx, id)).filter((row): row is NotificationRecord => !!row);
  for (const row of rows) {
    if (read) state.reads.set(row.id, row.last_occurred_at);
    else state.reads.delete(row.id);
  }
  return ok({
    items: rows.map((row) => serializeNotification(row, state)),
    summary: summarize(ctx.user),
  });
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/notifications',
    latency: 'normal',
    handler: (ctx) => {
      const denied = requireCap(ctx.user, 'notifications.view');
      if (denied) return denied;
      const { query, user } = ctx;
      const filter = zNotificationFilter.safeParse(query.filter ?? 'all');
      if (!filter.success) return fail(400, 'filter', 'Unknown filter. Use all, unread or action.');
      const category = query.category ? zNotificationCategory.safeParse(query.category) : undefined;
      if (category && !category.success) return fail(400, 'category', 'Unknown notification category.');

      let cursor: { at: string; id: string } | null = null;
      if (query.cursor) {
        cursor = decodeCursor(query.cursor);
        if (!cursor) return fail(400, 'cursor', 'That page of the inbox is out of date. Pull to refresh.');
      }
      const limit = Math.min(Math.max(parseInt(query.limit ?? '', 10) || 30, 1), 100);
      const includeTest = wantsTest(ctx);
      const state = inboxStateFor(user.id, user.role);
      const want: NotificationFilter = filter.data;

      // A category the caller does not read is simply empty: those rows are never theirs.
      const rows = visibleRows(user, includeTest).filter((row) => {
        if (category?.success && row.category !== category.data) return false;
        if (cursor && !isAfter(row, cursor)) return false;
        // Unread matches the count: quiet categories are left out.
        if (want === 'unread') return !isRead(row, state) && !isMuted(row, state);
        if (want === 'action') return row.needs_action && !row.resolved_at;
        return true;
      });

      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return ok({
        summary: summarize(user, includeTest),
        items: page.map((row) => serializeNotification(row, state)),
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      });
    },
  },
  {
    method: 'GET',
    path: '/notifications/summary',
    latency: 'fast',
    handler: ({ user }) => requireCap(user, 'notifications.view') ?? ok(summarize(user)),
  },
  {
    method: 'GET',
    path: '/notifications/prefs',
    latency: 'fast',
    handler: ({ user }) => requireCap(user, 'notifications.view') ?? ok(prefsFor(user)),
  },
  {
    method: 'PATCH',
    path: '/notifications/prefs/:category',
    latency: 'fast',
    handler: ({ params, body, user }) => {
      const denied = requireCap(user, 'notifications.view');
      if (denied) return denied;
      const category = zNotificationCategory.safeParse(params.category);
      if (!category.success) return fail(404, 'not_found', 'That notification category does not exist.');
      // Owner-only categories answer owner_only, the rest a role does not read answer forbidden.
      const refused = requireCap(user, `inbox.${category.data}`);
      if (refused) return refused;
      const fields: Record<string, string> = {};
      if ('muted' in body && bool(body.muted) === undefined) fields.muted = 'Send true or false.';
      if ('push' in body && bool(body.push) === undefined) fields.push = 'Send true or false.';
      if (Object.keys(fields).length) return fail(400, 'input', 'Send quiet and push as true or false.', fields);

      const state = inboxStateFor(user.id, user.role);
      const current = state.prefs.get(category.data) ?? { muted: false, push: true };
      const next = { muted: bool(body.muted) ?? current.muted, push: bool(body.push) ?? current.push };
      state.prefs.set(category.data, next);
      const pref = prefsFor(user).find((p) => p.category === category.data);
      return pref ? ok(pref) : fail(500, 'unavailable', 'Could not load this just now. Nothing is lost: try again in a moment.');
    },
  },
  {
    method: 'POST',
    path: '/notifications/read',
    latency: 'fast',
    handler: (ctx) => requireCap(ctx.user, 'notifications.view') ?? setRead(ctx, true),
  },
  {
    method: 'POST',
    path: '/notifications/unread',
    latency: 'fast',
    handler: (ctx) => requireCap(ctx.user, 'notifications.view') ?? setRead(ctx, false),
  },
  {
    method: 'POST',
    path: '/notifications/read-all',
    latency: 'normal',
    handler: ({ body, user }) => {
      const denied = requireCap(user, 'notifications.view');
      if (denied) return denied;
      let seen: string | undefined;
      if (body.seen !== undefined && body.seen !== null) {
        seen = str(body.seen);
        if (!seen || !ISO_INSTANT.test(seen)) {
          return fail(400, 'seen', 'That watermark is not a valid time. Pull to refresh, then try again.');
        }
        if (__DEV__ && !/\.\d{6}/.test(seen)) {
          console.warn(`[mock] read-all seen "${seen}" has no microseconds. Was it re-encoded through a Date? Send last_occurred_at exactly as received.`);
        }
      }
      const state = inboxStateFor(user.id, user.role);
      let count = 0;
      // Everything the caller can see (test rows too, with testdata.view), up to the newest row they were shown.
      for (const row of notificationRows) {
        if (!callerSees(user, row, true)) continue;
        // Exact string compare: both sides carry the server's microseconds.
        if (seen !== undefined && row.last_occurred_at > seen) continue;
        if (isRead(row, state)) continue;
        state.reads.set(row.id, row.last_occurred_at);
        count += 1;
      }
      return ok({ count, summary: summarize(user) });
    },
  },
  {
    method: 'POST',
    path: '/notifications/test-push',
    latency: 'normal',
    handler: ({ body, user }) => {
      const denied = requireCap(user, 'notifications.view');
      if (denied) return denied;
      const deviceId = str(body.deviceId);
      const mine = mockDevices.filter((d) => d.userId === user.id);
      const targets = deviceId ? mine.filter((d) => d.id === deviceId) : mine;
      if (targets.length === 0) {
        return fail(422, 'no_devices', 'This phone is not set up for notifications yet. Allow notifications, then try again.');
      }
      // The mock cannot reach FCM; the app shows its own local notification in mock mode.
      return ok({ sent: targets.length });
    },
  },
  {
    method: 'GET',
    path: '/notifications/:id',
    latency: 'fast',
    handler: (ctx) => {
      const denied = requireCap(ctx.user, 'notifications.view');
      if (denied) return denied;
      const row = visibleById(ctx, ctx.params.id);
      if (!row) return missing();
      return ok(serializeNotification(row, inboxStateFor(ctx.user.id, ctx.user.role)));
    },
  },
  {
    method: 'POST',
    path: '/notifications/:id/resolve',
    latency: 'fast',
    handler: (ctx) => {
      const denied = requireCap(ctx.user, 'notifications.view');
      if (denied) return denied;
      const resolved = bool(ctx.body.resolved);
      if (resolved === undefined) return fail(400, 'resolved', 'Send resolved as true or false.');
      const row = visibleById(ctx, ctx.params.id);
      if (!row) return missing();
      if (!row.needs_action) return fail(422, 'not_actionable', 'This notification does not need action.');

      if (resolved && !row.resolved_at) {
        // Shared: the first person to handle it is the one everyone sees.
        row.resolved_at = nowIso();
        row.resolved_by = staffLabel(ctx.user);
      } else if (!resolved) {
        row.resolved_at = null;
        row.resolved_by = null;
      }
      const state = inboxStateFor(ctx.user.id, ctx.user.role);
      state.reads.set(row.id, row.last_occurred_at);
      return ok({ item: serializeNotification(row, state), summary: summarize(ctx.user) });
    },
  },
];
