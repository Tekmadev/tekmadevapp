import { metaFixture } from '@/api/mock/fixtures/leads';
import type { LeadsMeta, LeadStatus } from '@/api/schemas/leads';

import {
  addLeadErrors,
  addLeadInput,
  CALENDAR_STATUS_HINT,
  canClaimBooking,
  CLAIM_COPY,
  claimOutcome,
  claimSendsBooked,
  clearLeadFieldError,
  CONTACT_PROMPTS,
  dueByToday,
  editLeadErrors,
  editLeadPatch,
  EMPTY_ADD_LEAD,
  emptyLogTouch,
  finderOf,
  firstName,
  followUpBadge,
  followUpPatch,
  followUpPresets,
  followUpShort,
  followUpSpoken,
  followUpState,
  isFollowUpDue,
  isMe,
  isSettableStatus,
  isValidLeadPhone,
  LEAD_COPY,
  leadFormFrom,
  loggedMessage,
  logTouchErrors,
  logTouchInput,
  sameInstant,
  staffName,
  statusChoiceBlock,
  touchKindLabel,
  touchKindOptions,
} from '../outreach';

// Friday Oct 2, 2026, 10:00 AM in Toronto (EDT, UTC-4).
const now = new Date('2026-10-02T14:00:00Z');

describe('follow-up state (Toronto days)', () => {
  it('is overdue before today, today all day, upcoming after', () => {
    expect(followUpState('2026-10-01T20:00:00.000000Z', now)).toBe('overdue');
    // 9:00 AM today has passed: still "today", not overdue.
    expect(followUpState('2026-10-02T13:00:00.000000Z', now)).toBe('today');
    // 11:30 PM Toronto on Oct 2 is today; 12:30 AM on Oct 3 is tomorrow.
    expect(followUpState('2026-10-03T03:30:00.000Z', now)).toBe('today');
    expect(followUpState('2026-10-03T04:30:00.000Z', now)).toBe('upcoming');
    expect(followUpState(null, now)).toBeNull();
    expect(followUpState(undefined, now)).toBeNull();
    expect(followUpState('not a date', now)).toBeNull();
  });

  it('says it short on a row and in full to TalkBack', () => {
    expect(followUpShort('2026-09-30T14:00:00Z', now)).toBe('2d overdue');
    expect(followUpShort('2026-10-02T20:00:00Z', now)).toBe('Today');
    expect(followUpShort('2026-10-03T14:00:00Z', now)).toBe('Tomorrow');
    expect(followUpShort('2026-10-08T14:00:00Z', now)).toBe('Oct 8');
    expect(followUpShort('2027-01-08T14:00:00Z', now)).toBe('Jan 8, 2027');
    expect(followUpShort(null, now)).toBe('');
    expect(followUpSpoken('2026-10-01T14:00:00Z', now)).toBe('follow-up 1 day overdue');
    expect(followUpSpoken('2026-10-02T20:00:00Z', now)).toBe('follow-up today at 4:00 PM');
    expect(followUpSpoken('2026-10-03T13:00:00Z', now)).toBe('follow-up tomorrow at 9:00 AM');
    expect(followUpSpoken('2026-10-08T14:00:00Z', now)).toBe('follow-up Oct 8');
  });

  it('badges overdue in signal and today in gold, always with words', () => {
    expect(followUpBadge('2026-09-28T14:00:00Z', now)).toEqual({ label: 'Overdue', tone: 'signal' });
    expect(followUpBadge('2026-10-02T21:00:00Z', now)).toEqual({ label: 'Today', tone: 'gold' });
    expect(followUpBadge('2026-10-03T14:00:00Z', now)).toEqual({ label: 'Tomorrow', tone: 'muted' });
    expect(followUpBadge('2026-10-05T14:00:00Z', now)).toEqual({ label: 'In 3 days', tone: 'muted' });
    expect(followUpBadge(null, now)).toBeNull();
  });

  it('counts today and overdue as due', () => {
    expect(isFollowUpDue('2026-10-02T23:00:00Z', now)).toBe(true);
    expect(isFollowUpDue('2026-09-02T23:00:00Z', now)).toBe(true);
    expect(isFollowUpDue('2026-10-04T14:00:00Z', now)).toBe(false);
    expect(isFollowUpDue(null, now)).toBe(false);
  });
});

describe('dueByToday (the follow-up queue, soonest first)', () => {
  const row = (followUpAt: string | null) => ({ followUpAt });

  it('keeps the rows due by the end of today and knows the rest are later', () => {
    const rows = [row('2026-09-29T14:00:00Z'), row('2026-10-02T22:00:00Z'), row('2026-10-03T13:00:00Z'), row('2026-10-09T13:00:00Z')];
    const due = dueByToday(rows, now);
    expect(due.rows).toEqual([rows[0], rows[1]]);
    expect(due.complete).toBe(true);
  });

  it('asks for more while every loaded row is due', () => {
    const rows = [row('2026-09-29T14:00:00Z'), row('2026-10-02T15:00:00Z')];
    expect(dueByToday(rows, now)).toEqual({ rows, complete: false });
    expect(dueByToday([], now)).toEqual({ rows: [], complete: false });
  });
});

describe('follow-up edits', () => {
  it('compares instants whatever their precision', () => {
    expect(sameInstant('2026-10-08T14:00:00.000000Z', '2026-10-08T14:00:00.000Z')).toBe(true);
    expect(sameInstant('2026-10-08T14:00:00Z', '2026-10-08T14:15:00Z')).toBe(false);
    expect(sameInstant(null, null)).toBe(true);
    expect(sameInstant(null, '2026-10-08T14:00:00Z')).toBe(false);
  });

  it('patches only a change, and null clears', () => {
    expect(followUpPatch('2026-10-08T14:00:00.000000Z', '2026-10-08T14:00:00.000Z')).toBeNull();
    expect(followUpPatch(undefined, null)).toBeNull();
    expect(followUpPatch(null, '2026-10-09T13:00:00.000Z')).toEqual({ followUpAt: '2026-10-09T13:00:00.000Z' });
    expect(followUpPatch('2026-10-08T14:00:00Z', null)).toEqual({ followUpAt: null });
  });

  it('offers tomorrow, in 3 days and next week as Toronto dates', () => {
    expect(followUpPresets(now)).toEqual([
      { label: 'Tomorrow', date: '2026-10-03' },
      { label: 'In 3 days', date: '2026-10-05' },
      { label: 'Next week', date: '2026-10-09' },
    ]);
  });
});

describe('Add a lead', () => {
  it('needs a name or a business, and an email or a phone, in the server words', () => {
    expect(addLeadErrors(EMPTY_ADD_LEAD)).toEqual({ name: LEAD_COPY.name, email: LEAD_COPY.contact });
    expect(LEAD_COPY.name).toBe('Enter a name or a business.');
    expect(LEAD_COPY.contact).toBe('Enter an email or a phone number.');
    expect(addLeadErrors({ ...EMPTY_ADD_LEAD, business: 'Hamilton Hot Tubs', phone: '905 555 0142' })).toEqual({});
    expect(addLeadErrors({ ...EMPTY_ADD_LEAD, name: 'Dana', email: 'dana@example.com' })).toEqual({});
    expect(addLeadErrors({ ...EMPTY_ADD_LEAD, name: '   ', business: ' ', email: ' ', phone: ' ' })).toEqual({
      name: LEAD_COPY.name,
      email: LEAD_COPY.contact,
    });
  });

  it('checks the email, the phone and the lengths like POST /leads', () => {
    expect(addLeadErrors({ ...EMPTY_ADD_LEAD, name: 'Dana', email: 'dana@' }).email).toBe('Enter a valid email.');
    expect(addLeadErrors({ ...EMPTY_ADD_LEAD, name: 'Dana', phone: '555-01' }).phone).toBe('Enter a valid phone number.');
    expect(addLeadErrors({ ...EMPTY_ADD_LEAD, name: 'x'.repeat(121), phone: '6135550199' }).name).toBe(LEAD_COPY.nameLong);
    expect(addLeadErrors({ ...EMPTY_ADD_LEAD, name: 'Dana', phone: '6135550199', website: 'w'.repeat(301) }).website).toBe(
      LEAD_COPY.websiteLong,
    );
    expect(addLeadErrors({ ...EMPTY_ADD_LEAD, name: 'Dana', phone: '6135550199', message: 'm'.repeat(5001) }).message).toBe(
      LEAD_COPY.messageLong,
    );
  });

  it('takes phones with 7 to 15 digits and the usual punctuation', () => {
    expect(isValidLeadPhone('(613) 555-0199')).toBe(true);
    expect(isValidLeadPhone('+1 613.555.0199')).toBe(true);
    expect(isValidLeadPhone('555 0199')).toBe(true);
    expect(isValidLeadPhone('555 019')).toBe(false);
    expect(isValidLeadPhone('613 555 0199 ext 4')).toBe(false);
    expect(isValidLeadPhone('1234567890123456')).toBe(false);
  });

  it('sends trimmed values and leaves blanks out', () => {
    expect(
      addLeadInput({ ...EMPTY_ADD_LEAD, name: ' Dana Ruiz ', email: ' Dana@Example.com ', phone: '  ', need: 'website', message: ' Met at the home show. ' }),
    ).toEqual({ name: 'Dana Ruiz', email: 'dana@example.com', need: 'website', message: 'Met at the home show.' });
    expect(addLeadInput({ ...EMPTY_ADD_LEAD, business: 'Hot Tubs', phone: '905 555 0142', website: 'instagram.com/hottubs' })).toEqual({
      business: 'Hot Tubs',
      phone: '905 555 0142',
      website: 'instagram.com/hottubs',
    });
  });
});

describe('Edit lead', () => {
  type Shown = Parameters<typeof leadFormFrom>[0];
  const lead: Shown = {
    name: 'Olivia Martin',
    business: 'Martin Family Dentistry',
    email: 'Olivia.Martin@mailbox.test',
    phone: '+16135550101',
    website: null,
    need: 'customers',
    message: 'Wants more new patients.\nTwo chairs free on Fridays.',
  };

  it('starts from what the lead shows, no value as empty text', () => {
    expect(leadFormFrom(lead)).toEqual({
      name: 'Olivia Martin',
      business: 'Martin Family Dentistry',
      email: 'Olivia.Martin@mailbox.test',
      phone: '+16135550101',
      website: '',
      need: 'customers',
      message: 'Wants more new patients.\nTwo chairs free on Fridays.',
    });
    // A free tool lead with only an email, from an older server without website.
    const tool = leadFormFrom({ name: null, business: null, email: 'kim@example.test', phone: null, need: null, message: null });
    expect(tool).toEqual({ ...EMPTY_ADD_LEAD, email: 'kim@example.test' });
    // A lead added with only a phone shows email "".
    expect(leadFormFrom({ ...lead, email: '' }).email).toBe('');
  });

  it('sends nothing when nothing changed, the email in another casing and stray spaces included', () => {
    const form = leadFormFrom(lead);
    expect(editLeadPatch(lead, form)).toEqual({});
    expect(editLeadPatch(lead, { ...form, email: ' olivia.martin@MAILBOX.test ', name: ' Olivia Martin ' })).toEqual({});
  });

  it('sends only what changed: trimmed, a cleared field as null, the email lowercased', () => {
    const form = leadFormFrom(lead);
    expect(
      editLeadPatch(lead, {
        ...form,
        name: '  Olivia Martin-Roy ',
        email: ' Olivia@MartinDental.test ',
        website: ' martindental.test ',
        business: '  ',
        need: null,
      }),
    ).toEqual({ name: 'Olivia Martin-Roy', email: 'olivia@martindental.test', website: 'martindental.test', business: null, need: null });
    expect(editLeadPatch(lead, { ...form, need: 'website', message: 'Line one\nline two ' })).toEqual({
      need: 'website',
      message: 'Line one\nline two',
    });
  });

  it('keeps the two rules on the whole lead, in the server words', () => {
    const form = leadFormFrom(lead);
    expect(editLeadErrors(lead, form)).toEqual({});
    // The business still answers the name rule, the phone the email rule.
    expect(editLeadErrors(lead, { ...form, name: '', email: '' })).toEqual({});
    expect(editLeadErrors(lead, { ...form, name: '', business: ' ' })).toEqual({ name: LEAD_COPY.name });
    expect(editLeadErrors(lead, { ...form, email: '', phone: '' })).toEqual({ email: LEAD_COPY.contact });
    expect(editLeadErrors(lead, { ...form, name: '', business: '', email: '', phone: '' })).toEqual({
      name: LEAD_COPY.name,
      email: LEAD_COPY.contact,
    });
  });

  it('checks a changed field like Add a lead, and leaves a field nobody touched alone', () => {
    const form = leadFormFrom(lead);
    expect(editLeadErrors(lead, { ...form, email: 'olivia@' })).toEqual({ email: LEAD_COPY.email });
    expect(editLeadErrors(lead, { ...form, phone: '555-01' })).toEqual({ phone: LEAD_COPY.phone });
    expect(editLeadErrors(lead, { ...form, name: 'x'.repeat(121) })).toEqual({ name: LEAD_COPY.nameLong });
    expect(editLeadErrors(lead, { ...form, website: 'w'.repeat(301) })).toEqual({ website: LEAD_COPY.websiteLong });
    expect(editLeadErrors(lead, { ...form, message: 'm'.repeat(5001) })).toEqual({ message: LEAD_COPY.messageLong });
    // A website form once stored a phone the app would not take: editing the name does not block on it.
    const old: Shown = { ...lead, phone: 'call after 5', message: 'm'.repeat(6000) };
    const edited = { ...leadFormFrom(old), name: 'Olivia M.' };
    expect(editLeadErrors(old, edited)).toEqual({});
    expect(editLeadPatch(old, edited)).toEqual({ name: 'Olivia M.' });
  });

  it('measures the edits against the lead the form opened with, so a teammate\'s newer value stays', () => {
    // The form opened on phone A; a refetch then brought the teammate's phone B into the live lead.
    const opened: Shown = { ...lead, phone: '+16135550101' };
    const live: Shown = { ...lead, phone: '+16135550199' };
    const form = { ...leadFormFrom(opened), website: 'martindental.test' };
    // Against the snapshot only the website is sent; against the live lead phone A would undo B.
    expect(editLeadPatch(opened, form)).toEqual({ website: 'martindental.test' });
    expect(editLeadPatch(live, form)).toEqual({ phone: '+16135550101', website: 'martindental.test' });
  });

  it('clears an error and the rule it shares when typing', () => {
    const errors = { name: LEAD_COPY.name, email: LEAD_COPY.contact, phone: LEAD_COPY.phone };
    expect(clearLeadFieldError(errors, 'business')).toEqual({ email: LEAD_COPY.contact, phone: LEAD_COPY.phone });
    expect(clearLeadFieldError(errors, 'phone')).toEqual({ name: LEAD_COPY.name });
    expect(clearLeadFieldError(errors, 'website')).toBe(errors);
  });
});

describe('Log outreach', () => {
  const current = '2026-10-08T14:00:00.000000Z';

  it('starts from the lead follow-up and sends it only when it changed', () => {
    const form = emptyLogTouch('call', current);
    expect(form.followUpAt).toBe(current);
    expect(logTouchInput(form, current)).toEqual({ kind: 'call' });
    // The same moment at another precision is not a change.
    expect(logTouchInput({ ...form, followUpAt: '2026-10-08T14:00:00.000Z' }, current)).toEqual({ kind: 'call' });
    expect(logTouchInput({ ...form, followUpAt: null }, current)).toEqual({ kind: 'call', followUpAt: null });
    expect(logTouchInput({ ...form, followUpAt: '2026-10-09T13:00:00.000Z' }, current)).toEqual({
      kind: 'call',
      followUpAt: '2026-10-09T13:00:00.000Z',
    });
    expect(logTouchInput(emptyLogTouch('dm', undefined), undefined)).toEqual({ kind: 'dm' });
  });

  it('trims text, leaves blanks out and sends the time only when set', () => {
    const form = { ...emptyLogTouch('email', null, 'By text message.'), outcome: ' Sent pricing ', at: '2026-10-01T18:00:00.000Z' };
    expect(logTouchInput(form, null)).toEqual({ kind: 'email', outcome: 'Sent pricing', note: 'By text message.', at: '2026-10-01T18:00:00.000Z' });
    expect(logTouchInput({ ...form, outcome: '  ', note: '\n' }, null)).toEqual({ kind: 'email', at: '2026-10-01T18:00:00.000Z' });
  });

  it('caps the outcome and the note like the server', () => {
    expect(logTouchErrors(emptyLogTouch('call', null))).toEqual({});
    expect(logTouchErrors({ ...emptyLogTouch('call', null), outcome: 'o'.repeat(201) })).toEqual({ outcome: LEAD_COPY.outcomeLong });
    expect(logTouchErrors({ ...emptyLogTouch('call', null), note: 'n'.repeat(5001) })).toEqual({ note: LEAD_COPY.noteLong });
  });

  it('names the kind in the toast', () => {
    expect(loggedMessage('call', undefined)).toBe('Call logged.');
    expect(loggedMessage('dm', metaFixture)).toBe('DM logged.');
    expect(loggedMessage('other', metaFixture)).toBe('Outreach logged.');
  });
});

describe('labels and people', () => {
  it('reads touch kinds from meta, with the same words as a fallback', () => {
    expect(touchKindOptions(undefined).map((o) => o.label)).toEqual(['Call', 'Email', 'DM', 'Meeting', 'Other']);
    const older: LeadsMeta = { ...metaFixture, leadTouchKinds: undefined };
    expect(touchKindOptions(older)).toEqual(metaFixture.leadTouchKinds);
    const renamed: LeadsMeta = { ...metaFixture, leadTouchKinds: [{ value: 'dm', label: 'Message' }] };
    expect(touchKindLabel(renamed, 'dm')).toBe('Message');
    expect(touchKindLabel(renamed, 'call')).toBe('Call');
  });

  it('lets people set every status but cancelled', () => {
    const settable: LeadStatus[] = ['new', 'booked', 'contacted', 'qualified', 'won', 'lost'];
    expect(settable.every(isSettableStatus)).toBe(true);
    expect(isSettableStatus('cancelled')).toBe(false);
  });

  it('shows a name, else the email, and knows who is me', () => {
    expect(staffName({ email: 'noah@tekmadev.test', name: 'Noah Lavoie' })).toBe('Noah Lavoie');
    expect(staffName({ email: 'noah@tekmadev.test', name: ' ' })).toBe('noah@tekmadev.test');
    expect(isMe({ email: 'Noah@Tekmadev.test', name: null }, 'noah@tekmadev.test')).toBe(true);
    expect(isMe(null, 'noah@tekmadev.test')).toBe(false);
    expect(isMe({ email: 'maya@tekmadev.test', name: null }, undefined)).toBe(false);
  });
});

describe('"Log this call" after a one-tap contact', () => {
  it('maps each contact to a kind, and a text to a DM that says so', () => {
    expect(CONTACT_PROMPTS.call).toMatchObject({ kind: 'call', action: 'Log this call', note: '' });
    expect(CONTACT_PROMPTS.email).toMatchObject({ kind: 'email', action: 'Log this email', note: '' });
    expect(CONTACT_PROMPTS.text).toMatchObject({ kind: 'dm', action: 'Log this text', note: 'By text message.' });
    expect(CONTACT_PROMPTS.call.question('Olivia')).toBe('Called Olivia? Log it while it is fresh.');
  });

  it('uses the first name, else the title', () => {
    expect(firstName({ name: 'Olivia Martin' }, 'Olivia Martin')).toBe('Olivia');
    expect(firstName({ name: null }, 'Capital Window Cleaning')).toBe('Capital Window Cleaning');
  });
});

describe('commission credit on leads', () => {
  const NOAH = { email: 'staff@tekmadev.test', name: 'Noah Lavoie' };

  it('lets booked be picked by hand, except on a calendar lead that does not show booked', () => {
    const outreach = { source: 'outreach' as const, bookingAt: null, status: 'contacted' as const };
    expect(statusChoiceBlock(outreach, 'booked')).toBeNull();
    expect(statusChoiceBlock(outreach, 'cancelled')).toBe(CALENDAR_STATUS_HINT);
    const calendar = { source: 'cal_booking' as const, bookingAt: '2026-10-05T14:00:00Z', status: 'contacted' as const };
    expect(statusChoiceBlock(calendar, 'booked')).toBe(CALENDAR_STATUS_HINT);
    expect(statusChoiceBlock({ ...calendar, status: 'booked' }, 'booked')).toBeNull();
    // A form lead a booking was attached to belongs to the calendar too.
    expect(statusChoiceBlock({ source: 'grow', bookingAt: '2026-10-05T14:00:00Z', status: 'new' }, 'booked')).toBe(CALENDAR_STATUS_HINT);
    expect(statusChoiceBlock(calendar, 'qualified')).toBeNull();
  });

  it('reads the finder, falling back to who added an outreach lead on older servers', () => {
    expect(finderOf({ source: 'outreach', foundBy: NOAH, addedBy: null })).toEqual(NOAH);
    expect(finderOf({ source: 'outreach', foundBy: undefined, addedBy: NOAH })).toEqual(NOAH);
    expect(finderOf({ source: 'grow', foundBy: null, addedBy: undefined })).toBeNull();
  });

  it('offers "I booked this call" only on a booked lead the server says nobody booked', () => {
    expect(canClaimBooking({ status: 'booked', bookedBy: null })).toBe(true);
    expect(canClaimBooking({ status: 'booked', bookedBy: NOAH })).toBe(false);
    expect(canClaimBooking({ status: 'booked', bookedBy: undefined })).toBe(false);
    expect(canClaimBooking({ status: 'qualified', bookedBy: null })).toBe(false);
  });

  it('sends booked for a claim only when the lead read just now still shows booked with nobody holding the credit', () => {
    expect(claimSendsBooked({ status: 'booked', bookedBy: null })).toBe(true);
    // A stale screen: won, lost or contacted on the server is never moved back to booked.
    expect(claimSendsBooked({ status: 'won', bookedBy: null })).toBe(false);
    expect(claimSendsBooked({ status: 'contacted', bookedBy: null })).toBe(false);
    expect(claimSendsBooked({ status: 'booked', bookedBy: NOAH })).toBe(false);
  });

  it('says what a claim did with the website codes and copy', () => {
    const me = 'Staff@Tekmadev.test';
    expect(claimOutcome({ status: 'won', bookedBy: null }, me)).toEqual({ ok: false, code: 'not_booked', message: CLAIM_COPY.notBooked });
    expect(claimOutcome({ status: 'lost', bookedBy: NOAH }, me)).toMatchObject({ code: 'not_booked' });
    expect(claimOutcome({ status: 'booked', bookedBy: NOAH }, me)).toEqual({ ok: true, message: 'Booking recorded. The booking credit is yours.' });
    expect(claimOutcome({ status: 'booked', bookedBy: { email: 'ava@tekmadev.test', name: 'Ava Chen' } }, me)).toEqual({
      ok: false,
      code: 'booked_by_other',
      message: 'Ava Chen already has the booking credit.',
    });
    expect(claimOutcome({ status: 'booked', bookedBy: { email: 'ava@tekmadev.test', name: null } }, me)).toMatchObject({
      message: 'ava@tekmadev.test already has the booking credit.',
    });
    // Booked was sent but nobody was recorded (or an older server): never "yours".
    expect(claimOutcome({ status: 'booked', bookedBy: null }, me)).toEqual({ ok: false, code: 'not_recorded', message: CLAIM_COPY.notReady });
    expect(claimOutcome({ status: 'booked', bookedBy: undefined }, me)).toMatchObject({ code: 'not_recorded' });
    // Signed out (no email): someone else's credit.
    expect(claimOutcome({ status: 'booked', bookedBy: NOAH }, null)).toMatchObject({ code: 'booked_by_other' });
  });
});
