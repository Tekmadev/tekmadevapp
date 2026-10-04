import {
  NOTIFICATION_CATEGORIES,
  zNotificationFilter,
  type NotificationCategory,
  type NotificationFilter,
  type NotificationItem,
  type NotificationList,
  type NotificationSeverity,
  type NotificationSummary,
} from '@/api/schemas/notifications';
import type { Capability } from '@/auth/capabilities';
import type { Tone } from '@/design/tokens';
import { daysBetween, formatTime, monthName, parseCalendarDate, torontoDateOf, weekdayName, weekdayOf } from '@/lib/dates';
import { formatCount } from '@/lib/format';

/**
 * The Inbox rules that do not need React or a device (brief 8.4): copy, the
 * row's meta line, de-duplicating pages, Toronto day groups and the summary
 * arithmetic behind optimistic updates. Unit tested in __tests__/logic.test.ts.
 */

/* ------------------------------------------------------------------ */
/* Copy (exact strings from the brief where it gives them)             */
/* ------------------------------------------------------------------ */

export const INBOX_COPY = {
  title: 'Inbox',
  markAllRead: 'Mark all read',
  error: 'Notifications could not be loaded just now. Nothing is lost: pull to refresh in a moment.',
  moreError: 'More notifications could not be loaded just now.',
  empty: {
    action: 'Nothing is waiting on you.',
    unread: "You're all caught up.",
    all: 'No notifications yet.',
  } satisfies Record<NotificationFilter, string>,
  needsAction: 'Needs action',
  test: 'Test',
  quiet: 'Quiet category',
  resolved: 'Resolved',
  everything: 'Everything',
  includeTest: 'Include test',
  open: 'Open',
  markRead: 'Mark as read',
  markUnread: 'Mark as unread',
  markHandled: 'Mark as handled',
  reopen: 'Reopen',
  makeQuiet: 'Make this category quiet',
  handledToast: 'Marked as handled.',
  reopenedToast: 'Reopened.',
  undo: 'Undo',
} as const;

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  leads: 'Leads',
  sales: 'Sales',
  billing: 'Billing',
  clients: 'Clients',
  audience: 'Audience',
  team: 'Team',
  system: 'System',
};

/** Row icon tint by severity: info neutral, success ok, warning warn, critical signal. */
export const SEVERITY_TONES: Record<NotificationSeverity, Tone> = {
  info: 'neutral',
  success: 'ok',
  warning: 'warn',
  critical: 'signal',
};

/** "Leads is quiet now. It won't count toward unread." */
export const quietToast = (category: NotificationCategory) =>
  `${CATEGORY_LABELS[category]} is quiet now. It won't count toward unread.`;

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

/** The category chip value for "Everything" (no category filter). */
export const EVERYTHING = 'everything';
export type CategoryChip = NotificationCategory | typeof EVERYTHING;

/** The capability that lets someone read a category's rows (owner decision 2026-10-03). */
export const categoryCapability = (category: NotificationCategory): Capability => `inbox.${category}`;

/**
 * The categories this person reads, in brief order: `inbox.<category>` for
 * each (staff read Leads and Clients; owners and managers read all seven).
 */
export function readableCategories(can: (cap: Capability) => boolean): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((c) => can(categoryCapability(c)));
}

/** "Everything", then a chip per category this person reads, in brief order. */
export function categoryChips(readable: readonly NotificationCategory[]): { value: CategoryChip; label: string }[] {
  const categories = NOTIFICATION_CATEGORIES.filter((c) => readable.includes(c));
  return [{ value: EVERYTHING, label: INBOX_COPY.everything }, ...categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))];
}

/** The segmented control: All, Unread, Needs action ({n}). The count is left off until it is known. */
export function filterSegments(needsAction: number | null | undefined): { value: NotificationFilter; label: string; count?: number }[] {
  return [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    needsAction == null ? { value: 'action', label: INBOX_COPY.needsAction } : { value: 'action', label: INBOX_COPY.needsAction, count: needsAction },
  ];
}

/** The `filter` route param (Home links to /inbox?filter=action). Anything else is ignored. */
export function parseFilterParam(value: string | string[] | undefined): NotificationFilter | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = zNotificationFilter.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

/** "4 unread · 2 need action", "1 needs action" when exactly one. */
export function inboxSubtitle(summary: Pick<NotificationSummary, 'unread' | 'needsAction'>): string {
  const verb = summary.needsAction === 1 ? 'needs' : 'need';
  return `${formatCount(summary.unread)} unread · ${formatCount(summary.needsAction)} ${verb} action`;
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

/** Open "Needs action": the badge shows and the left swipe offers "Mark as handled". */
export const isOpenAction = (item: Pick<NotificationItem, 'needs_action' | 'resolved_at'>) =>
  item.needs_action && !item.resolved_at;

/**
 * The quiet line under the body: time · happened N times · label · actor ·
 * quiet category · Resolved by {who}. The day is in the group header above.
 */
export function metaParts(item: NotificationItem): string[] {
  const parts = [formatTime(item.last_occurred_at)];
  if (item.occurrences > 1) parts.push(`happened ${formatCount(item.occurrences)} times`);
  if (item.label) parts.push(item.label);
  if (item.actor_label) parts.push(item.actor_label);
  if (item.is_muted) parts.push('quiet category');
  if (item.needs_action && item.resolved_at) parts.push(item.resolved_by ? `Resolved by ${item.resolved_by}` : INBOX_COPY.resolved);
  return parts;
}

export const metaLine = (item: NotificationItem) => metaParts(item).join(' · ');

/** What TalkBack reads for a row: title, state, badges, body and the meta line. */
export function rowAccessibilityLabel(item: NotificationItem): string {
  return [
    item.title,
    item.is_read ? null : 'unread',
    item.severity === 'critical' ? 'critical' : null,
    isOpenAction(item) ? INBOX_COPY.needsAction : null,
    item.is_test ? INBOX_COPY.test : null,
    item.body,
    metaLine(item),
  ]
    .filter(Boolean)
    .join(', ');
}

/* ------------------------------------------------------------------ */
/* Pages: de-duplicate and order                                       */
/* ------------------------------------------------------------------ */

/**
 * Newest first by last_occurred_at, ties by id (the server's keyset order).
 * Plain string comparison: both sides are the server's own microsecond
 * timestamps, which must never go through a Date.
 */
export function compareNewestFirst(a: NotificationItem, b: NotificationItem): number {
  if (a.last_occurred_at !== b.last_occurred_at) return a.last_occurred_at < b.last_occurred_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * One list from every loaded page. A repeating problem bumps the same row (same
 * id), so a row can show up on two pages loaded at different times: keep only
 * its newest version, in the newest-first order.
 */
export function flattenPages(pages: readonly Pick<NotificationList, 'items'>[]): NotificationItem[] {
  const byId = new Map<string, NotificationItem>();
  for (const page of pages) {
    for (const item of page.items) {
      const seen = byId.get(item.id);
      if (!seen || item.last_occurred_at > seen.last_occurred_at) byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort(compareNewestFirst);
}

/** The newest instant among rows, exactly as received (the read-all watermark). */
export function newestInstant(...groups: readonly (readonly Pick<NotificationItem, 'last_occurred_at'>[])[]): string | null {
  let newest: string | null = null;
  for (const rows of groups) {
    for (const row of rows) if (newest === null || row.last_occurred_at > newest) newest = row.last_occurred_at;
  }
  return newest;
}

/* ------------------------------------------------------------------ */
/* Toronto day groups                                                  */
/* ------------------------------------------------------------------ */

/** "Today", "Yesterday", "Monday, September 28" (", 2025" when not this year). */
export function dayLabel(day: string, today: string): string {
  const diff = daysBetween(day, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = parseCalendarDate(day);
  const t = parseCalendarDate(today);
  if (!d) return day;
  const base = `${weekdayName(weekdayOf(day))}, ${monthName(d.month)} ${d.day}`;
  return t && t.year === d.year ? base : `${base}, ${d.year}`;
}

/* Toronto day per instant, cached: Intl formatting per row on every render adds up. */
const dayCache = new Map<string, string>();
function torontoDay(instant: string): string {
  let day = dayCache.get(instant);
  if (day === undefined) {
    if (dayCache.size > 2000) dayCache.clear();
    day = torontoDateOf(instant);
    dayCache.set(instant, day);
  }
  return day;
}

export type InboxEntry =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'row';
      key: string;
      item: NotificationItem;
      /** A hairline under the row (the next entry is a row of the same day). */
      divider: boolean;
      /** Position among rows, for the enter stagger. */
      index: number;
    };

/** Rows with a header before each Toronto day. `sticky` indexes the headers. */
export function buildEntries(items: readonly NotificationItem[], today: string): { entries: InboxEntry[]; sticky: number[] } {
  const entries: InboxEntry[] = [];
  const sticky: number[] = [];
  let currentDay: string | null = null;
  items.forEach((item, index) => {
    const day = torontoDay(item.last_occurred_at);
    if (day !== currentDay) {
      currentDay = day;
      sticky.push(entries.length);
      entries.push({ kind: 'day', key: `day:${day}`, label: dayLabel(day, today) });
    }
    const next = items[index + 1];
    const divider = next !== undefined && torontoDay(next.last_occurred_at) === day;
    entries.push({ kind: 'row', key: item.id, item, divider, index });
  });
  return { entries, sticky };
}

/* ------------------------------------------------------------------ */
/* Summary arithmetic for optimistic updates                           */
/* ------------------------------------------------------------------ */

/**
 * Move the unread counts by the rows whose "counts toward unread" state flips
 * (read/unread, read-all, quiet on/off). The caller passes only rows that
 * really flip. The badge summary never counts test rows; a list fetched with
 * "Include test" does. Counts never go below zero; the server's own summary
 * replaces this estimate as soon as it answers.
 */
export function shiftSummary<S extends NotificationSummary>(
  summary: S,
  flipped: readonly Pick<NotificationItem, 'is_test' | 'severity'>[],
  direction: 1 | -1,
  includeTest: boolean,
): S {
  let unread = 0;
  let critical = 0;
  for (const row of flipped) {
    if (row.is_test && !includeTest) continue;
    unread += 1;
    if (row.severity === 'critical') critical += 1;
  }
  if (unread === 0) return summary;
  return {
    ...summary,
    unread: Math.max(0, summary.unread + direction * unread),
    criticalUnread: Math.max(0, summary.criticalUnread + direction * critical),
  };
}

/** Rows that stop (or start) counting toward unread. Quiet rows never count. */
export const countsTowardUnread = (item: Pick<NotificationItem, 'is_read' | 'is_muted'>) => !item.is_read && !item.is_muted;
