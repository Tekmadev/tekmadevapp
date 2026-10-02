import type { NotificationItem, NotificationSummary } from '@/api/schemas/notifications';

import {
  buildEntries,
  categoryChips,
  countsTowardUnread,
  dayLabel,
  filterSegments,
  flattenPages,
  inboxSubtitle,
  INBOX_COPY,
  isOpenAction,
  metaLine,
  newestInstant,
  parseFilterParam,
  shiftSummary,
} from '../logic';

function row(over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'n1',
    last_occurred_at: '2026-09-30T18:05:00.123456Z',
    occurrences: 1,
    event_key: 'leads.booking_created',
    category: 'leads',
    severity: 'info',
    title: 'New booking',
    body: 'Acme Plumbing booked a call.',
    action_url: '/admin/leads',
    entity_type: null,
    entity_id: null,
    client_id: null,
    actor_type: null,
    actor_label: null,
    needs_action: false,
    resolved_at: null,
    resolved_by: null,
    is_test: false,
    data: {},
    is_read: false,
    is_muted: false,
    label: 'New booking',
    ...over,
  };
}

const summary: NotificationSummary = { unread: 3, needsAction: 2, criticalUnread: 1 };

describe('inboxSubtitle', () => {
  it('uses "need action" for several and "needs action" for one', () => {
    expect(inboxSubtitle({ unread: 4, needsAction: 2 })).toBe('4 unread · 2 need action');
    expect(inboxSubtitle({ unread: 0, needsAction: 1 })).toBe('0 unread · 1 needs action');
    expect(inboxSubtitle({ unread: 1200, needsAction: 0 })).toBe('1,200 unread · 0 need action');
  });
});

describe('copy', () => {
  it('keeps the brief strings exactly', () => {
    expect(INBOX_COPY.empty).toEqual({
      action: 'Nothing is waiting on you.',
      unread: "You're all caught up.",
      all: 'No notifications yet.',
    });
    expect(INBOX_COPY.error).toBe('Notifications could not be loaded just now. Nothing is lost: pull to refresh in a moment.');
  });
});

describe('filters', () => {
  it('reads only known filter params', () => {
    expect(parseFilterParam('action')).toBe('action');
    expect(parseFilterParam(['unread', 'all'])).toBe('unread');
    expect(parseFilterParam('nope')).toBeNull();
    expect(parseFilterParam(undefined)).toBeNull();
  });

  it('leaves the Needs action count off until it is known', () => {
    expect(filterSegments(null)[2]).toEqual({ value: 'action', label: 'Needs action' });
    expect(filterSegments(0)[2]).toEqual({ value: 'action', label: 'Needs action', count: 0 });
  });

  it('shows Audience and Team chips to owners only', () => {
    const owner = categoryChips(true).map((c) => c.label);
    const manager = categoryChips(false).map((c) => c.label);
    expect(owner).toEqual(['Everything', 'Leads', 'Sales', 'Billing', 'Clients', 'Audience', 'Team', 'System']);
    expect(manager).toEqual(['Everything', 'Leads', 'Sales', 'Billing', 'Clients', 'System']);
  });
});

describe('metaLine', () => {
  it('is just the Toronto time for a plain row', () => {
    expect(metaLine(row())).toBe('2:05 PM · New booking');
  });

  it('adds repeats, actor, quiet and who resolved it, in order', () => {
    const line = metaLine(
      row({
        occurrences: 3,
        actor_label: 'Stripe',
        is_muted: true,
        needs_action: true,
        resolved_at: '2026-09-30T19:00:00.000000Z',
        resolved_by: 'Shajeed I.',
        label: 'Payment failed',
      }),
    );
    expect(line).toBe('2:05 PM · happened 3 times · Payment failed · Stripe · quiet category · Resolved by Shajeed I.');
  });

  it('knows an open needs-action row from a handled one', () => {
    expect(isOpenAction(row({ needs_action: true }))).toBe(true);
    expect(isOpenAction(row({ needs_action: true, resolved_at: '2026-09-30T19:00:00.000000Z' }))).toBe(false);
    expect(isOpenAction(row())).toBe(false);
  });
});

describe('flattenPages', () => {
  it('keeps one row per id, the newest version, newest first', () => {
    const old = row({ id: 'a', last_occurred_at: '2026-09-29T10:00:00.000001Z', occurrences: 1 });
    const bumped = row({ id: 'a', last_occurred_at: '2026-09-30T10:00:00.000002Z', occurrences: 2 });
    const other = row({ id: 'b', last_occurred_at: '2026-09-30T09:00:00.000000Z' });
    const items = flattenPages([{ items: [bumped, other] }, { items: [old] }]);
    expect(items.map((i) => [i.id, i.occurrences])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });

  it('breaks ties by id like the server keyset', () => {
    const at = '2026-09-30T10:00:00.000000Z';
    const items = flattenPages([{ items: [row({ id: 'a', last_occurred_at: at }), row({ id: 'c', last_occurred_at: at })] }]);
    expect(items.map((i) => i.id)).toEqual(['c', 'a']);
  });
});

describe('newestInstant', () => {
  it('returns the newest string exactly as received', () => {
    const rows = [row({ last_occurred_at: '2026-09-30T10:00:00.000001Z' }), row({ last_occurred_at: '2026-09-30T10:00:00.000009Z' })];
    expect(newestInstant(rows)).toBe('2026-09-30T10:00:00.000009Z');
    expect(newestInstant([])).toBeNull();
  });
});

describe('day groups', () => {
  it('labels Toronto days', () => {
    expect(dayLabel('2026-09-30', '2026-09-30')).toBe('Today');
    expect(dayLabel('2026-09-29', '2026-09-30')).toBe('Yesterday');
    expect(dayLabel('2026-09-28', '2026-09-30')).toBe('Monday, September 28');
    expect(dayLabel('2025-12-31', '2026-09-30')).toBe('Wednesday, December 31, 2025');
  });

  it('puts a header before each Toronto day and dividers only inside a day', () => {
    // 03:30 UTC on the 30th is still the 29th in Toronto.
    const items = [
      row({ id: 'a', last_occurred_at: '2026-09-30T15:00:00.000000Z' }),
      row({ id: 'b', last_occurred_at: '2026-09-30T05:00:00.000000Z' }),
      row({ id: 'c', last_occurred_at: '2026-09-30T03:30:00.000000Z' }),
    ];
    const { entries, sticky } = buildEntries(items, '2026-09-30');
    expect(entries.map((e) => (e.kind === 'day' ? e.label : e.key))).toEqual(['Today', 'a', 'b', 'Yesterday', 'c']);
    expect(sticky).toEqual([0, 3]);
    const dividers = entries.flatMap((e) => (e.kind === 'row' ? [e.divider] : []));
    expect(dividers).toEqual([true, false, false]);
  });
});

describe('shiftSummary', () => {
  it('moves unread and critical counts by the flipped rows', () => {
    const next = shiftSummary(summary, [row(), row({ severity: 'critical' })], -1, false);
    expect(next).toEqual({ unread: 1, needsAction: 2, criticalUnread: 0 });
  });

  it('skips test rows unless the list includes them', () => {
    expect(shiftSummary(summary, [row({ is_test: true })], -1, false)).toBe(summary);
    expect(shiftSummary(summary, [row({ is_test: true })], -1, true).unread).toBe(2);
  });

  it('never goes below zero', () => {
    expect(shiftSummary({ unread: 0, needsAction: 0, criticalUnread: 0 }, [row()], -1, false).unread).toBe(0);
  });

  it('counts only unread rows outside quiet categories', () => {
    expect(countsTowardUnread(row())).toBe(true);
    expect(countsTowardUnread(row({ is_read: true }))).toBe(false);
    expect(countsTowardUnread(row({ is_muted: true }))).toBe(false);
  });
});
