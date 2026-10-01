import { api, setAuthBridge } from '@/api/client';
import {
  getNotification,
  getNotificationPrefs,
  getNotifications,
  getNotificationSummary,
  markAllNotificationsRead,
  markNotificationsRead,
  markNotificationsUnread,
  notificationsInfiniteQuery,
  resolveNotification,
  sendTestPush,
  updateNotificationPref,
  type NotificationListParams,
} from '@/api/endpoints/notifications';
import { ApiError } from '@/api/errors';
import { metaFixture, mockNotificationEvents } from '@/api/mock/fixtures/notifications';
import {
  metaFragment,
  zNotificationItem,
  zNotificationList,
  zNotificationPref,
  zNotificationPrefs,
  zNotificationResolve,
  zNotificationsReadAll,
  zNotificationsUpdate,
  zNotificationSummary,
  zTestPushResult,
  type NotificationItem,
} from '@/api/schemas/notifications';

/**
 * The notifications domain through the real mock transport: envelope, schemas,
 * keyset paging, per-user read state and mutes, shared resolution, audience
 * rules for managers, test rows, and the documented validation errors.
 */

let token = '';
const asOwner = () => {
  token = `mock.usr_owner01.${Date.now() + 3_600_000}`;
};
const asManager = () => {
  token = `mock.usr_mgr01.${Date.now() + 3_600_000}`;
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
});

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

/** Walk every page exactly like useInfiniteQuery does, cursor passed back verbatim. */
async function allPages(params: NotificationListParams) {
  const options = notificationsInfiniteQuery(params);
  const pages: Awaited<ReturnType<typeof getNotifications>>[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page = await getNotifications({ ...params, cursor });
    expect(zNotificationList.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return pages;
}

const OWNER_ONLY_EVENTS = [
  'system.stripe_webhook_failing',
  'system.meta_pull_failed',
  'system.meta_token_expiring',
  'system.crm_stuck',
  'system.crm_reconcile_halted',
  'sales.coupon_redeemed',
];

const isNewestFirst = (items: NotificationItem[]) =>
  items.every((item, i) => i === 0 || items[i - 1].last_occurred_at >= item.last_occurred_at);

describe('meta fragment', () => {
  it('matches its schema', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
    expect(metaFixture.notificationCategories.map((c) => c.value)).toEqual([
      'leads',
      'sales',
      'billing',
      'clients',
      'audience',
      'team',
      'system',
    ]);
  });
});

describe('GET /notifications', () => {
  it('pages the owner inbox with an opaque cursor, newest first, ending on a short page', async () => {
    asOwner();
    const pages = await allPages({ filter: 'all' });
    expect(pages.length).toBe(3);
    expect(pages[0].items).toHaveLength(30);
    expect(pages[1].items).toHaveLength(30);
    const last = pages[pages.length - 1];
    expect(last.items.length).toBeGreaterThan(0);
    expect(last.items.length).toBeLessThan(30);
    expect(last.nextCursor).toBeNull();

    const items = pages.flatMap((p) => p.items);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(isNewestFirst(items)).toBe(true);
    // Instants carry microseconds, like the server.
    expect(items[0].last_occurred_at).toMatch(/\.\d{6}Z$/);
    // No test rows unless asked for, but owner-only categories are there.
    expect(items.some((i) => i.is_test)).toBe(false);
    expect(items.some((i) => i.category === 'audience')).toBe(true);
    expect(items.some((i) => i.category === 'team')).toBe(true);
    // Every category and severity is represented, plus bumped rows and a row with no link.
    expect(new Set(items.map((i) => i.category)).size).toBe(7);
    expect(new Set(items.map((i) => i.severity)).size).toBe(4);
    expect(items.some((i) => i.occurrences > 1)).toBe(true);
    expect(items.some((i) => i.action_url === null)).toBe(true);
    expect(items.some((i) => i.resolved_at !== null)).toBe(true);
  });

  it('honours a smaller limit and stops when the server sends no cursor', async () => {
    asOwner();
    const first = await getNotifications({ filter: 'all', limit: 10 });
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await getNotifications({ filter: 'all', limit: 10, cursor: first.nextCursor });
    expect(second.items).toHaveLength(10);
    expect(second.items[0].last_occurred_at <= first.items[9].last_occurred_at).toBe(true);
    expect(second.items.some((i) => first.items.some((f) => f.id === i.id))).toBe(false);
  });

  it('includes test rows only for owners who ask', async () => {
    asOwner();
    const withTest = (await allPages({ filter: 'all', includeTest: true })).flatMap((p) => p.items);
    expect(withTest.filter((i) => i.is_test).length).toBeGreaterThanOrEqual(3);

    asManager();
    const manager = (await allPages({ filter: 'all', includeTest: true })).flatMap((p) => p.items);
    expect(manager.some((i) => i.is_test)).toBe(false);
  });

  it('never shows owner-audience rows to managers', async () => {
    asManager();
    const pages = await allPages({ filter: 'all' });
    const items = pages.flatMap((p) => p.items);
    expect(items.length).toBeGreaterThan(30);
    expect(items.some((i) => i.category === 'audience' || i.category === 'team')).toBe(false);
    expect(items.some((i) => OWNER_ONLY_EVENTS.includes(i.event_key))).toBe(false);
    // Asking for an owner category is not an error, it is simply empty.
    const team = await getNotifications({ filter: 'all', category: 'team' });
    expect(team.items).toHaveLength(0);
  });

  it('filters by unread, needs action and category, consistent with the summary', async () => {
    asOwner();
    const unread = (await allPages({ filter: 'unread' })).flatMap((p) => p.items);
    const summary = await getNotificationSummary();
    expect(zNotificationSummary.safeParse(summary).success).toBe(true);
    expect(unread.every((i) => !i.is_read && !i.is_muted)).toBe(true);
    expect(unread.length).toBe(summary.unread);
    expect(summary.criticalUnread).toBe(unread.filter((i) => i.severity === 'critical').length);
    expect(summary.criticalUnread).toBeGreaterThan(0);

    const action = (await allPages({ filter: 'action' })).flatMap((p) => p.items);
    expect(action.every((i) => i.needs_action && i.resolved_at === null)).toBe(true);
    expect(action.length).toBe(summary.needsAction);

    const billing = (await allPages({ filter: 'all', category: 'billing' })).flatMap((p) => p.items);
    expect(billing.length).toBeGreaterThan(0);
    expect(billing.every((i) => i.category === 'billing')).toBe(true);

    // The quiet Audience category shows its rows, flagged, but they never count.
    const audience = (await allPages({ filter: 'all', category: 'audience' })).flatMap((p) => p.items);
    expect(audience.every((i) => i.is_muted)).toBe(true);
    expect(audience.some((i) => !i.is_read)).toBe(true);
  });

  it('returns the documented validation errors', async () => {
    asOwner();
    const badFilter = await apiError(api.get('/notifications', { query: { filter: 'starred' } }));
    expect([badFilter.status, badFilter.code]).toEqual([400, 'filter']);
    const badCategory = await apiError(api.get('/notifications', { query: { category: 'marketing' } }));
    expect([badCategory.status, badCategory.code]).toEqual([400, 'category']);
    const badCursor = await apiError(getNotifications({ filter: 'all', cursor: 'not-a-cursor' }));
    expect([badCursor.status, badCursor.code]).toEqual([400, 'cursor']);
  });
});

describe('GET /notifications/:id', () => {
  it('opens a visible row and hides owner rows from managers', async () => {
    asOwner();
    const list = await getNotifications({ filter: 'all', category: 'system', includeTest: true });
    const stripe = list.items.find((i) => i.event_key === 'system.stripe_webhook_failing');
    expect(stripe).toBeDefined();
    if (!stripe) return;
    const detail = await getNotification(stripe.id);
    expect(zNotificationItem.safeParse(detail).success).toBe(true);
    expect(detail.id).toBe(stripe.id);

    asManager();
    const hidden = await apiError(getNotification(stripe.id));
    expect(hidden.status).toBe(404);
    const unknown = await apiError(getNotification('ntf_nope'));
    expect(unknown.status).toBe(404);
  });
});

describe('read state', () => {
  it('is per user, and visible in later reads', async () => {
    asOwner();
    const before = await getNotificationSummary();
    const target = (await getNotifications({ filter: 'unread', category: 'leads' })).items[0];
    expect(target).toBeDefined();

    asManager();
    const managerView = await getNotification(target.id);
    expect(managerView.is_read).toBe(false);

    asOwner();
    const read = await markNotificationsRead([target.id]);
    expect(zNotificationsUpdate.safeParse(read).success).toBe(true);
    expect(read.items).toHaveLength(1);
    expect(read.items[0].is_read).toBe(true);
    expect(read.summary.unread).toBe(before.unread - 1);
    expect((await getNotification(target.id)).is_read).toBe(true);
    expect((await getNotifications({ filter: 'unread', category: 'leads' })).items.some((i) => i.id === target.id)).toBe(false);

    // The manager's copy is untouched.
    asManager();
    expect((await getNotification(target.id)).is_read).toBe(false);

    asOwner();
    const unread = await markNotificationsUnread([target.id]);
    expect(zNotificationsUpdate.safeParse(unread).success).toBe(true);
    expect(unread.items[0].is_read).toBe(false);
    expect(unread.summary.unread).toBe(before.unread);
  });

  it('ignores ids the caller cannot see', async () => {
    asOwner();
    const owners = await getNotifications({ filter: 'all', category: 'team' });
    asManager();
    const result = await markNotificationsRead([owners.items[0].id, 'ntf_missing']);
    expect(result.items).toHaveLength(0);
  });

  it('rejects an empty or malformed id list', async () => {
    asOwner();
    const empty = await apiError(markNotificationsRead([]));
    expect([empty.status, empty.code]).toEqual([400, 'ids']);
    const wrong = await apiError(api.post('/notifications/unread', { ids: 'ntf_1' }));
    expect([wrong.status, wrong.code]).toEqual([400, 'ids']);
  });
});

describe('POST /notifications/read-all', () => {
  it('marks read up to the watermark exactly as received, then a bump makes a row unread again', async () => {
    asOwner();
    // Make the newest rows unread, so the watermark has something on both sides.
    const top = (await getNotifications({ filter: 'all', limit: 8 })).items;
    await markNotificationsUnread(top.map((i) => i.id));

    const seen = top[4].last_occurred_at;
    expect(seen).toMatch(/\.\d{6}Z$/);
    const result = await markAllNotificationsRead(seen);
    expect(zNotificationsReadAll.safeParse(result).success).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(4);

    const after = (await allPages({ filter: 'all' })).flatMap((p) => p.items);
    for (const item of after) {
      if (item.last_occurred_at <= seen) expect(item.is_read).toBe(true);
    }
    // The four rows newer than the watermark stay unread.
    const newer = after.filter((i) => i.last_occurred_at > seen);
    expect(newer).toHaveLength(4);
    expect(newer.every((i) => !i.is_read)).toBe(true);

    // A repeating problem bumps the same row: same id, on top, one more occurrence, unread again.
    const stripeBefore = after.find((i) => i.event_key === 'system.stripe_webhook_failing');
    expect(stripeBefore).toBeDefined();
    if (!stripeBefore) return;
    await markNotificationsRead([stripeBefore.id]);
    mockNotificationEvents.repeatStripeFailure();
    const bumped = (await getNotifications({ filter: 'all', limit: 5 })).items[0];
    expect(bumped.id).toBe(stripeBefore.id);
    expect(bumped.occurrences).toBe(stripeBefore.occurrences + 1);
    expect(bumped.is_read).toBe(false);
    expect(bumped.last_occurred_at > stripeBefore.last_occurred_at).toBe(true);
  });

  it('without a watermark marks everything read for the caller only', async () => {
    asManager();
    const managerBefore = await getNotificationSummary();
    expect(managerBefore.unread).toBeGreaterThan(0);

    asOwner();
    const result = await markAllNotificationsRead();
    expect(result.summary.unread).toBe(0);
    expect(result.summary.criticalUnread).toBe(0);
    expect((await getNotifications({ filter: 'unread' })).items).toHaveLength(0);

    asManager();
    expect((await getNotificationSummary()).unread).toBe(managerBefore.unread);
  });

  it('rejects a watermark that is not a time', async () => {
    asOwner();
    const error = await apiError(markAllNotificationsRead('yesterday'));
    expect([error.status, error.code]).toEqual([400, 'seen']);
  });
});

describe('POST /notifications/:id/resolve', () => {
  it('is shared by all staff, marks the row read, and can be reopened', async () => {
    asManager();
    const before = await getNotificationSummary();
    const target = (await getNotifications({ filter: 'action', category: 'clients' })).items[0];
    expect(target).toBeDefined();

    const done = await resolveNotification(target.id, true);
    expect(zNotificationResolve.safeParse(done).success).toBe(true);
    expect(done.item.resolved_at).toEqual(expect.any(String));
    expect(done.item.resolved_by).toBe('Maya Chen');
    expect(done.item.is_read).toBe(true);
    expect(done.summary.needsAction).toBe(before.needsAction - 1);

    asOwner();
    const ownerView = await getNotification(target.id);
    expect(ownerView.resolved_by).toBe('Maya Chen');
    expect((await getNotifications({ filter: 'action' })).items.some((i) => i.id === target.id)).toBe(false);

    // Resolving again keeps the first person who handled it.
    const again = await resolveNotification(target.id, true);
    expect(again.item.resolved_by).toBe('Maya Chen');

    const reopened = await resolveNotification(target.id, false);
    expect(reopened.item.resolved_at).toBeNull();
    expect(reopened.item.resolved_by).toBeNull();

    asManager();
    expect((await getNotificationSummary()).needsAction).toBe(before.needsAction);
  });

  it('returns 400, 404 and 422 as documented', async () => {
    asOwner();
    const all = (await getNotifications({ filter: 'all' })).items;
    const actionable = all.find((i) => i.needs_action);
    const plain = all.find((i) => !i.needs_action);
    expect(actionable && plain).toBeTruthy();
    if (!actionable || !plain) return;

    const missingFlag = await apiError(api.post(`/notifications/${actionable.id}/resolve`, {}));
    expect([missingFlag.status, missingFlag.code]).toEqual([400, 'resolved']);
    const notActionable = await apiError(resolveNotification(plain.id, true));
    expect([notActionable.status, notActionable.code]).toEqual([422, 'not_actionable']);
    const unknown = await apiError(resolveNotification('ntf_missing', true));
    expect(unknown.status).toBe(404);
  });
});

describe('preferences', () => {
  it('lists every category for owners and hides Team and Audience from managers', async () => {
    asOwner();
    const owner = await getNotificationPrefs();
    expect(zNotificationPrefs.safeParse(owner).success).toBe(true);
    expect(owner.map((p) => p.category)).toEqual(['leads', 'sales', 'billing', 'clients', 'audience', 'team', 'system']);
    expect(owner.find((p) => p.category === 'audience')?.muted).toBe(true);

    asManager();
    const manager = await getNotificationPrefs();
    expect(manager.map((p) => p.category)).toEqual(['leads', 'sales', 'billing', 'clients', 'system']);
  });

  it('makes a category quiet for the caller only, and quiet rows stop counting', async () => {
    asManager();
    await markNotificationsUnread((await getNotifications({ filter: 'all', category: 'leads', limit: 3 })).items.map((i) => i.id));
    const managerBefore = await getNotificationSummary();

    asOwner();
    await markNotificationsUnread((await getNotifications({ filter: 'all', category: 'leads', limit: 3 })).items.map((i) => i.id));
    const before = await getNotificationSummary();
    const leadsUnread = (await allPages({ filter: 'unread', category: 'leads' })).flatMap((p) => p.items).length;
    expect(leadsUnread).toBeGreaterThan(0);

    const pref = await updateNotificationPref('leads', { muted: true });
    expect(zNotificationPref.safeParse(pref).success).toBe(true);
    expect(pref).toEqual({ category: 'leads', label: 'Leads', muted: true, push: true });
    expect((await getNotificationPrefs()).find((p) => p.category === 'leads')?.muted).toBe(true);

    const after = await getNotificationSummary();
    expect(after.unread).toBe(before.unread - leadsUnread);
    const leads = (await getNotifications({ filter: 'all', category: 'leads' })).items;
    expect(leads.every((i) => i.is_muted)).toBe(true);
    expect((await getNotifications({ filter: 'unread', category: 'leads' })).items).toHaveLength(0);

    // Partial: only push changes, quiet stays on.
    expect(await updateNotificationPref('leads', { push: false })).toEqual({ category: 'leads', label: 'Leads', muted: true, push: false });

    asManager();
    expect((await getNotificationSummary()).unread).toBe(managerBefore.unread);
    expect((await getNotificationPrefs()).find((p) => p.category === 'leads')?.muted).toBe(false);

    asOwner();
    await updateNotificationPref('leads', { muted: false, push: true });
  });

  it('is owner only for Team and Audience, and validates input', async () => {
    asManager();
    const team = await apiError(updateNotificationPref('team', { muted: true }));
    expect(team.status).toBe(403);
    const audience = await apiError(updateNotificationPref('audience', { push: false }));
    expect(audience.status).toBe(403);

    asOwner();
    const unknown = await apiError(api.patch('/notifications/prefs/marketing', { muted: true }));
    expect(unknown.status).toBe(404);
    const invalid = await apiError(api.patch('/notifications/prefs/leads', { muted: 'yes' }));
    expect([invalid.status, invalid.code]).toEqual([400, 'input']);
    expect(invalid.fields).toEqual({ muted: 'Send true or false.' });
  });
});

describe('POST /notifications/test-push', () => {
  it('sends to the phones the caller registered, or explains there are none', async () => {
    asOwner();
    const sent = await sendTestPush();
    expect(zTestPushResult.safeParse(sent).success).toBe(true);
    expect(sent.sent).toBe(1);

    asManager();
    const none = await apiError(sendTestPush());
    expect([none.status, none.code]).toEqual([422, 'no_devices']);
  });
});
