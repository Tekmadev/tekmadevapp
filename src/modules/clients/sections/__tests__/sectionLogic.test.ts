import type { Activity, ActivityPage, Call, Client, Member } from '@/api/schemas/clients';

import { accountErrors, accountFormFrom, accountPatch, normalizeWebsite } from '../account/accountForm';
import { activityActor, activityContent, activityInput, activityMeta, mergeActivity } from '../activity/activityText';
import { callPatch, logCallErrors, logCallInput, CONTACT_REQUIRED, EMPTY_LOG_CALL, fromQualified, toQualified } from '../calls/callForm';
import {
  callContactLine,
  callDetailsLine,
  callTitle,
  guaranteeProgressLine,
  paceBadge,
  REVIEW_AGREE,
  REVIEW_COUNT,
  reviewAction,
  reviewBadge,
  reviewBannerText,
} from '../calls/callText';
import { crmChanged, crmDraftFrom, crmInput, isRemoval, parseCalendarIds, pendingLine } from '../crm/crmForm';
import { textOrNull, withoutField } from '../formText';
import { FALLBACK_LABELS, humanize, labelOf, resolveLabels, toneOf } from '../labels';
import { addedMessage, memberLinkAction, memberName, memberTimeline } from '../team/teamText';

const labels = FALLBACK_LABELS;
// Oct 2, 2026, noon in Toronto (EDT, UTC-4).
const NOW = new Date('2026-10-02T16:00:00Z');

/* ---------- labels and form text ---------- */

describe('labels', () => {
  it('falls back to the brief words when meta is missing or empty', () => {
    const resolved = resolveLabels({ callStatuses: [] });
    expect(resolved.callStatuses).toBe(FALLBACK_LABELS.callStatuses);
    expect(resolveLabels(undefined).memberRoles).toBe(FALLBACK_LABELS.memberRoles);
  });

  it('prefers meta lists when present', () => {
    const custom = [{ value: 'booked' as const, label: 'Booked in', tone: 'gold' as const }];
    expect(resolveLabels({ callStatuses: custom }).callStatuses).toBe(custom);
  });

  it('never shows a raw enum value', () => {
    expect(labelOf(labels.callStatuses, 'no_show')).toBe('No show');
    expect(labelOf([], 'call.logged')).toBe('Call logged');
    expect(humanize('out_of_area')).toBe('Out of area');
    expect(labelOf(labels.callStatuses, null)).toBe('');
  });

  it('reads tones with a fallback', () => {
    expect(toneOf(labels.memberStatuses, 'invited')).toBe('gold');
    expect(toneOf(labels.memberStatuses, 'unknown', 'muted')).toBe('muted');
  });
});

describe('form text', () => {
  it('turns blank text into null', () => {
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull(' Acme ')).toBe('Acme');
  });

  it('drops one field error and keeps the same map when absent', () => {
    const errors = { email: 'x', name: 'y' };
    expect(withoutField(errors, 'email')).toEqual({ name: 'y' });
    expect(withoutField(errors, 'title')).toBe(errors);
  });
});

/* ---------- calls ---------- */

const call = (over: Partial<Call> = {}): Call => ({
  id: 'call_1',
  clientId: 'cl_1',
  source: 'crm',
  contactName: 'Maya Chen',
  phone: '9055550142',
  email: 'maya@acme.ca',
  serviceRequested: 'Roof repair',
  bookedAt: '2026-09-28T13:05:00Z',
  bookedFor: '2026-10-02T14:00:00Z',
  status: 'booked',
  notes: null,
  qualified: null,
  disqualifiedReason: null,
  review: 'needs_review',
  counts: false,
  reviewedAt: null,
  reviewedBy: null,
  crmAppointmentId: 'apt_1',
  createdAt: '2026-09-28T13:05:00Z',
  updatedAt: '2026-09-28T13:05:00Z',
  ...over,
});

describe('call copy', () => {
  it('names the caller, else the phone or email', () => {
    expect(callTitle(call())).toBe('Maya Chen');
    expect(callTitle(call({ contactName: ' ' }))).toBe('(905) 555-0142');
    expect(callTitle(call({ contactName: null, phone: null }))).toBe('maya@acme.ca');
  });

  it('offers one review action, by whether the sync preset a reason', () => {
    expect(reviewAction(call())).toEqual({ counts: true, label: REVIEW_COUNT });
    expect(reviewAction(call({ disqualifiedReason: 'spam' }))).toEqual({ counts: false, label: REVIEW_AGREE });
    expect(REVIEW_COUNT).toBe('Real prospect, count it');
    expect(REVIEW_AGREE).toBe('Agree, it does not count');
  });

  it('labels the review badge like the brief', () => {
    expect(reviewBadge(call(), labels).label).toBe('Needs review');
    expect(reviewBadge(call({ review: 'disqualified', disqualifiedReason: 'out_of_area' }), labels).label).toBe('DQ: Out of area');
    expect(reviewBadge(call({ review: 'qualified', counts: true }), labels)).toEqual({ label: 'Counts', tone: 'ok' });
    expect(reviewBadge(call({ review: 'outside_window' }), labels).label).toBe('Outside window');
  });

  it('builds the source, time and service line in Toronto time', () => {
    expect(callDetailsLine(call(), labels, NOW)).toBe('CRM · booked Sep 28, 9:05 AM · for Oct 2, 10:00 AM · Roof repair');
    expect(callDetailsLine(call({ bookedFor: null, serviceRequested: null, source: 'manual' }), labels, NOW)).toBe('Manual · booked Sep 28, 9:05 AM');
  });

  it('builds the contact line and leaves out what is missing', () => {
    expect(callContactLine(call({ notes: 'Wants a quote\nfor the deck' }))).toBe('(905) 555-0142 · maya@acme.ca · Wants a quote for the deck');
    expect(callContactLine(call({ phone: null, email: null }))).toBe('');
  });

  it('describes the guarantee clock', () => {
    const base = { clockStarted: true, daysIn: 41, daysLeft: 19, expectedByNow: 20, windowDays: 60 };
    expect(guaranteeProgressLine(base)).toBe('41 days in, 19 left, 20 expected by now');
    expect(guaranteeProgressLine({ ...base, daysIn: 1 })).toBe('1 day in, 19 left, 20 expected by now');
    expect(guaranteeProgressLine({ ...base, clockStarted: false })).toBe('60 day window, clock not started');
  });

  it('shows a pace badge only once the clock runs', () => {
    expect(paceBadge({ status: 'behind' }, labels)).toEqual({ label: 'Behind pace', tone: 'warn' });
    expect(paceBadge({ status: 'on_pace' }, labels)?.label).toBe('On pace');
    expect(paceBadge({ status: 'met' }, labels)?.label).toBe('Met');
    expect(paceBadge({ status: 'not_started' }, labels)).toBeNull();
  });

  it('uses the brief review banner copy', () => {
    expect(reviewBannerText(3)).toBe(
      '3 appointments from the CRM waiting for your review. Nothing counts toward the guarantee until you confirm it.',
    );
    expect(reviewBannerText(1)).toMatch(/^1 appointment from the CRM/);
  });
});

describe('call forms', () => {
  it('maps qualified both ways', () => {
    expect(toQualified(null)).toBe('unset');
    expect(fromQualified(toQualified(true))).toBe(true);
    expect(fromQualified('no')).toBe(false);
  });

  it('patches only what changed', () => {
    const c = call({ status: 'booked', qualified: null, disqualifiedReason: 'spam', notes: 'Old' });
    expect(callPatch(c, { status: 'booked', qualified: 'unset', reason: 'spam', notes: 'Old ' })).toEqual({});
    expect(callPatch(c, { status: 'showed', qualified: 'yes', reason: 'spam', notes: '' })).toEqual({ status: 'showed', qualified: true, notes: null });
    // The preset reason is kept by the server, so it is not sent again.
    expect(callPatch(c, { status: 'booked', qualified: 'no', reason: 'spam', notes: 'Old' })).toEqual({ qualified: false });
    expect(callPatch(c, { status: 'booked', qualified: 'no', reason: 'fake', notes: 'Old' })).toEqual({ qualified: false, disqualifiedReason: 'fake' });
  });

  it('needs someone to call and a valid email', () => {
    expect(logCallErrors(EMPTY_LOG_CALL)).toEqual({ contactName: CONTACT_REQUIRED });
    expect(logCallErrors({ ...EMPTY_LOG_CALL, phone: '905 555 0142' })).toEqual({});
    expect(logCallErrors({ ...EMPTY_LOG_CALL, email: 'nope' })).toEqual({ email: 'Enter a valid email address.' });
  });

  it('sends only filled fields, with manual as the default source', () => {
    expect(logCallInput({ ...EMPTY_LOG_CALL, contactName: ' Sam ', bookedFor: '2026-10-05T14:00:00.000Z' })).toEqual({
      status: 'booked',
      source: 'manual',
      contactName: 'Sam',
      bookedFor: '2026-10-05T14:00:00.000Z',
    });
  });
});

/* ---------- CRM ---------- */

describe('CRM account form', () => {
  const crm = { locationId: 'abcdefghij0123456789', calendarIds: ['cal1', 'cal2'] };

  it('reads calendar ids one per line, without blanks or repeats', () => {
    expect(parseCalendarIds(' cal1\n\ncal2, cal1\n ')).toEqual(['cal1', 'cal2']);
    expect(parseCalendarIds('')).toEqual([]);
  });

  it('round-trips the server mapping', () => {
    const draft = crmDraftFrom(crm);
    expect(draft).toEqual({ locationId: crm.locationId, calendars: 'cal1\ncal2' });
    expect(crmChanged(crm, crmInput(draft))).toBe(false);
    expect(crmChanged(crm, crmInput({ ...draft, calendars: 'cal2\ncal1' }))).toBe(true);
  });

  it('treats a cleared id as removing the mapping', () => {
    const input = crmInput({ locationId: '  ', calendars: '' });
    expect(input).toEqual({ locationId: null, calendarIds: [] });
    expect(isRemoval(crm, input)).toBe(true);
    expect(isRemoval({ locationId: null }, input)).toBe(false);
  });

  it('counts appointments waiting to be applied', () => {
    expect(pendingLine(0)).toBe('0 appointments waiting to be applied');
    expect(pendingLine(1)).toBe('1 appointment waiting to be applied');
  });
});

/* ---------- team ---------- */

const member = (over: Partial<Member> = {}): Member => ({
  id: 'mem_1',
  clientId: 'cl_1',
  email: 'ops@acme.ca',
  name: null,
  title: null,
  role: 'member',
  status: 'invited',
  invitedAt: '2026-09-12T14:00:00Z',
  joinedAt: null,
  lastSeenAt: null,
  ...over,
});

describe('team copy', () => {
  it('uses the name, else the email', () => {
    expect(memberName(member())).toBe('ops@acme.ca');
    expect(memberName(member({ name: 'Ana Park' }))).toBe('Ana Park');
  });

  it('shows invited, joined and last seen, or no login yet', () => {
    expect(memberTimeline(member(), NOW)).toBe('Invited Sep 12 · no login yet');
    expect(memberTimeline(member({ joinedAt: '2026-09-13T14:00:00Z', lastSeenAt: '2026-10-02T14:00:00Z' }), NOW)).toBe(
      'Invited Sep 12 · Joined Sep 13 · Last seen 2 h ago',
    );
  });

  it('offers an invite or a reset link, never for someone turned off', () => {
    expect(memberLinkAction({ status: 'invited' })?.label).toBe('Resend invite');
    expect(memberLinkAction({ status: 'active' })?.label).toBe('Send reset link');
    expect(memberLinkAction({ status: 'disabled' })).toBeNull();
  });

  it('says what happened to the invite email', () => {
    expect(addedMessage('sent')).toEqual({ tone: 'ok', text: 'Person added. Invite sent.' });
    expect(addedMessage('failed').tone).toBe('err');
  });
});

/* ---------- account ---------- */

const client: Client = {
  id: 'cl_1',
  businessName: 'Acme Roofing',
  legalName: null,
  website: 'https://acme.ca',
  primaryEmail: 'owner@acme.ca',
  contactName: 'Dana',
  phone: null,
  industry: 'Roofing',
  status: 'onboarding',
  planId: 'grow',
  planName: 'Grow',
  isTest: false,
  timezone: 'America/Toronto',
  assignedStrategist: 'strat@tekmadev.com',
  liveDate: null,
  serviceArea: null,
  internalNotes: null,
  guaranteeEligible: true,
  guaranteeTarget: 30,
  guaranteeWindowDays: 60,
  guaranteeCountRule: 'booked',
  guaranteeStatus: 'not_started',
  guaranteeClockStartedOn: null,
  portalUrl: 'https://www.tekmadev.com/portal',
  createdAt: '2026-09-01T14:00:00Z',
  updatedAt: '2026-09-01T14:00:00Z',
  deletedAt: null,
};

describe('account form', () => {
  it('sends nothing when nothing changed', () => {
    expect(accountPatch(client, accountFormFrom(client))).toEqual({});
  });

  it('sends only what changed, with blanks as null', () => {
    const form = { ...accountFormFrom(client), industry: ' ', website: 'acme.com', guaranteeTarget: 25, internalNotes: 'VIP' };
    expect(accountPatch(client, form)).toEqual({ industry: null, website: 'https://acme.com', guaranteeTarget: 25, internalNotes: 'VIP' });
  });

  it('ignores case-only email changes', () => {
    const form = { ...accountFormFrom(client), primaryEmail: 'Owner@Acme.ca', assignedStrategist: 'STRAT@tekmadev.com' };
    expect(accountPatch(client, form)).toEqual({});
  });

  it('adds https to a bare domain only', () => {
    expect(normalizeWebsite('acme.ca/roofs')).toBe('https://acme.ca/roofs');
    expect(normalizeWebsite('http://acme.ca')).toBe('http://acme.ca');
    expect(normalizeWebsite('  ')).toBeNull();
  });

  it('checks the required fields and the guarantee numbers', () => {
    const errors = accountErrors({ ...accountFormFrom(client), businessName: ' ', primaryEmail: 'x', guaranteeTarget: null, guaranteeWindowDays: 400 });
    expect(Object.keys(errors).sort()).toEqual(['businessName', 'guaranteeTarget', 'guaranteeWindowDays', 'primaryEmail']);
    expect(accountErrors(accountFormFrom(client))).toEqual({});
  });
});

/* ---------- activity ---------- */

const entry = (id: string, over: Partial<Activity> = {}): Activity => ({
  id,
  clientId: 'cl_1',
  kind: 'event',
  event: 'call.logged',
  summary: `Summary ${id}`,
  subject: null,
  text: null,
  actionUrl: null,
  visibleToClient: false,
  actor: { kind: 'staff', name: 'Maya Chen', email: 'maya@tekmadev.com' },
  createdAt: '2026-09-30T18:41:00Z',
  ...over,
});

describe('activity', () => {
  it('names the actor', () => {
    expect(activityActor({ kind: 'system', name: null, email: null })).toBe('System');
    expect(activityActor({ kind: 'client', name: null, email: 'a@b.co' })).toBe('a@b.co');
    expect(activityActor({ kind: 'client', name: null, email: null })).toBe('Client');
  });

  it('builds "time · actor · event"', () => {
    expect(activityMeta(entry('a'), labels, NOW)).toBe('Sep 30, 2:41 PM · Maya Chen · Call logged');
  });

  it('shows full note text and leads updates with the subject', () => {
    expect(activityContent(entry('a'))).toEqual({ heading: null, body: 'Summary a' });
    expect(activityContent(entry('b', { kind: 'note', text: 'Full note' }))).toEqual({ heading: null, body: 'Full note' });
    expect(activityContent(entry('c', { kind: 'update', subject: 'Site is live', text: 'Take a look.' }))).toEqual({
      heading: 'Site is live',
      body: 'Take a look.',
    });
  });

  it('merges the first page with older pages, dropping repeats', () => {
    const older: ActivityPage[] = [{ items: [entry('b'), entry('c')], nextCursor: 'x' }, { items: [entry('d')], nextCursor: null }];
    expect(mergeActivity([entry('new'), entry('a'), entry('b')], older).map((a) => a.id)).toEqual(['new', 'a', 'b', 'c', 'd']);
  });

  it('sends subject and link with updates only', () => {
    const form = { subject: ' Hello ', text: ' Body ', link: '' };
    expect(activityInput('note', form)).toEqual({ kind: 'note', text: 'Body' });
    expect(activityInput('update', form)).toEqual({ kind: 'update', text: 'Body', subject: 'Hello', actionUrl: null });
  });
});
