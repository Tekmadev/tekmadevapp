import type { LeadPatch, LogTouchInput, NewLeadInput } from '@/api/endpoints/leads';
import type { Lead, LeadNeed, LeadStatus, LeadsMeta, SettableLeadStatus, StaffRef, TouchKind } from '@/api/schemas/leads';
import type { Tone } from '@/design/tokens';
import { addDays, daysBetween, formatShortDate, formatTime, toDate, todayToronto, torontoDateOf } from '@/lib/dates';
import { countLabel } from '@/lib/format';
import { isValidEmail } from '@/lib/text';

/**
 * Pure helpers for outreach on leads (the website's docs/admin-api/outreach.md):
 * touch kinds, the statuses a person may set, follow-up states (overdue in
 * signal, today in gold), the "Add a lead" and "Log outreach" forms with the
 * server's own rules and copy, and the "Log this call" prompt after a one-tap
 * contact. No React Native here, so it is unit tested.
 */

/* ---------- touch kinds ---------- */

/** GET /meta `leadTouchKinds` fallback, same words as the server. */
export const TOUCH_KIND_LABELS: Record<TouchKind, string> = {
  call: 'Call',
  email: 'Email',
  dm: 'DM',
  meeting: 'Meeting',
  other: 'Other',
};

export const touchKindLabel = (meta: LeadsMeta | undefined, kind: TouchKind) =>
  meta?.leadTouchKinds?.find((k) => k.value === kind)?.label ?? TOUCH_KIND_LABELS[kind];

/** The kinds in the server's order, or the app's order before meta (or a meta from before outreach) loads. */
export function touchKindOptions(meta: LeadsMeta | undefined): { value: TouchKind; label: string }[] {
  return meta?.leadTouchKinds ?? (Object.keys(TOUCH_KIND_LABELS) as TouchKind[]).map((value) => ({ value, label: TOUCH_KIND_LABELS[value] }));
}

/** The toast after logging: "Call logged.", "DM logged.", "Outreach logged." for other. */
export function loggedMessage(kind: TouchKind, meta: LeadsMeta | undefined): string {
  return kind === 'other' ? 'Outreach logged.' : `${touchKindLabel(meta, kind)} logged.`;
}

/* ---------- statuses a person may set ---------- */

/**
 * Statuses a person may set (staff management, docs/admin-api/staff.md):
 * booked is settable by hand for a call booked by phone, DM or email.
 * Cancelled always mirrors the booking calendar (the server refuses it).
 */
export const SETTABLE_STATUSES: readonly SettableLeadStatus[] = ['new', 'booked', 'contacted', 'qualified', 'won', 'lost'];

export const isSettableStatus = (status: LeadStatus): status is SettableLeadStatus =>
  (SETTABLE_STATUSES as readonly LeadStatus[]).includes(status);

/** Shown under a status the booking calendar sets (it cannot be picked). */
export const CALENDAR_STATUS_HINT = 'Set by the booking calendar';

/** Shown under Booked when picking it books the call by hand (and gives the booking credit). */
export const BOOKED_BY_HAND_HINT = 'Booked by phone, DM or email';

/**
 * A lead the booking calendar owns: a Cal booking, or a lead a booking was
 * attached to. Its status drives the CRM's booked-call reminders, so the
 * calendar sets booked on it.
 */
export const isCalendarLead = (lead: Pick<Lead, 'source' | 'bookingAt'>) => lead.source === 'cal_booking' || lead.bookingAt !== null;

/**
 * Why a status cannot be picked for this lead, or null when it can:
 * cancelled never; booked not on a calendar lead that does not already show
 * booked (the server refuses it with the calendar message).
 */
export function statusChoiceBlock(lead: Pick<Lead, 'source' | 'bookingAt' | 'status'>, status: LeadStatus): string | null {
  if (!isSettableStatus(status)) return CALENDAR_STATUS_HINT;
  if (status === 'booked' && isCalendarLead(lead) && lead.status !== 'booked') return CALENDAR_STATUS_HINT;
  return null;
}

/** Who found the lead: `foundBy`, else (an older server) who added it by hand. */
export function finderOf(lead: Pick<Lead, 'source' | 'foundBy' | 'addedBy'>): StaffRef | null {
  if (lead.foundBy) return lead.foundBy;
  return lead.source === 'outreach' ? (lead.addedBy ?? null) : null;
}

/**
 * Whether "I booked this call" is offered: the lead shows booked and nobody
 * has the booking credit yet (a calendar booking from an outreach lead, or a
 * call booked before the credit existed). Sending booked records the caller.
 * Only when the server says nobody (null): an older server sends no
 * `bookedBy` at all and would refuse the status.
 */
export const canClaimBooking = (lead: Pick<Lead, 'status' | 'bookedBy'>) => lead.status === 'booked' && lead.bookedBy === null;

/* ---------- people ---------- */

/** A team member as leads show them: the name, else the email. */
export const staffName = (ref: StaffRef) => ref.name?.trim() || ref.email;

/** Whether a reference is the signed-in person (emails compare without case). */
export const isMe = (ref: StaffRef | null | undefined, myEmail: string | null | undefined) =>
  !!ref && !!myEmail && ref.email.trim().toLowerCase() === myEmail.trim().toLowerCase();

/* ---------- follow-ups ---------- */

/**
 * By Toronto calendar day: before today is overdue, any time today is today
 * (even once the hour has passed), later is upcoming. Null without a follow-up.
 */
export type FollowUpState = 'overdue' | 'today' | 'upcoming';

/** Calendar days from today to the follow-up (negative: overdue), or null. */
function followUpDays(instant: string | null | undefined, now: Date): number | null {
  const at = toDate(instant ?? null);
  if (!at) return null;
  return daysBetween(todayToronto(now), torontoDateOf(at));
}

export function followUpState(instant: string | null | undefined, now: Date): FollowUpState | null {
  const days = followUpDays(instant, now);
  if (days === null) return null;
  return days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming';
}

/** Overdue in signal, today in gold, later quiet. */
export const FOLLOW_UP_TONES: Record<FollowUpState, Tone> = { overdue: 'signal', today: 'gold', upcoming: 'muted' };

/** A list row's follow-up, short: "2d overdue", "Today", "Tomorrow", "Oct 8". Empty without one. */
export function followUpShort(instant: string | null | undefined, now: Date): string {
  const days = followUpDays(instant, now);
  if (days === null || !instant) return '';
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return formatShortDate(instant, now);
}

/** What TalkBack reads for a row's follow-up: "follow-up 2 days overdue", "follow-up today at 4:00 PM". */
export function followUpSpoken(instant: string | null | undefined, now: Date): string {
  const days = followUpDays(instant, now);
  if (days === null || !instant) return '';
  if (days < 0) return `follow-up ${countLabel(-days, 'day', 'days')} overdue`;
  if (days === 0) return `follow-up today at ${formatTime(instant)}`;
  if (days === 1) return `follow-up tomorrow at ${formatTime(instant)}`;
  return `follow-up ${formatShortDate(instant, now)}`;
}

/** The badge next to the follow-up on the lead: "Overdue", "Today", "Tomorrow", "In 3 days". */
export function followUpBadge(instant: string | null | undefined, now: Date): { label: string; tone: Tone } | null {
  const days = followUpDays(instant, now);
  if (days === null) return null;
  if (days < 0) return { label: 'Overdue', tone: 'signal' };
  if (days === 0) return { label: 'Today', tone: 'gold' };
  return { label: days === 1 ? 'Tomorrow' : `In ${countLabel(days, 'day', 'days')}`, tone: 'muted' };
}

/** "Follow-ups due": a follow-up today (any time) or on an earlier day. */
export const isFollowUpDue = (instant: string | null | undefined, now: Date) => {
  const state = followUpState(instant, now);
  return state === 'overdue' || state === 'today';
};

/**
 * The "Follow-ups due" rows from the follow-up queue (GET /leads?followUp=any,
 * soonest first): the ones due by the end of today. Once a loaded row is
 * later than today, every row after it is too, so `complete` says there is
 * nothing more to load. The server's `due` stops at this minute, which would
 * hide a call planned for later today.
 */
export function dueByToday<T extends Pick<Lead, 'followUpAt'>>(rows: readonly T[], now: Date): { rows: T[]; complete: boolean } {
  const due = rows.filter((row) => isFollowUpDue(row.followUpAt, now));
  return { rows: due, complete: due.length < rows.length };
}

/** One-tap dates in the follow-up sheet (Toronto calendar days; the time stays what was picked). */
export function followUpPresets(now: Date): { label: string; date: string }[] {
  const today = todayToronto(now);
  return [
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'In 3 days', date: addDays(today, 3) },
    { label: 'Next week', date: addDays(today, 7) },
  ];
}

/** The PATCH for a new follow-up (null clears it), or null when nothing changes. */
export function followUpPatch(current: string | null | undefined, next: string | null): LeadPatch | null {
  return sameInstant(current ?? null, next) ? null : { followUpAt: next };
}

/** Two instants (or nulls) for the same moment, whatever their precision ("…:00Z" vs "…:00.000000Z"). */
export function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  const ta = toDate(a)?.getTime();
  const tb = toDate(b)?.getTime();
  return ta !== undefined && ta === tb;
}

/* ---------- Add a lead (POST /leads) ---------- */

/** The server's copy (lib/admin-api/leads/input.ts), so local and server errors read the same. */
export const LEAD_COPY = {
  name: 'Enter a name or a business.',
  nameLong: 'Keep the name to 120 characters or fewer.',
  businessLong: 'Keep the business name to 200 characters or fewer.',
  contact: 'Enter an email or a phone number.',
  email: 'Enter a valid email.',
  phone: 'Enter a valid phone number.',
  websiteLong: 'Keep the website to 300 characters or fewer.',
  messageLong: 'Keep the note to 5,000 characters or fewer.',
  outcomeLong: 'Keep the outcome to 200 characters or fewer.',
  noteLong: 'Keep the note to 5,000 characters or fewer.',
} as const;

export const LIMITS = { name: 120, business: 200, website: 300, message: 5000, outcome: 200, note: 5000 } as const;

export type AddLeadForm = {
  name: string;
  business: string;
  email: string;
  phone: string;
  website: string;
  need: LeadNeed | null;
  /** What you know about them (the lead's `message`). */
  message: string;
};

export const EMPTY_ADD_LEAD: AddLeadForm = { name: '', business: '', email: '', phone: '', website: '', need: null, message: '' };

/** The server's phone rule: 7 to 15 digits, only digits, spaces, ( ) + . and -. */
export function isValidLeadPhone(input: string): boolean {
  const v = input.trim();
  const digits = v.replace(/\D/g, '').length;
  return v.length <= 40 && digits >= 7 && digits <= 15 && /^[\d\s()+.-]+$/.test(v);
}

/**
 * Inline errors before anything is sent, keyed like the server's `fields`
 * (name, business, email, phone, website, message): the same rules and words
 * as POST /leads, so a server error lands on the same field.
 */
export function addLeadErrors(form: AddLeadForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  const business = form.business.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();
  if (name.length > LIMITS.name) errors.name = LEAD_COPY.nameLong;
  else if (!name && !business) errors.name = LEAD_COPY.name;
  if (business.length > LIMITS.business) errors.business = LEAD_COPY.businessLong;
  if (email && (email.length > 254 || !isValidEmail(email))) errors.email = LEAD_COPY.email;
  else if (!email && !phone) errors.email = LEAD_COPY.contact;
  if (phone && !isValidLeadPhone(phone)) errors.phone = LEAD_COPY.phone;
  if (form.website.trim().length > LIMITS.website) errors.website = LEAD_COPY.websiteLong;
  if (form.message.trim().length > LIMITS.message) errors.message = LEAD_COPY.messageLong;
  return errors;
}

/** The POST body: trimmed, blanks left out (the server sets the source and assigns the lead to whoever adds it). */
export function addLeadInput(form: AddLeadForm): NewLeadInput {
  const input: NewLeadInput = {};
  const set = (key: 'name' | 'business' | 'email' | 'phone' | 'website' | 'message', value: string) => {
    const v = value.trim();
    if (v) input[key] = v;
  };
  set('name', form.name);
  set('business', form.business);
  set('email', form.email.toLowerCase());
  set('phone', form.phone);
  set('website', form.website);
  set('message', form.message);
  if (form.need) input.need = form.need;
  return input;
}

/* ---------- Log outreach (POST /leads/:id/touches) ---------- */

export type LogTouchForm = {
  kind: TouchKind;
  outcome: string;
  note: string;
  /** When it happened; null: now (the server's clock). */
  at: string | null;
  /** The next follow-up, starting from the lead's; null: none. */
  followUpAt: string | null;
};

export function emptyLogTouch(kind: TouchKind, followUpAt: string | null | undefined, note = ''): LogTouchForm {
  return { kind, outcome: '', note, at: null, followUpAt: followUpAt ?? null };
}

/** Inline errors before sending (lengths; the kind is always one of the five). */
export function logTouchErrors(form: LogTouchForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.outcome.trim().length > LIMITS.outcome) errors.outcome = LEAD_COPY.outcomeLong;
  if (form.note.trim().length > LIMITS.note) errors.note = LEAD_COPY.noteLong;
  return errors;
}

/**
 * The POST body. Blank text is left out, no time means now, and the follow-up
 * is sent only when it changed from the lead's (null clears it), so logging a
 * call never moves a follow-up nobody touched.
 */
export function logTouchInput(form: LogTouchForm, currentFollowUp: string | null | undefined): LogTouchInput {
  const input: LogTouchInput = { kind: form.kind };
  const outcome = form.outcome.trim();
  const note = form.note.trim();
  if (outcome) input.outcome = outcome;
  if (note) input.note = note;
  if (form.at) input.at = form.at;
  if (!sameInstant(currentFollowUp ?? null, form.followUpAt)) input.followUpAt = form.followUpAt;
  return input;
}

/* ---------- "Log this call" after a one-tap contact ---------- */

export type ContactChannel = 'call' | 'email' | 'text';

export type ContactPrompt = {
  kind: TouchKind;
  /** The button. */
  action: string;
  /** The line above it, with the lead's first name. */
  question: (name: string) => string;
  /** Pre-filled note (a text message is logged as a DM, so the note says which). */
  note: string;
};

export const CONTACT_PROMPTS: Record<ContactChannel, ContactPrompt> = {
  call: { kind: 'call', action: 'Log this call', question: (name) => `Called ${name}? Log it while it is fresh.`, note: '' },
  email: { kind: 'email', action: 'Log this email', question: (name) => `Emailed ${name}? Log it while it is fresh.`, note: '' },
  text: { kind: 'dm', action: 'Log this text', question: (name) => `Texted ${name}? Log it while it is fresh.`, note: 'By text message.' },
};

/** The first word of the lead's title ("Olivia Martin" to "Olivia"); a business or an email stays whole. */
export function firstName(lead: Pick<Lead, 'name'>, title: string): string {
  const name = lead.name?.trim();
  return name ? (name.split(/\s+/)[0] ?? name) : title;
}
