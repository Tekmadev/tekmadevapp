import type { OverviewAttention } from '@/api/schemas/overview';
import { can, type Capability } from '@/auth/capabilities';
import type { Role } from '@/api/types';

import { ATTENTION_CAPABILITIES, attentionCards, KPI_OPENS, kpiRows, quickActionsHint, visibleKpis } from '../logic';

/** What each role holds by default (the fallback table GET /me falls back to). */
const as = (role: Role) => (cap: Capability) => can(role, cap);

const all: OverviewAttention = { needsAction: 2, blockedOnboardings: 1, callsToReview: 4, intakesToReview: 1, behindPace: 3 };

describe('Home by role (owner decision 2026-10-03)', () => {
  it('shows Active subs only with overview.revenue: four KPI cards for owners and managers, three for staff', () => {
    expect(visibleKpis(as('owner'))).toEqual(['totalLeads', 'bookedCalls', 'activeSubs', 'pageviews30d']);
    expect(visibleKpis(as('manager'))).toEqual(['totalLeads', 'bookedCalls', 'activeSubs', 'pageviews30d']);
    expect(visibleKpis(as('staff'))).toEqual(['totalLeads', 'bookedCalls', 'pageviews30d']);
  });

  it('follows the server list over the role when GET /me sends one', () => {
    const me = { role: 'staff' as const, capabilities: ['overview.view', 'overview.revenue'] };
    expect(visibleKpis((cap) => can(me, cap))).toContain('activeSubs');
    const narrowed = { role: 'owner' as const, capabilities: ['overview.view'] };
    expect(visibleKpis((cap) => can(narrowed, cap))).not.toContain('activeSubs');
  });

  it('opens each KPI card only where the person may go', () => {
    expect(KPI_OPENS).toEqual({ totalLeads: 'leads.view', bookedCalls: 'leads.view', activeSubs: 'billing.view', pageviews30d: 'analytics.view' });
    const staff = as('staff');
    expect(visibleKpis(staff).every((key) => staff(KPI_OPENS[key]))).toBe(true);
  });

  it('lays the cards out in rows of two, an odd last card on its own row', () => {
    expect(kpiRows(['a', 'b', 'c', 'd'])).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(kpiRows(['a', 'b', 'c'])).toEqual([['a', 'b'], ['c']]);
    expect(kpiRows([])).toEqual([]);
  });

  it('leaves out the review cards staff cannot act on', () => {
    expect(attentionCards(all, as('owner')).map((c) => c.key)).toEqual(['needsAction', 'blockedOnboardings', 'callsToReview', 'intakesToReview', 'behindPace']);
    expect(attentionCards(all, as('manager')).map((c) => c.key)).toEqual(['needsAction', 'blockedOnboardings', 'callsToReview', 'intakesToReview', 'behindPace']);
    expect(attentionCards(all, as('staff')).map((c) => c.key)).toEqual(['needsAction', 'blockedOnboardings', 'behindPace']);
    // Nothing they can act on is the calm state, not an error.
    expect(attentionCards({ ...all, needsAction: 0, blockedOnboardings: 0, behindPace: 0 }, as('staff'))).toEqual([]);
    expect(ATTENTION_CAPABILITIES.callsToReview).toContain('clients.calls.review');
    expect(ATTENTION_CAPABILITIES.intakesToReview).toContain('clients.intake.review');
  });

  it('describes the gold + by what this person may do', () => {
    expect(quickActionsHint([])).toBe('');
    expect(quickActionsHint(['Log a booked call'])).toBe('Log a booked call');
    expect(quickActionsHint(['New client', 'Log a booked call'])).toBe('New client and log a booked call');
    expect(quickActionsHint(['New client', 'Log a booked call', 'New post'])).toBe('New client, log a booked call and more');
  });
});
