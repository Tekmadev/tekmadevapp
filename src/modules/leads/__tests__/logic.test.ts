import { metaFixture } from '@/api/mock/fixtures/leads';
import type { Lead, LeadsMeta } from '@/api/schemas/leads';

import {
  asksQualifiers,
  bookingDistance,
  contactLinks,
  copyTargets,
  hasFilters,
  isUpcoming,
  needLabel,
  needOptions,
  newClientParams,
  NO_FILTERS,
  referrerText,
  revenueLabel,
  rowMeta,
  rowSubtitle,
  showsLeadForms,
  sourceLabel,
  sourceOptions,
  statusBadge,
  statusOptions,
  toLeadsView,
  uniqueById,
  VIEW_INFO,
} from '../logic';

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'ld_1',
  name: 'Maya Chen',
  email: 'maya@chenplumbing.test',
  phone: '+16135550171',
  business: 'Chen Plumbing',
  status: 'new',
  source: 'grow',
  need: 'website',
  revenue: 'under_10k',
  message: null,
  bookingAt: null,
  createdAt: '2026-10-02T14:00:00.000000Z',
  utm: { source: null, medium: null, campaign: null },
  referrer: null,
  convertedClientId: null,
  ...over,
});

describe('labels', () => {
  it('uses the brief tables before meta has loaded', () => {
    expect(sourceLabel(undefined, 'portal_signup')).toBe('Portal sign-up');
    expect(needLabel(undefined, 'unsure')).toBe('Not sure yet, I want to talk it through');
    expect(revenueLabel(undefined, '100k_plus')).toBe('$100K+ a month');
    expect(statusBadge(undefined, 'new')).toEqual({ label: 'New', tone: 'gold' });
    expect(statusBadge(undefined, 'booked')).toEqual({ label: 'Booked', tone: 'ok' });
    expect(statusBadge(undefined, 'lost').tone).toBe('muted');
  });

  it('prefers GET /meta when it is there', () => {
    const meta: LeadsMeta = {
      ...metaFixture,
      leadSources: metaFixture.leadSources.map((o) => (o.value === 'grow' ? { ...o, label: 'Grow form' } : o)),
      leadStatuses: metaFixture.leadStatuses.map((o) => (o.value === 'won' ? { ...o, label: 'Client', tone: 'ok' } : o)),
    };
    expect(sourceLabel(meta, 'grow')).toBe('Grow form');
    expect(statusBadge(meta, 'won')).toEqual({ label: 'Client', tone: 'ok' });
    expect(sourceOptions(meta).find((o) => o.value === 'grow')?.label).toBe('Grow form');
  });

  it('agrees with the mock meta, so nothing changes when meta lands', () => {
    for (const o of metaFixture.leadSources) expect(sourceLabel(undefined, o.value)).toBe(o.label);
    for (const o of metaFixture.leadNeeds) expect(needLabel(undefined, o.value)).toBe(o.label);
    for (const o of metaFixture.leadRevenueBands) expect(revenueLabel(undefined, o.value)).toBe(o.label);
    for (const o of metaFixture.leadStatuses) expect(statusBadge(undefined, o.value)).toEqual({ label: o.label, tone: o.tone });
    expect(statusOptions(undefined).map((o) => o.value)).toEqual(metaFixture.leadStatuses.map((o) => o.value));
    expect(needOptions(undefined)).toEqual(metaFixture.leadNeeds);
  });
});

describe('filters', () => {
  it('knows when anything narrows the list', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, q: 'chen' })).toBe(true);
    expect(hasFilters({ ...NO_FILTERS, need: 'custom' })).toBe(true);
  });

  it('shows Lead forms only while the source filter can include them and is not them', () => {
    expect(showsLeadForms(null)).toBe(true);
    expect(showsLeadForms('grow')).toBe(false);
    expect(showsLeadForms('cal_booking')).toBe(false);
  });

  it("reads Home's quick filter and ignores anything else", () => {
    expect(toLeadsView('booked')).toBe('booked');
    expect(VIEW_INFO.booked.status).toBe('booked');
    expect(toLeadsView('blocked')).toBeNull();
    expect(toLeadsView(undefined)).toBeNull();
    expect(toLeadsView(['booked'])).toBeNull();
  });
});

describe('rows', () => {
  it('keeps each lead once across pages, in order', () => {
    const a = lead({ id: 'a' });
    const b = lead({ id: 'b' });
    const c = lead({ id: 'c' });
    expect(uniqueById([{ items: [a, b] }, { items: [b, c] }]).map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(uniqueById(undefined)).toEqual([]);
  });

  it('shows the business, else the email under a name, never the email twice', () => {
    expect(rowSubtitle(lead())).toBe('Chen Plumbing');
    expect(rowSubtitle(lead({ business: '  ' }))).toBe('maya@chenplumbing.test');
    expect(rowSubtitle(lead({ business: null, name: null }))).toBeUndefined();
  });

  it('says the source and how long ago', () => {
    const now = new Date('2026-10-02T17:30:00Z');
    expect(rowMeta(lead(), undefined, now)).toBe('Lead form · 3 h ago');
  });
});

describe('detail', () => {
  it('asks need and revenue only where the form does', () => {
    expect(asksQualifiers(lead({ source: 'cal_booking', need: null, revenue: null }))).toBe(true);
    expect(asksQualifiers(lead({ source: 'lead_magnet', need: null, revenue: null }))).toBe(false);
    expect(asksQualifiers(lead({ source: 'portal_signup', need: 'custom', revenue: null }))).toBe(true);
  });

  it('builds call, text and email links, or none', () => {
    expect(contactLinks(lead())).toEqual({ call: 'tel:+16135550171', text: 'sms:+16135550171', email: 'mailto:maya@chenplumbing.test' });
    expect(contactLinks(lead({ phone: null, email: 'not an email' }))).toEqual({ call: null, text: null, email: null });
  });

  it('copies the email, then the phone number', () => {
    expect(copyTargets(lead())).toEqual([
      { kind: 'email', value: 'maya@chenplumbing.test', shown: 'maya@chenplumbing.test' },
      { kind: 'phone', value: '+16135550171', shown: '(613) 555-0171' },
    ]);
    expect(copyTargets(lead({ phone: null })).map((t) => t.kind)).toEqual(['email']);
  });

  it('pre-fills New client with what the lead has', () => {
    expect(newClientParams(lead())).toEqual({
      businessName: 'Chen Plumbing',
      email: 'maya@chenplumbing.test',
      name: 'Maya Chen',
      phone: '+16135550171',
    });
    expect(newClientParams(lead({ business: null, name: ' ', phone: null }))).toEqual({ email: 'maya@chenplumbing.test' });
  });

  it('tells upcoming calls from past ones', () => {
    const now = new Date('2026-10-02T14:00:00Z');
    expect(isUpcoming('2026-10-03T13:00:00.000000Z', now)).toBe(true);
    expect(isUpcoming('2026-10-01T13:00:00.000000Z', now)).toBe(false);
  });

  it('says how far the call is by Toronto day, without repeating the time', () => {
    // 10:00 AM in Toronto (EDT).
    const now = new Date('2026-10-02T14:00:00Z');
    expect(bookingDistance('2026-10-02T14:25:00.000000Z', now)).toBe('in 25 min');
    expect(bookingDistance('2026-10-02T20:00:00.000000Z', now)).toBe('today');
    expect(bookingDistance('2026-10-02T13:00:00.000000Z', now)).toBe('earlier today');
    // 11:30 PM Toronto on Oct 2 is still today; 12:30 AM on Oct 3 is tomorrow.
    expect(bookingDistance('2026-10-03T03:30:00.000000Z', now)).toBe('today');
    expect(bookingDistance('2026-10-03T04:30:00.000000Z', now)).toBe('tomorrow');
    expect(bookingDistance('2026-10-05T14:00:00.000000Z', now)).toBe('in 3 days');
    expect(bookingDistance('2026-10-01T14:00:00.000000Z', now)).toBe('yesterday');
    expect(bookingDistance('2026-09-28T14:00:00.000000Z', now)).toBe('4 days ago');
  });

  it('names a direct visit instead of leaving the referrer blank', () => {
    expect(referrerText(null)).toBe('Direct visit');
    expect(referrerText('https://www.google.com/')).toBe('https://www.google.com/');
  });
});
