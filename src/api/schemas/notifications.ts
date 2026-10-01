import { z } from 'zod';

import { zInstant, zTone } from '../types';

/**
 * Schemas for the "notifications" domain (contract section 11, Inbox; brief 8.4, 8.18, 9).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * The notification item keeps the API's snake_case field names on purpose: it is
 * the server's row shape, and renaming fields would need a schema transform,
 * which production builds never run (they skip parsing).
 */

export const zNotificationCategory = z.enum(['leads', 'sales', 'billing', 'clients', 'audience', 'team', 'system']);
export type NotificationCategory = z.infer<typeof zNotificationCategory>;

/** Inbox chips and preference rows follow this order. */
export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = zNotificationCategory.options;

/** Managers never see these categories: not in chips, not in prefs, not in rows. */
export const OWNER_ONLY_CATEGORIES: readonly NotificationCategory[] = ['audience', 'team'];

export const zNotificationSeverity = z.enum(['info', 'success', 'warning', 'critical']);
export type NotificationSeverity = z.infer<typeof zNotificationSeverity>;

/** The Inbox segmented control: All, Unread, Needs action. */
export const zNotificationFilter = z.enum(['all', 'unread', 'action']);
export type NotificationFilter = z.infer<typeof zNotificationFilter>;

export const zNotificationItem = z.object({
  id: z.string(),
  /** Sort key. Microsecond precision: pass it back (as `seen`) exactly as received. */
  last_occurred_at: zInstant,
  /** How many times this event happened; a repeating problem bumps the same row. */
  occurrences: z.number().int(),
  /** Catalogue key, e.g. "billing.payment_failed". */
  event_key: z.string(),
  category: zNotificationCategory,
  severity: zNotificationSeverity,
  title: z.string(),
  body: z.string().nullable(),
  /** A web admin path (starts with /admin), mapped with src/lib/deeplinks.ts. Null: open the detail sheet. */
  action_url: z.string().nullable(),
  entity_type: z.string().nullable(),
  entity_id: z.string().nullable(),
  client_id: z.string().nullable(),
  /** Who caused it: "lead", "client", "customer", "subscriber", "staff", "integration" or "system". */
  actor_type: z.string().nullable(),
  actor_label: z.string().nullable(),
  needs_action: z.boolean(),
  /** Shared by all staff: one person marking it handled resolves it for everyone. */
  resolved_at: zInstant.nullable(),
  /** Display name of the staff member who handled it ("Resolved by {who}"). */
  resolved_by: z.string().nullable(),
  is_test: z.boolean(),
  /** Free-form event payload (amounts in cents, emails, ids). Never required by the UI. */
  data: z.record(z.string(), z.unknown()),
  /** Per user. A bump makes the row unread again for everyone. */
  is_read: z.boolean(),
  /** Per user: the category is quiet for this user (it does not count toward unread). */
  is_muted: z.boolean(),
  /** The catalogue label for the event, e.g. "New booking". */
  label: z.string(),
});
export type NotificationItem = z.infer<typeof zNotificationItem>;

export const zNotificationSummary = z.object({
  /** Unread rows in categories that are not quiet for this user. */
  unread: z.number().int(),
  /** Open needs-action rows (shared resolution), quiet or not. */
  needsAction: z.number().int(),
  /** Unread critical rows in categories that are not quiet. Turns the tab badge red. */
  criticalUnread: z.number().int(),
});
export type NotificationSummary = z.infer<typeof zNotificationSummary>;

/** GET /notifications: one page plus the inbox summary for the header. */
export const zNotificationList = z.object({
  summary: zNotificationSummary,
  items: z.array(zNotificationItem),
  nextCursor: z.string().nullable(),
});
export type NotificationList = z.infer<typeof zNotificationList>;

/** POST /notifications/read and /unread: the rows that changed, plus a fresh summary. */
export const zNotificationsUpdate = z.object({
  items: z.array(zNotificationItem),
  summary: zNotificationSummary,
});
export type NotificationsUpdate = z.infer<typeof zNotificationsUpdate>;

/** POST /notifications/read-all: how many rows became read, plus a fresh summary. */
export const zNotificationsReadAll = z.object({
  count: z.number().int(),
  summary: zNotificationSummary,
});
export type NotificationsReadAll = z.infer<typeof zNotificationsReadAll>;

/** POST /notifications/:id/resolve: the full updated row, plus a fresh summary. */
export const zNotificationResolve = z.object({
  item: zNotificationItem,
  summary: zNotificationSummary,
});
export type NotificationResolve = z.infer<typeof zNotificationResolve>;

/** One row of the per-user notification preferences (App settings, Notifications). */
export const zNotificationPref = z.object({
  category: zNotificationCategory,
  label: z.string(),
  /** "Quiet": the category does not count toward unread. */
  muted: z.boolean(),
  /** Send a phone notification for this category. */
  push: z.boolean(),
});
export type NotificationPref = z.infer<typeof zNotificationPref>;

export const zNotificationPrefs = z.array(zNotificationPref);
export type NotificationPrefs = z.infer<typeof zNotificationPrefs>;

/** POST /notifications/test-push (requested in docs/api-requests/notifications.md). */
export const zTestPushResult = z.object({ sent: z.number().int() });
export type TestPushResult = z.infer<typeof zTestPushResult>;

/**
 * The data a push notification carries (brief section 9). FCM data values are
 * strings, so `url` arrives as an empty string or is missing when the row has
 * no action_url. Category and severity pick the Android channel.
 */
export const zPushPayload = z.object({
  notificationId: z.string(),
  url: z.string().nullish(),
  category: zNotificationCategory,
  severity: zNotificationSeverity,
});
export type PushPayload = z.infer<typeof zPushPayload>;

export const zNotificationCategoryMeta = z.object({
  value: zNotificationCategory,
  label: z.string(),
  /** Audience and Team: never shown to managers. */
  ownerOnly: z.boolean(),
});

export const zNotificationSeverityMeta = z.object({
  value: zNotificationSeverity,
  label: z.string(),
  /** Row icon tint: info neutral, success ok, warning warn, critical signal. */
  tone: zTone,
});

/** One entry of the event catalogue (the `label` every row carries comes from here). */
export const zNotificationEventMeta = z.object({
  key: z.string(),
  label: z.string(),
  category: zNotificationCategory,
  severity: zNotificationSeverity,
  needsAction: z.boolean(),
});
export type NotificationEventMeta = z.infer<typeof zNotificationEventMeta>;

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  notificationCategories: z.array(zNotificationCategoryMeta),
  notificationSeverities: z.array(zNotificationSeverityMeta),
  notificationEvents: z.array(zNotificationEventMeta),
});
export type NotificationsMeta = z.infer<typeof metaFragment>;
