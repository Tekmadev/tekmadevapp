import { zLeadNeed, zLeadRevenue, zLeadSource, zLeadStatus, zTouchKind, type Lead, type LeadStatus, type StaffRef, type Touch, type TouchKind } from '../../schemas/leads';
import { findLead, leadAssignees, leadsDb, leadTouchesDb } from '../fixtures/leads';
import { requireAnyCap, requireCap } from '../permissions';
import { byNewest, fail, matches, mockId, nowIso, ok, paginate, type MockContext, type MockResult, type MockRoute } from '../router';

/**
 * Mock routes for the "leads" domain (contract section 11, Customers) and its
 * outreach endpoints (the website's docs/admin-api/outreach.md, mirrored from
 * lib/admin-api/leads): POST /leads, PATCH /leads/:id, GET and POST
 * /leads/:id/touches, GET /leads/assignees, and the `assigned` and `followUp`
 * filters. Same capabilities, rules, codes and messages as the server.
 * Search and filters run here, like on the server. Unknown filter values are a
 * 400 rather than a silent empty list.
 */

/** The server's copy (lib/admin-api/leads/input.ts MESSAGES). */
const M = {
  status: 'Unknown lead status.',
  statusFromCalendar: 'Booked and cancelled come from the booking calendar. Pick another status.',
  followUpAt: 'Enter a valid follow-up time.',
  assignedTo: 'Pick someone on the team.',
  need: 'Unknown lead need.',
  revenue: 'Unknown revenue band.',
  name: 'Enter a name or a business.',
  nameLong: 'Keep the name to 120 characters or fewer.',
  businessLong: 'Keep the business name to 200 characters or fewer.',
  contact: 'Enter an email or a phone number.',
  email: 'Enter a valid email.',
  phone: 'Enter a valid phone number.',
  websiteLong: 'Keep the website to 300 characters or fewer.',
  messageLong: 'Keep the note to 5,000 characters or fewer.',
  duplicate: 'That email is already a lead. Find it in Leads and log the touch there.',
  kind: 'Pick a call, email, DM, meeting or other.',
  outcomeLong: 'Keep the outcome to 200 characters or fewer.',
  noteLong: 'Keep the note to 5,000 characters or fewer.',
  at: 'Enter a valid time for the touch.',
  atFuture: 'That time is in the future.',
  atOld: 'Log touches from the last year only.',
  assigned: 'Unknown assignee.',
  followUp: 'Unknown follow-up filter.',
  cursor: 'That page is out of date. Pull to refresh.',
  notFound: 'That lead no longer exists.',
} as const;

const SETTABLE: readonly LeadStatus[] = ['new', 'contacted', 'qualified', 'won', 'lost'];
/** Logging one of these on a "new" lead makes it "contacted" (server rule). */
const CONTACT_KINDS: readonly TouchKind[] = ['call', 'email', 'dm', 'meeting'];
const FOLLOW_UP_FILTERS = ['due', 'upcoming', 'any'] as const;
type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

const DAY_MS = 86_400_000;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Milliseconds of an ISO instant with a zone (microseconds cut to milliseconds), or NaN. */
function instantMs(value: string): number {
  return ISO_INSTANT_RE.test(value) ? Date.parse(value.replace(/(\.\d{3})\d+/, '$1')) : NaN;
}

const notFound = () => fail(404, 'not_found', M.notFound);

/* ---------- body validation, the server's zod rules by hand ---------- */

/** "followUpAt" -> "follow_up_at": the server's error code for a bad field. */
const snakeCase = (field: string) => field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/**
 * Collects field issues in body order; the first one is the error's code and
 * message (validationError). Like zod, a wrong type or an unknown enum value
 * "aborts": the cross-field rules (superRefine) then do not run. A value of
 * the right type that fails a check (too long, not an email) does not.
 */
class Issues {
  private list: { field: string; message: string }[] = [];
  private abort = false;
  add(field: string, message: string, aborts = false) {
    this.list.push({ field, message });
    if (aborts) this.abort = true;
  }
  get found() {
    return this.list.length > 0;
  }
  get aborted() {
    return this.abort;
  }
  result(): MockResult {
    const fields: Record<string, string> = {};
    for (const i of this.list) if (!(i.field in fields)) fields[i.field] = i.message;
    const first = this.list[0];
    return fail(400, snakeCase(first.field), first.message, fields);
  }
}

/** Absent stays undefined; null or blank is null; anything else is the trimmed string, or an issue. */
function text(body: Record<string, unknown>, field: string, issues: Issues, max: number, tooLong: string): string | null | undefined {
  if (!(field in body) || body[field] === undefined) return undefined;
  const v = body[field];
  if (v === null || (typeof v === 'string' && v.trim() === '')) return null;
  if (typeof v !== 'string' || v.trim().length > max) {
    issues.add(field, tooLong, typeof v !== 'string');
    return undefined;
  }
  return v.trim();
}

/** Whether a field was given for the cross-field rules: any non-blank string, valid or not (as zod sees it). */
function given(body: Record<string, unknown>, field: string): boolean {
  const v = body[field];
  return typeof v === 'string' && v.trim() !== '';
}

function email(body: Record<string, unknown>, issues: Issues): string | null | undefined {
  const v = text(body, 'email', issues, 254, M.email);
  if (typeof v === 'string' && !EMAIL_RE.test(v)) {
    issues.add('email', M.email);
    return undefined;
  }
  return typeof v === 'string' ? v.toLowerCase() : v;
}

function phone(body: Record<string, unknown>, issues: Issues): string | null | undefined {
  const v = text(body, 'phone', issues, 40, M.phone);
  if (typeof v === 'string') {
    const digits = v.replace(/\D/g, '').length;
    if (digits < 7 || digits > 15 || !/^[\d\s()+.-]+$/.test(v)) {
      issues.add('phone', M.phone);
      return undefined;
    }
  }
  return v;
}

function oneOf<T extends string>(body: Record<string, unknown>, field: string, values: readonly T[], issues: Issues, message: string): T | null | undefined {
  if (!(field in body) || body[field] === undefined) return undefined;
  const v = body[field];
  if (v === null || v === '') return null;
  if (typeof v === 'string' && (values as readonly string[]).includes(v)) return v as T;
  issues.add(field, message, true);
  return undefined;
}

/** A status a person may set. Not blank-to-null on the server: "" is an unknown status. */
function settableStatus(body: Record<string, unknown>, issues: Issues): LeadStatus | undefined {
  if (!('status' in body) || body.status === undefined) return undefined;
  const v = body.status;
  if (typeof v === 'string' && SETTABLE.includes(v as LeadStatus)) return v as LeadStatus;
  issues.add('status', v === 'booked' || v === 'cancelled' ? M.statusFromCalendar : M.status, true);
  return undefined;
}

/** An instant from 2020 to ten years out, or null (blank) to clear. */
function followUpAt(body: Record<string, unknown>, issues: Issues): string | null | undefined {
  if (!('followUpAt' in body) || body.followUpAt === undefined) return undefined;
  const v = body.followUpAt;
  if (v === null || (typeof v === 'string' && v.trim() === '')) return null;
  const ms = typeof v === 'string' ? instantMs(v.trim()) : NaN;
  if (!Number.isFinite(ms) || ms < Date.UTC(2020, 0, 1) || ms > Date.now() + 10 * 365 * DAY_MS) {
    issues.add('followUpAt', M.followUpAt, typeof v !== 'string');
    return undefined;
  }
  return (v as string).trim();
}

/** A team member's email (lowercased), or null (blank) for nobody. Checked against the team afterwards. */
function assignee(body: Record<string, unknown>, issues: Issues): string | null | undefined {
  if (!('assignedTo' in body) || body.assignedTo === undefined) return undefined;
  const v = body.assignedTo;
  if (v === null || (typeof v === 'string' && v.trim() === '')) return null;
  if (typeof v !== 'string' || !EMAIL_RE.test(v.trim())) {
    issues.add('assignedTo', M.assignedTo, typeof v !== 'string');
    return undefined;
  }
  return v.trim().toLowerCase();
}

/** When the touch happened: up to five minutes ahead (clock skew), at most a year back. */
function touchAt(body: Record<string, unknown>, issues: Issues): string | undefined {
  if (!('at' in body) || body.at === undefined) return undefined;
  const v = typeof body.at === 'string' ? body.at.trim() : '';
  const ms = instantMs(v);
  if (!Number.isFinite(ms)) issues.add('at', M.at);
  else if (ms > Date.now() + 5 * 60_000) issues.add('at', M.atFuture);
  else if (ms < Date.now() - 366 * DAY_MS) issues.add('at', M.atOld);
  else return v;
  return undefined;
}

/* ---------- people ---------- */

/** The caller as a lead shows them (their name from the team when it has one). */
function callerRef(ctx: MockContext): StaffRef {
  const email = ctx.user.email.toLowerCase();
  return leadAssignees().find((m) => m.email === email) ?? { email, name: ctx.user.name };
}

/** The team member for an email, or the 400 the server answers for someone not on the team. */
function teamMember(email: string): StaffRef | MockResult {
  return leadAssignees().find((m) => m.email === email) ?? fail(400, 'assigned_to', M.assignedTo, { assignedTo: M.assignedTo });
}
const isResult = (v: StaffRef | MockResult): v is MockResult => 'status' in v;

/* ---------- the list ---------- */

/** Phone digits match with any punctuation in between ("6135550199" finds "(613) 555-0199"). */
function matchesPhoneDigits(q: string | undefined, phoneNumber: string | null): boolean {
  if (!q || !phoneNumber || /[a-z]/i.test(q)) return false;
  const digits = q.replace(/\D/g, '');
  return digits.length >= 4 && phoneNumber.replace(/\D/g, '').includes(digits);
}

/** Cursors carry their sort, like the server's ("c" newest first, "f" soonest follow-up first). */
const FOLLOW_UP_CURSOR = 'f1.';
const NEWEST_CURSOR = 'c1.';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/leads',
    latency: 'normal',
    handler: ({ query, user }) => {
      const denied = requireCap(user, 'leads.view');
      if (denied) return denied;
      const source = query.source ? zLeadSource.safeParse(query.source) : undefined;
      if (source && !source.success) return fail(400, 'source', 'Unknown lead source.', { source: 'Unknown lead source.' });
      const status = query.status ? zLeadStatus.safeParse(query.status) : undefined;
      if (status && !status.success) return fail(400, 'status', M.status, { status: M.status });
      const need = query.need ? zLeadNeed.safeParse(query.need) : undefined;
      if (need && !need.success) return fail(400, 'need', M.need, { need: M.need });
      const assigned = query.assigned?.trim().toLowerCase();
      if (assigned && assigned !== 'me' && assigned !== 'none' && !EMAIL_RE.test(assigned)) {
        return fail(400, 'assigned', M.assigned, { assigned: M.assigned });
      }
      // An empty value is the same as none, like the server's.
      const followUp = (query.followUp || undefined) as FollowUpFilter | undefined;
      if (followUp && !FOLLOW_UP_FILTERS.includes(followUp)) return fail(400, 'follow_up', M.followUp, { followUp: M.followUp });

      // A cursor belongs to its sort.
      const byFollowUp = followUp !== undefined;
      const cursor = query.cursor;
      if (cursor && !cursor.startsWith(byFollowUp ? FOLLOW_UP_CURSOR : NEWEST_CURSOR)) return fail(400, 'cursor', M.cursor);

      const now = Date.now();
      const owner = assigned === 'me' ? user.email.toLowerCase() : assigned;
      let rows = leadsDb.filter(
        (lead) =>
          (!source?.success || lead.source === source.data) &&
          (!status?.success || lead.status === status.data) &&
          (!need?.success || lead.need === need.data) &&
          (!owner || (owner === 'none' ? !lead.assignedTo : lead.assignedTo?.email === owner)) &&
          (matches(query.q, lead.name, lead.email, lead.business, lead.phone) || matchesPhoneDigits(query.q, lead.phone)),
      );
      if (byFollowUp) {
        rows = rows
          .filter((lead) => {
            if (!lead.followUpAt) return false;
            const at = instantMs(lead.followUpAt);
            return followUp === 'any' || (followUp === 'due' ? at <= now : at > now);
          })
          .sort((a, b) => instantMs(a.followUpAt ?? '') - instantMs(b.followUpAt ?? '') || a.id.localeCompare(b.id));
      }
      const page = paginate(rows, { ...query, cursor: cursor ? NEWEST_CURSOR + cursor.slice(3) : '' });
      const next = page.nextCursor && byFollowUp ? FOLLOW_UP_CURSOR + page.nextCursor.slice(3) : page.nextCursor;
      return ok({ items: page.items, nextCursor: next });
    },
  },
  {
    method: 'POST',
    path: '/leads',
    latency: 'normal',
    handler: (ctx) => {
      const denied = requireCap(ctx.user, 'leads.create');
      if (denied) return denied;
      const { body } = ctx;
      const issues = new Issues();
      const name = text(body, 'name', issues, 120, M.nameLong);
      const business = text(body, 'business', issues, 200, M.businessLong);
      const mail = email(body, issues);
      const tel = phone(body, issues);
      const website = text(body, 'website', issues, 300, M.websiteLong);
      const need = oneOf(body, 'need', zLeadNeed.options, issues, M.need);
      const revenue = oneOf(body, 'revenue', zLeadRevenue.options, issues, M.revenue);
      const message = text(body, 'message', issues, 5000, M.messageLong);
      const status = settableStatus(body, issues);
      const followUp = followUpAt(body, issues);
      const assignedTo = assignee(body, issues);
      // The cross-field rules (zod superRefine) run unless a field aborted, and see a
      // too-long name or a malformed email as given, like the server's.
      if (!issues.aborted) {
        if (!given(body, 'name') && !given(body, 'business')) issues.add('name', M.name);
        if (!given(body, 'email') && !given(body, 'phone')) issues.add('email', M.contact);
      }
      if (issues.found) return issues.result();

      // One email is one lead, whatever the casing.
      if (mail && leadsDb.some((l) => l.email.trim().toLowerCase() === mail)) {
        return fail(409, 'duplicate', M.duplicate, { email: M.duplicate });
      }
      // Absent: the person adding it. Null: nobody.
      let owner: StaffRef | null;
      if (assignedTo === undefined) owner = callerRef(ctx);
      else if (assignedTo === null) owner = null;
      else {
        const member = teamMember(assignedTo);
        if (isResult(member)) return member;
        owner = member;
      }

      const lead: Lead = {
        id: mockId('ld'),
        name: name ?? null,
        email: mail ?? '',
        phone: tel ?? null,
        business: business ?? null,
        status: status ?? 'new',
        source: 'outreach',
        need: need ?? null,
        revenue: revenue ?? null,
        message: message ?? null,
        bookingAt: null,
        createdAt: nowIso(),
        utm: { source: null, medium: null, campaign: null },
        referrer: null,
        convertedClientId: null,
        website: website ?? null,
        followUpAt: followUp ?? null,
        assignedTo: owner,
        addedBy: callerRef(ctx),
      };
      leadsDb.unshift(lead);
      return ok(lead, 201);
    },
  },
  {
    // Before /leads/:id: the first matching pattern wins.
    method: 'GET',
    path: '/leads/assignees',
    latency: 'fast',
    handler: ({ user }) => {
      const denied = requireAnyCap(user, 'leads.update', 'leads.create');
      if (denied) return denied;
      return ok(leadAssignees());
    },
  },
  {
    method: 'GET',
    path: '/leads/:id',
    latency: 'fast',
    handler: ({ params, user }) => {
      const denied = requireCap(user, 'leads.view');
      if (denied) return denied;
      const lead = findLead(params.id);
      return lead ? ok(lead) : notFound();
    },
  },
  {
    method: 'PATCH',
    path: '/leads/:id',
    latency: 'fast',
    handler: ({ params, user, body }) => {
      const denied = requireCap(user, 'leads.update');
      if (denied) return denied;
      const issues = new Issues();
      const status = settableStatus(body, issues);
      const followUp = followUpAt(body, issues);
      const assignedTo = assignee(body, issues);
      if (issues.found) return issues.result();
      const lead = findLead(params.id);
      if (!lead) return notFound();
      let owner: StaffRef | null | undefined = assignedTo === null ? null : undefined;
      if (assignedTo) {
        const member = teamMember(assignedTo);
        if (isResult(member)) return member;
        owner = member;
      }
      // Setting the status it already shows writes nothing.
      if (status !== undefined && status !== lead.status) lead.status = status;
      if (followUp !== undefined) lead.followUpAt = followUp;
      if (owner !== undefined) lead.assignedTo = owner;
      return ok(lead);
    },
  },
  {
    method: 'GET',
    path: '/leads/:id/touches',
    latency: 'fast',
    handler: ({ params, user, query }) => {
      const denied = requireCap(user, 'leads.view');
      if (denied) return denied;
      if (!findLead(params.id)) return notFound();
      return ok(paginate(leadTouchesDb.filter((t) => t.leadId === params.id), query));
    },
  },
  {
    method: 'POST',
    path: '/leads/:id/touches',
    latency: 'normal',
    handler: (ctx) => {
      const { params, user, body } = ctx;
      const denied = requireCap(user, 'leads.outreach');
      if (denied) return denied;
      const issues = new Issues();
      const kind = typeof body.kind === 'string' ? zTouchKind.safeParse(body.kind) : undefined;
      if (!kind?.success) issues.add('kind', M.kind);
      const outcome = text(body, 'outcome', issues, 200, M.outcomeLong);
      const note = text(body, 'note', issues, 5000, M.noteLong);
      const at = touchAt(body, issues);
      const status = settableStatus(body, issues);
      const followUp = followUpAt(body, issues);
      if (issues.found || !kind?.success) return issues.result();
      const lead = findLead(params.id);
      if (!lead) return notFound();

      const touch: Touch = {
        id: mockId('tc'),
        leadId: lead.id,
        kind: kind.data,
        outcome: outcome ?? null,
        // Trimmed like the server; line breaks inside are kept.
        note: note ?? null,
        by: callerRef(ctx),
        at: at ?? nowIso(),
      };
      // Touches are kept newest first (a touch logged for earlier lands in its place).
      leadTouchesDb.push(touch);
      leadTouchesDb.sort(byNewest((t) => t.at));

      // The server's rule: reaching out to a "new" lead makes it "contacted", unless a status is sent.
      const nextStatus = status ?? (CONTACT_KINDS.includes(touch.kind) && lead.status === 'new' ? 'contacted' : undefined);
      if (nextStatus !== undefined && nextStatus !== lead.status) lead.status = nextStatus;
      if (followUp !== undefined) lead.followUpAt = followUp;
      return ok({ touch, lead }, 201);
    },
  },
];
