import type { Subscription } from '@/api/schemas/billing';
import type { Lead } from '@/api/schemas/leads';
import type { OverviewAttention } from '@/api/schemas/overview';

import {
  attentionCards,
  attentionCardSize,
  attentionHref,
  attentionLabel,
  ATTENTION_ORDER,
  formatKpi,
  humanize,
  kpiColumns,
  leadSourceLine,
  leadStatusBadge,
  leadTitle,
  subscriptionAmount,
  subscriptionStatusBadge,
  subscriptionTierLine,
} from '../logic';

const zero: OverviewAttention = { needsAction: 0, blockedOnboardings: 0, callsToReview: 0, intakesToReview: 0, behindPace: 0 };

describe('attentionCards', () => {
  it('is empty when nothing is waiting (the calm state)', () => {
    expect(attentionCards(zero)).toEqual([]);
  });

  it('hides zero cards and keeps the fixed order', () => {
    const cards = attentionCards({ ...zero, behindPace: 2, needsAction: 1, intakesToReview: 3 });
    expect(cards.map((c) => c.key)).toEqual(['needsAction', 'intakesToReview', 'behindPace']);
    expect(cards.map((c) => c.count)).toEqual([1, 3, 2]);
  });

  it('ignores negative or broken counts', () => {
    expect(attentionCards({ ...zero, callsToReview: -1, blockedOnboardings: Number.NaN })).toEqual([]);
  });

  it('uses singular and plural labels', () => {
    expect(attentionLabel('needsAction', 1)).toBe('Notification needs action');
    expect(attentionLabel('needsAction', 4)).toBe('Notifications need action');
    expect(attentionLabel('callsToReview', 1)).toBe('CRM appointment to review');
    expect(attentionLabel('behindPace', 2)).toBe('Clients behind pace');
  });

  it('opens the Inbox on Needs action and the clients list with a view otherwise', () => {
    expect(attentionHref('needsAction')).toEqual({ pathname: '/inbox', params: { filter: 'action' } });
    expect(attentionHref('blockedOnboardings')).toEqual({ pathname: '/customers', params: { segment: 'clients', view: 'blocked' } });
    expect(attentionHref('callsToReview')).toEqual({ pathname: '/customers', params: { segment: 'clients', view: 'review' } });
    expect(attentionHref('intakesToReview')).toEqual({ pathname: '/customers', params: { segment: 'clients', view: 'intake' } });
    expect(attentionHref('behindPace')).toEqual({ pathname: '/customers', params: { segment: 'clients', view: 'behind' } });
  });

  it('covers every attention count', () => {
    expect([...ATTENTION_ORDER].sort()).toEqual(Object.keys(zero).sort());
  });
});

describe('attentionCardSize', () => {
  it('fits two label lines at normal size', () => {
    expect(attentionCardSize(1)).toEqual({ width: 152, minHeight: 146 });
  });

  it('grows with the font scale, capped at 1.3', () => {
    const large = attentionCardSize(1.3);
    expect(large.width).toBe(198);
    expect(large.minHeight).toBe(167);
    expect(attentionCardSize(2)).toEqual(large);
  });

  it('never shrinks below the normal size', () => {
    expect(attentionCardSize(0.85)).toEqual(attentionCardSize(1));
  });
});

describe('formatKpi', () => {
  it('is exact below 100,000', () => {
    expect(formatKpi(0)).toBe('0');
    expect(formatKpi(1204)).toBe('1,204');
    expect(formatKpi(99_999)).toBe('99,999');
  });

  it('goes compact from 100,000', () => {
    expect(formatKpi(124_800)).toBe('124.8K');
    expect(formatKpi(2_500_000)).toBe('2.5M');
  });
});

describe('kpiColumns', () => {
  it('is 2 x 2 on a common phone at normal size', () => {
    expect(kpiColumns(360, 1)).toBe(2);
    expect(kpiColumns(412, 1.3)).toBe(2);
  });

  it('stacks on a narrow phone at the largest font size', () => {
    expect(kpiColumns(360, 1.3)).toBe(1);
  });

  it('caps the font scale at 1.3 like Text does', () => {
    expect(kpiColumns(412, 2)).toBe(kpiColumns(412, 1.3));
  });
});

describe('meta labels', () => {
  const meta = {
    leadStatuses: [{ value: 'booked' as const, label: 'Booked', tone: 'ok' as const }],
    leadSources: [{ value: 'cal_booking' as const, label: 'Booked call' }],
    billingSubscriptionStatuses: [{ value: 'past_due' as const, label: 'Past due', tone: 'warn' as const }],
  };

  it('reads the label and tone from GET /meta', () => {
    expect(leadStatusBadge(meta, 'booked')).toEqual({ label: 'Booked', tone: 'ok' });
    expect(subscriptionStatusBadge(meta, 'past_due')).toEqual({ label: 'Past due', tone: 'warn' });
  });

  it('falls back to readable text in a neutral tone before meta loads', () => {
    expect(leadStatusBadge(undefined, 'new')).toEqual({ label: 'New', tone: 'neutral' });
    expect(subscriptionStatusBadge(undefined, 'incomplete_expired')).toEqual({ label: 'Incomplete expired', tone: 'neutral' });
    expect(humanize('cal_booking')).toBe('Cal booking');
  });

  it('builds the source and campaign line', () => {
    const utm = { source: 'google', medium: 'cpc', campaign: 'fall-promo' };
    expect(leadSourceLine({ source: 'cal_booking', utm }, meta)).toBe('Booked call · fall-promo');
    expect(leadSourceLine({ source: 'cal_booking', utm: { ...utm, campaign: null } }, meta)).toBe('Booked call');
    expect(leadSourceLine({ source: 'grow', utm: { ...utm, campaign: '  ' } }, meta)).toBe('Grow');
  });
});

describe('rows', () => {
  it('titles a lead by name, else email', () => {
    const lead: Pick<Lead, 'name' | 'email'> = { name: 'Dana Ruiz', email: 'dana@example.com' };
    expect(leadTitle(lead)).toBe('Dana Ruiz');
    expect(leadTitle({ ...lead, name: null })).toBe('dana@example.com');
    expect(leadTitle({ ...lead, name: '  ' })).toBe('dana@example.com');
  });

  it('shows the exact amount with the interval', () => {
    const sub: Pick<Subscription, 'amount' | 'interval'> = { amount: { amount: 7750, currency: 'CAD' }, interval: 'month' };
    expect(subscriptionAmount(sub)).toBe('$77.50/mo');
    expect(subscriptionAmount({ amount: { amount: 497_000, currency: 'CAD' }, interval: 'year' })).toBe('$4,970/yr');
  });

  it('says when a cancelling subscription ends', () => {
    const now = new Date('2026-09-30T16:00:00Z');
    const base = { productName: 'Grow', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-10-30T16:00:00Z' };
    expect(subscriptionTierLine(base, now)).toBe('Grow');
    expect(subscriptionTierLine({ ...base, cancelAtPeriodEnd: true }, now)).toBe('Grow · Ending Oct 30');
  });
});
