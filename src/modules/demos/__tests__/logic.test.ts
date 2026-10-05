import type { DemoRequest } from '@/api/schemas/demos';

import {
  demoBusiness,
  demoFormErrors,
  demoFormFrom,
  demoFormHasText,
  demoPatchFrom,
  demoTarget,
  emptyDemoForm,
  newDemoInput,
} from '../demoForm';
import {
  DEMO_STATUS,
  demoEventByline,
  demoEventText,
  demoFilterCount,
  demoFilterParams,
  demoRowMeta,
  demoRowSubtitle,
  demoStatusBadge,
  demoSteps,
  demoTargetName,
  displayLink,
  isDemoLink,
  neededByBadge,
  toDemoFilter,
} from '../labels';

/** Noon in Toronto on Monday 2026-10-05. */
const NOW = new Date('2026-10-05T16:00:00.000Z');

const NONE = { edit: false, cancel: false, markShown: false, manage: false };

const demo = (over: Partial<DemoRequest> = {}): DemoRequest => ({
  id: 'd_1',
  status: 'requested',
  clientId: null,
  clientName: null,
  leadId: 'ld_1',
  leadName: 'Capital Window Cleaning',
  business: {
    name: 'Capital Window Cleaning',
    type: 'Window cleaning',
    area: 'Ottawa',
    offer: 'Windows and eavestroughs.',
    website: null,
    brand: 'Navy',
    customers: null,
  },
  wants: null,
  neededBy: null,
  demoUrl: null,
  builderEmail: null,
  builderNote: null,
  requestedBy: 'staff@tekmadev.test',
  requestedByName: 'Noah Lavoie',
  createdAt: '2026-10-05T14:00:00.000000Z',
  updatedAt: '2026-10-05T14:00:00.000000Z',
  readyAt: null,
  shownAt: null,
  cancelledAt: null,
  events: [],
  can: NONE,
  ...over,
});

describe('status copy (the contract words)', () => {
  it('labels and tones each status', () => {
    expect(DEMO_STATUS.building.label).toBe('Building');
    expect(DEMO_STATUS.ready).toEqual({ label: 'Ready to show', tone: 'ok' });
    expect(DEMO_STATUS.shown.label).toBe('Shown');
    expect(DEMO_STATUS.cancelled.label).toBe('Cancelled');
    expect(DEMO_STATUS.requested.tone).toBe('gold');
  });

  it('reads a status this build does not know as itself, never crashing', () => {
    expect(demoStatusBadge('on_hold')).toEqual({ label: 'on_hold', tone: 'neutral' });
  });
});

describe('the Demos segment filters', () => {
  it('maps each chip to the list query (Mine: your open requests)', () => {
    expect(demoFilterParams('open')).toEqual({ status: 'open' });
    expect(demoFilterParams('ready')).toEqual({ status: 'ready' });
    expect(demoFilterParams('mine')).toEqual({ status: 'open', mine: true });
    expect(demoFilterParams('all')).toEqual({ status: 'all' });
  });

  it('takes the counts from the response, and none for All', () => {
    const counts = { open: 5, requested: 2, building: 1, ready: 2, mine: 3 };
    expect(demoFilterCount('open', counts)).toBe(5);
    expect(demoFilterCount('ready', counts)).toBe(2);
    expect(demoFilterCount('mine', counts)).toBe(3);
    expect(demoFilterCount('all', counts)).toBeNull();
    // Not loaded: no count (never a made-up zero).
    expect(demoFilterCount('open', undefined)).toBeNull();
  });

  it('reads the route param', () => {
    expect(toDemoFilter('ready')).toBe('ready');
    expect(toDemoFilter('mine')).toBe('mine');
    expect(toDemoFilter('blocked')).toBeNull();
    expect(toDemoFilter(undefined)).toBeNull();
  });
});

describe('row lines', () => {
  it('shows the kind and area, then who it is for (when the name differs), who asked and when', () => {
    expect(demoRowSubtitle(demo())).toBe('Window cleaning · Ottawa');
    expect(demoRowMeta(demo(), NOW)).toBe('Noah Lavoie · 2 h ago');
    expect(demoRowMeta(demo({ clientName: 'Capital Cleaning Inc.' }), NOW)).toBe('For Capital Cleaning Inc. · Noah Lavoie · 2 h ago');
    expect(demoRowMeta(demo({ requestedByName: null }), NOW)).toBe('staff@tekmadev.test · 2 h ago');
  });

  it('prefers the client name to the lead name', () => {
    expect(demoTargetName(demo({ clientName: 'Acme', leadName: 'Acme lead' }))).toBe('Acme');
    expect(demoTargetName(demo({ clientName: null, leadName: '  ' }))).toBeNull();
  });
});

describe('needed by (Toronto calendar dates)', () => {
  it('flags late, today and tomorrow while open', () => {
    expect(neededByBadge('2026-10-03', 'building', NOW)).toEqual({ label: 'Late: needed by Oct 3', tone: 'signal' });
    expect(neededByBadge('2026-10-05', 'requested', NOW)).toEqual({ label: 'Needed today', tone: 'warn' });
    expect(neededByBadge('2026-10-06', 'ready', NOW)).toEqual({ label: 'Needed tomorrow', tone: 'gold' });
    expect(neededByBadge('2026-10-20', 'requested', NOW)).toEqual({ label: 'Needed by Oct 20', tone: 'neutral' });
  });

  it('stays quiet once closed, and is absent without a date', () => {
    expect(neededByBadge('2026-10-03', 'shown', NOW)).toEqual({ label: 'Needed by Oct 3', tone: 'muted' });
    expect(neededByBadge(null, 'requested', NOW)).toBeNull();
  });

  it('uses the Toronto day, not the phone day (late evening in Toronto is already tomorrow in UTC)', () => {
    const lateEvening = new Date('2026-10-06T02:30:00.000Z');
    expect(neededByBadge('2026-10-05', 'requested', lateEvening)).toEqual({ label: 'Needed today', tone: 'warn' });
  });
});

describe('builder steps follow can.manage only', () => {
  const manage = { ...NONE, edit: true, cancel: true, manage: true };

  it('offers the next step per status', () => {
    expect(demoSteps(demo({ status: 'requested', can: manage })).map((s) => [s.status, s.label])).toEqual([['building', 'Start building']]);
    expect(demoSteps(demo({ status: 'building', can: manage })).map((s) => [s.status, s.label])).toEqual([['ready', 'Mark ready to show']]);
    expect(demoSteps(demo({ status: 'ready', can: { ...manage, markShown: true } })).map((s) => [s.status, s.label])).toEqual([['building', 'Back to building']]);
  });

  it('offers nothing without can.manage, whatever the status or role', () => {
    for (const status of ['requested', 'building', 'ready', 'shown', 'cancelled'] as const) {
      expect(demoSteps(demo({ status, can: { ...NONE, edit: true, cancel: true, markShown: true } }))).toEqual([]);
    }
  });
});

describe('links', () => {
  it('opens https links only', () => {
    expect(isDemoLink('https://demos.tekmadev.test/acme')).toBe(true);
    expect(isDemoLink(' https://demos.tekmadev.test/acme ')).toBe(true);
    expect(isDemoLink('http://demos.tekmadev.test/acme')).toBe(false);
    expect(isDemoLink('javascript:alert(1)')).toBe(false);
    expect(isDemoLink(null)).toBe(false);
  });

  it('shows a link without the scheme', () => {
    expect(displayLink('https://www.demos.tekmadev.test/acme/')).toBe('demos.tekmadev.test/acme');
  });
});

describe('history lines', () => {
  const names = (email: string) => (email === 'manager@tekmadev.test' ? 'Maya Chen' : email);
  const line = (type: 'created' | 'edited' | 'status' | 'builder' | 'link', from: string | null = null, to: string | null = null) =>
    demoEventText({ type, from, to }, names);

  it('says what happened in plain words', () => {
    expect(line('created', null, 'requested')).toBe('Asked for a demo');
    expect(line('edited')).toBe('Edited the request');
    expect(line('status', 'requested', 'building')).toBe('Started building');
    expect(line('status', 'ready', 'building')).toBe('Moved back to building');
    expect(line('status', 'building', 'ready')).toBe('Marked it ready to show');
    expect(line('status', 'ready', 'shown')).toBe('Marked it as shown');
    expect(line('status', 'requested', 'cancelled')).toBe('Cancelled the request');
    expect(line('builder', null, 'manager@tekmadev.test')).toBe('Builder: Maya Chen');
    expect(line('builder', 'manager@tekmadev.test', null)).toBe('Removed the builder');
    expect(line('link', null, 'https://a.test/x')).toBe('Added the demo link');
    expect(line('link', 'https://a.test/x', 'https://a.test/y')).toBe('Changed the demo link');
    expect(line('link', 'https://a.test/x', null)).toBe('Removed the demo link');
  });

  it('names who did it, at Toronto time', () => {
    expect(demoEventByline({ by: 'staff@tekmadev.test', byName: 'Noah Lavoie', at: '2026-10-03T18:41:00.000000Z' }, NOW)).toBe('Noah Lavoie · Oct 3, 2:41 PM');
    expect(demoEventByline({ by: 'x@tekmadev.test', byName: null, at: '2026-10-03T18:41:00.000000Z' }, NOW)).toBe('x@tekmadev.test · Oct 3, 2:41 PM');
  });
});

describe('the form', () => {
  it('starts from the prefill (business name and area)', () => {
    const form = emptyDemoForm({ businessName: '  Acme Plumbing ', area: 'Hamilton' });
    expect(form).toMatchObject({ businessName: 'Acme Plumbing', area: 'Hamilton', businessType: '', offer: '', neededBy: null });
    expect(demoFormHasText(form, { businessName: 'Acme Plumbing', area: 'Hamilton' })).toBe(false);
    expect(demoFormHasText({ ...form, offer: 'Drains' }, { businessName: 'Acme Plumbing', area: 'Hamilton' })).toBe(true);
  });

  it('marks the four required fields and the limits, with the server keys and words', () => {
    expect(demoFormErrors(emptyDemoForm())).toEqual({
      businessName: 'Enter the business name.',
      businessType: 'Enter the kind of business.',
      area: 'Enter the city or area they serve.',
      offer: 'Say what they sell or do.',
    });
    const long = { ...emptyDemoForm({ businessName: 'A', area: 'B' }), businessType: 'x'.repeat(81), offer: 'o', wants: 'w'.repeat(2001) };
    expect(demoFormErrors(long)).toEqual({
      businessType: 'Keep this to 80 characters or fewer.',
      wants: 'Keep this to 2,000 characters or fewer.',
    });
  });

  it('needs exactly one target, the client first', () => {
    expect(demoTarget('cl_1', null)).toEqual({ clientId: 'cl_1' });
    expect(demoTarget('', 'ld_1')).toEqual({ leadId: 'ld_1' });
    expect(demoTarget('cl_1', 'ld_1')).toEqual({ clientId: 'cl_1' });
    expect(demoTarget(' ', undefined)).toBeNull();
  });

  it('builds the POST body: trimmed, blank optional fields as null', () => {
    const form = { ...emptyDemoForm({ businessName: ' Acme ', area: 'Hamilton' }), businessType: 'Plumber ', offer: ' Drains ', website: '  ', wants: ' A quote form ', neededBy: '2026-10-20' };
    expect(newDemoInput({ leadId: 'ld_1' }, form)).toEqual({
      leadId: 'ld_1',
      business: { name: 'Acme', type: 'Plumber', area: 'Hamilton', offer: 'Drains', website: null, brand: null, customers: null },
      wants: 'A quote form',
      neededBy: '2026-10-20',
    });
  });

  it('builds a PATCH with only what changed', () => {
    const d = demo();
    const same = demoFormFrom(d);
    expect(demoPatchFrom(d, same)).toEqual({});
    expect(demoPatchFrom(d, { ...same, area: 'Ottawa and Kanata', brand: ' ', wants: 'Photos', neededBy: '2026-10-09' })).toEqual({
      business: { area: 'Ottawa and Kanata', brand: null },
      wants: 'Photos',
      neededBy: '2026-10-09',
    });
    expect(demoBusiness(same)).toEqual(d.business);
  });
});
