import { setAuthBridge } from '@/api/client';
import { getAnalytics } from '@/api/endpoints/analytics';
import { getSubscriptions } from '@/api/endpoints/billing';
import { getClient, getClients, reviewCall, reviewIntake, updateOnboarding } from '@/api/endpoints/clients';
import { getLeads } from '@/api/endpoints/leads';
import { deleteLink, getLinkClicks, getLinks } from '@/api/endpoints/links';
import { getNotifications, getNotificationSummary, markNotificationsRead, resolveNotification } from '@/api/endpoints/notifications';
import { getOverview, overviewKeys, overviewQuery } from '@/api/endpoints/overview';
import { ApiError } from '@/api/errors';
import { mockControls } from '@/api/mock/controls';
import { analyticsMock } from '@/api/mock/fixtures/analytics';
import { metaFixture } from '@/api/mock/fixtures/overview';
import type { ClientRow } from '@/api/schemas/clients';
import type { Lead } from '@/api/schemas/leads';
import type { LinkClick } from '@/api/schemas/links';
import { metaFragment, zOverview, type Overview } from '@/api/schemas/overview';
import type { Subscription } from '@/api/schemas/billing';
import type { Page } from '@/api/types';
import { torontoDateOf } from '@/lib/dates';
import { mapAdminUrl } from '@/lib/deeplinks';

/**
 * GET /overview through the real mock transport. Home's numbers must match the
 * lists they open, so most checks walk the other domains' endpoints and compare.
 */

let token = '';
const asOwner = () => {
  token = `mock.usr_owner01.${Date.now() + 3_600_000}`;
};
const asManager = () => {
  token = `mock.usr_mgr01.${Date.now() + 3_600_000}`;
};
const asStaff = () => {
  token = `mock.usr_staff01.${Date.now() + 3_600_000}`;
};

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
});
beforeEach(asOwner);

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

/** GET /overview, checked against its schema every time. */
async function overview(): Promise<Overview> {
  const data = await getOverview();
  const parsed = zOverview.safeParse(data);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3)));
  return data;
}

/** Walk a cursor list to the end, passing each cursor back exactly as received. */
async function walk<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const page: Page<T> = await fetchPage(cursor);
    items.push(...page.items);
    if (!page.nextCursor) return items;
    cursor = page.nextCursor;
  }
  throw new Error('Too many pages');
}

/** Freeze the clock so two reads of the traffic model see the same minute. */
function freezeNow() {
  const now = Date.now();
  return jest.spyOn(Date, 'now').mockReturnValue(now);
}

describe('GET /overview: shape', () => {
  it('parses for the owner, a manager and staff', async () => {
    const owner = await overview();
    asManager();
    const manager = await overview();
    asStaff();
    const staff = await overview();
    expect(owner.recentLeads).toHaveLength(8);
    expect(owner.recentSubscriptions).toHaveLength(8);
    expect(manager.recentLeads).toEqual(owner.recentLeads);
    expect(manager.recentSubscriptions).toEqual(owner.recentSubscriptions);
    expect(manager.kpis).toEqual(owner.kpis);
    // The same rows for staff; only canEdit depends on who asks (like GET /leads).
    const withoutCanEdit = (rows: typeof owner.recentLeads) => rows.map(({ canEdit: _canEdit, ...rest }) => rest);
    expect(withoutCanEdit(staff.recentLeads)).toEqual(withoutCanEdit(owner.recentLeads));
    expect(owner.recentLeads.every((l) => l.canEdit === true)).toBe(true);
    for (const lead of staff.recentLeads) {
      expect(lead.canEdit).toBe([lead.foundBy?.email, lead.assignedTo?.email].includes('staff@tekmadev.test'));
    }
  });

  it('staff never get revenue: active subs and recent subscriptions are null, never zero', async () => {
    const owner = await overview();
    asStaff();
    const staff = await overview();
    expect(owner.kpis.activeSubs).toBeGreaterThan(0);
    expect(staff.kpis.activeSubs).toBeNull();
    expect(staff.recentSubscriptions).toBeNull();
    // Everything else on Home is the same for staff.
    expect({ ...staff.kpis, activeSubs: owner.kpis.activeSubs }).toEqual(owner.kpis);
    expect(staff.traffic).toEqual(owner.traffic);
    expect(staff.topLinks).toEqual(owner.topLinks);
  });

  it('has an empty meta fragment that matches its schema', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
  });

  it('exposes a query helper keyed under the domain name', () => {
    const options = overviewQuery();
    expect(options.queryKey).toEqual(['overview']);
    expect(overviewKeys.all[0]).toBe('overview');
  });
});

describe('GET /overview: KPIs match the lists', () => {
  it('total leads and booked calls are the Leads list counts', async () => {
    const o = await overview();
    const all = await walk<Lead>((cursor) => getLeads({ cursor, limit: 100 }));
    const booked = await walk<Lead>((cursor) => getLeads({ cursor, status: 'booked' }));
    expect(o.kpis.totalLeads).toBe(all.length);
    expect(o.kpis.bookedCalls).toBe(booked.length);
    expect(o.kpis.bookedCalls).toBeGreaterThan(0);
  });

  it('active subs counts live active, trialing and past due subscriptions, care plans included', async () => {
    const o = await overview();
    const subs = await walk<Subscription>((cursor) => getSubscriptions({ cursor, limit: 100 }));
    const live = subs.filter((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due');
    expect(o.kpis.activeSubs).toBe(live.length);
    expect(live.some((s) => s.kind === 'care')).toBe(true);
  });

  it('pageviews and the traffic block are GET /analytics?range=30d', async () => {
    const clock = freezeNow();
    try {
      const o = await overview();
      const a = await getAnalytics('30d');
      expect(o.kpis.pageviews30d).toBe(a.total);
      expect(o.traffic.series).toEqual(a.series);
      expect(o.traffic.series).toHaveLength(30);
      expect(o.traffic.topSources).toEqual(a.topSources);
      expect(o.traffic.topSources.length).toBeGreaterThan(7);
      expect(o.traffic.topPages).toEqual(a.topPages.slice(0, 10));
      expect(o.traffic.topPages.length).toBeLessThanOrEqual(10);
    } finally {
      clock.mockRestore();
    }
  });

  it('with no traffic yet, the traffic block is empty, not missing', async () => {
    analyticsMock.setEmpty(true);
    try {
      const o = await overview();
      expect(o.kpis.pageviews30d).toBe(0);
      expect(o.traffic.series).toHaveLength(30);
      expect(o.traffic.series.every((p) => p.count === 0)).toBe(true);
      expect(o.traffic.topSources).toEqual([]);
      expect(o.traffic.topPages).toEqual([]);
    } finally {
      analyticsMock.reset();
    }
  });

  it('a failed read is an error, never zeros', async () => {
    mockControls.failNextRequest('/overview');
    const error = await apiError(getOverview());
    expect(error.status).toBe(500);
    expect(error.code).toBe('unavailable');
    const o = await overview();
    expect(o.kpis.totalLeads).toBeGreaterThan(0);
  });
});

describe('GET /overview: recent rows', () => {
  it('recent leads are the first 8 rows of GET /leads', async () => {
    const o = await overview();
    const page = await getLeads({ limit: 8 });
    expect(o.recentLeads).toEqual(page.items);
    // A lead without a name (free tool) is still a row: the app shows the email.
    expect(o.recentLeads.some((l) => l.name === null)).toBe(true);
  });

  it('recent subscriptions are the first 8 rows of GET /billing/subscriptions', async () => {
    const o = await overview();
    const page = await getSubscriptions({ limit: 8 });
    expect(o.recentSubscriptions).toEqual(page.items);
    // Webline Care keeps its cents ($77.50).
    expect((o.recentSubscriptions ?? []).some((s) => s.kind === 'care' && s.amount.amount % 100 !== 0)).toBe(true);
  });
});

describe('GET /overview: inbox and needs-action', () => {
  it("the inbox block is the caller's own summary", async () => {
    const owner = await overview();
    expect(owner.inbox).toEqual(await getNotificationSummary());
    expect(owner.attention.needsAction).toBe(owner.inbox.needsAction);

    asManager();
    const manager = await overview();
    expect(manager.inbox).toEqual(await getNotificationSummary());
    expect(manager.attention.needsAction).toBe(manager.inbox.needsAction);
    // Managers read every category, like the owner.
    expect(manager.inbox.needsAction).toBe(owner.inbox.needsAction);

    asStaff();
    const staff = await overview();
    expect(staff.inbox).toEqual(await getNotificationSummary());
    expect(staff.attention.needsAction).toBe(staff.inbox.needsAction);
    // Staff only count their categories (Leads and Clients).
    expect(staff.inbox.needsAction).toBeLessThan(owner.inbox.needsAction);
  });
});

describe('GET /overview: client cards match the Clients screens', () => {
  async function realClients(): Promise<ClientRow[]> {
    return walk<ClientRow>((cursor) => getClients({ status: 'all', cursor, limit: 100 }));
  }

  it('blocked and behind pace match the Clients list stats and rows', async () => {
    const o = await overview();
    const first = await getClients({ status: 'all' });
    expect(o.attention.blockedOnboardings).toBe(first.stats.blocked);
    expect(o.attention.behindPace).toBe(first.stats.behindPace);

    const rows = await realClients();
    expect(rows.some((r) => r.isTest)).toBe(false);
    const blocked = rows.filter((r) => r.blocked && r.status !== 'churned').map((r) => r.id).sort();
    const behind = rows
      .filter((r) => r.status === 'live' && r.guarantee.status === 'behind' && r.guarantee.daysLeft > 0)
      .map((r) => r.id)
      .sort();
    expect(o.attentionClients.blockedOnboardings.map((c) => c.clientId).sort()).toEqual(blocked);
    expect(o.attentionClients.behindPace.map((c) => c.clientId).sort()).toEqual(behind);
    expect(blocked.length).toBeGreaterThan(0);
    expect(behind.length).toBeGreaterThan(0);
  });

  it('calls and intakes to review add up over every client detail', async () => {
    const o = await overview();
    const rows = await realClients();
    let calls = 0;
    const callsByClient = new Map<string, number>();
    const intakes: string[] = [];
    for (const row of rows) {
      const bundle = await getClient(row.id);
      calls += bundle.guarantee.needsReview;
      if (bundle.guarantee.needsReview > 0) callsByClient.set(row.id, bundle.guarantee.needsReview);
      if (bundle.intake?.status === 'submitted') intakes.push(row.id);
    }
    expect(o.attention.callsToReview).toBe(calls);
    expect(calls).toBeGreaterThan(0);
    expect(new Map(o.attentionClients.callsToReview.map((c) => [c.clientId, c.count]))).toEqual(callsByClient);
    expect(o.attention.intakesToReview).toBe(intakes.length);
    expect(o.attentionClients.intakesToReview.map((c) => c.clientId).sort()).toEqual(intakes.sort());
  });

  it('every card list has the length of its count, and links to the right section', async () => {
    const o = await overview();
    const { attention: a, attentionClients: lists } = o;
    expect(lists.blockedOnboardings).toHaveLength(a.blockedOnboardings);
    expect(lists.callsToReview.reduce((n, c) => n + c.count, 0)).toBe(a.callsToReview);
    expect(lists.intakesToReview).toHaveLength(a.intakesToReview);
    expect(lists.behindPace).toHaveLength(a.behindPace);

    const section = (url: string) => mapAdminUrl(url, 'manager');
    for (const c of lists.blockedOnboardings) expect(section(c.url)).toEqual({ pathname: '/clients/[id]', params: { id: c.clientId, section: 'onboarding' } });
    for (const c of lists.callsToReview) expect(section(c.url)).toEqual({ pathname: '/clients/[id]', params: { id: c.clientId, section: 'calls' } });
    for (const c of lists.intakesToReview) expect(section(c.url)).toEqual({ pathname: '/clients/[id]', params: { id: c.clientId, section: 'intake' } });
    for (const c of lists.behindPace) {
      expect(section(c.url)).toEqual({ pathname: '/clients/[id]', params: { id: c.clientId, section: 'calls' } });
      expect(c.counted).toBeLessThan(c.expectedByNow);
      expect(c.daysLeft).toBeGreaterThan(0);
    }
    // Most appointments waiting first.
    const counts = lists.callsToReview.map((c) => c.count);
    expect([...counts].sort((x, y) => y - x)).toEqual(counts);
  });

  it('managers and staff get the same client cards (test clients never count for anyone)', async () => {
    const owner = await overview();
    asManager();
    const manager = await overview();
    expect(manager.attentionClients).toEqual(owner.attentionClients);
    expect({ ...manager.attention, needsAction: 0 }).toEqual({ ...owner.attention, needsAction: 0 });
    asStaff();
    const staff = await overview();
    expect(staff.attentionClients).toEqual(owner.attentionClients);
    expect({ ...staff.attention, needsAction: 0 }).toEqual({ ...owner.attention, needsAction: 0 });
  });
});

describe('GET /overview: top tracking links', () => {
  it('owner: the busiest links over the same 30 days as the traffic block, from the click log', async () => {
    const o = await overview();
    const since = o.traffic.series[0].t;
    const top = o.topLinks;
    if (!top) throw new Error('owner should get topLinks');
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(10);

    const links = await getLinks();
    const expected = new Map<string, number>();
    for (const link of links) {
      const clicks = await walk<LinkClick>((cursor) => getLinkClicks({ linkId: link.id, cursor, limit: 100 }));
      const recent = clicks.filter((c) => torontoDateOf(c.at) >= since).length;
      if (recent > 0) expected.set(link.id, recent);
    }
    expect(new Map(top.map((l) => [l.id, l.count]))).toEqual(expected);
    // Busiest first; a link with no visits in the period is left out.
    const counts = top.map((l) => l.count);
    expect([...counts].sort((x, y) => y - x)).toEqual(counts);
    expect(top.some((l) => l.slug === 'email-sig')).toBe(false);
    // A link with no internal label still comes through (the app shows "/<slug>").
    expect(top.some((l) => l.label === null)).toBe(true);
    for (const l of top) expect(links.find((x) => x.id === l.id)?.slug).toBe(l.slug);
  });

  it('every role holds links.view, so managers and staff get the same top links', async () => {
    const owner = await overview();
    asManager();
    expect((await overview()).topLinks).toEqual(owner.topLinks);
    asStaff();
    expect((await overview()).topLinks).toEqual(owner.topLinks);
  });
});

describe('GET /overview: mutations show up on the next read', () => {
  it('reviewing a CRM appointment takes it off "Needs you"', async () => {
    const before = await overview();
    const target = before.attentionClients.callsToReview[0];
    const bundle = await getClient(target.clientId);
    const call = bundle.calls.find((c) => c.review === 'needs_review');
    if (!call) throw new Error('expected a call to review');
    await reviewCall(call.id, true);

    const after = await overview();
    expect(after.attention.callsToReview).toBe(before.attention.callsToReview - 1);
    const row = after.attentionClients.callsToReview.find((c) => c.clientId === target.clientId);
    expect(row?.count ?? 0).toBe(target.count - 1);
  });

  it('marking an intake reviewed clears its card', async () => {
    const before = await overview();
    const target = before.attentionClients.intakesToReview[0];
    const bundle = await getClient(target.clientId);
    if (!bundle.intake) throw new Error('expected an intake');
    await reviewIntake(bundle.intake.id);

    const after = await overview();
    expect(after.attention.intakesToReview).toBe(before.attention.intakesToReview - 1);
    expect(after.attentionClients.intakesToReview.some((c) => c.clientId === target.clientId)).toBe(false);
  });

  it('unblocking an onboarding clears its card', async () => {
    const before = await overview();
    const target = before.attentionClients.blockedOnboardings[0];
    const bundle = await getClient(target.clientId);
    if (!bundle.onboarding) throw new Error('expected a run');
    await updateOnboarding(bundle.onboarding.run.id, { blocked: false });

    const after = await overview();
    expect(after.attention.blockedOnboardings).toBe(before.attention.blockedOnboardings - 1);
    expect(after.attentionClients.blockedOnboardings.some((c) => c.clientId === target.clientId)).toBe(false);
    expect((await getClients({ status: 'all' })).stats.blocked).toBe(after.attention.blockedOnboardings);
  });

  it('handling a needs-action notification and reading one update the inbox block', async () => {
    const before = await overview();
    const action = await getNotifications({ filter: 'action' });
    await resolveNotification(action.items[0].id, true);
    const afterResolve = await overview();
    expect(afterResolve.attention.needsAction).toBe(before.attention.needsAction - 1);
    expect(afterResolve.inbox.needsAction).toBe(before.inbox.needsAction - 1);

    const unread = await getNotifications({ filter: 'unread' });
    await markNotificationsRead([unread.items[0].id]);
    const afterRead = await overview();
    expect(afterRead.inbox.unread).toBe(afterResolve.inbox.unread - 1);
    expect(afterRead.inbox).toEqual(await getNotificationSummary());
  });

  it('deleting a link drops it from the top links', async () => {
    const before = await overview();
    const busiest = before.topLinks?.[0];
    if (!busiest) throw new Error('expected a top link');
    await deleteLink(busiest.id);
    const after = await overview();
    expect(after.topLinks?.some((l) => l.id === busiest.id)).toBe(false);
    expect(after.topLinks).toHaveLength((before.topLinks?.length ?? 0) - 1);
  });
});
