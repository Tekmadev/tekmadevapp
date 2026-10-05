import { parseCalendarDate } from '@/lib/dates';

import {
  OPEN_DEMO_STATUSES,
  zDemoListStatus,
  zDemoStatus,
  type DemoBusiness,
  type DemoCan,
  type DemoCounts,
  type DemoEvent,
  type DemoField,
  type DemoRequest,
  type DemoStatus,
} from '../../schemas/demos';
import { clientById } from '../fixtures/clients';
import { demosDb, findDemo, type DemoRecord } from '../fixtures/demos';
import { findLead, leadAssignees } from '../fixtures/leads';
import { MOCK_ACCOUNTS } from '../fixtures/staff';
import { mockCan, requireAnyCap, requireCap } from '../permissions';
import { byNewest, fail, mockUuid, nowIso, ok, paginate, type MockContext, type MockResult, type MockRoute, type MockStaff } from '../router';

/**
 * Mock routes for demo requests (contract "Demo requests: API contract v1",
 * 2026-10-05): GET /demos, GET /demos/:id, POST /demos, PATCH /demos/:id.
 *
 * The server's rules, enforced here:
 * - `demos.manage`: requested -> building -> ready -> shown; any open status ->
 *   cancelled; ready -> building (rework). `ready` needs an https link (400
 *   `demo_url` "Add the demo link first."). Shown and cancelled are closed.
 * - The requester (own request, `demos.request`): edit business, wants and
 *   needed by while requested or building; cancel then too; mark shown when ready.
 * - A closed request answers 409 `demo_closed`; someone else's request without
 *   `demos.manage` answers 403 `forbidden`.
 * - `can` says exactly that for the caller.
 * Capabilities are checked first, before validation and before a 404, like
 * the server's route wrapper. Creates are idempotent on the body's
 * `idempotencyKey` (the transport also replays on the Idempotency-Key header).
 */

/** The server's copy. The first five are the contract's; the rest are the mock's choices (docs: report). */
const M = {
  notFound: 'That demo request no longer exists.',
  closed: 'This demo request is closed.',
  demoUrl: 'Add the demo link first.',
  target: 'Pick the client or lead this demo is for.',
  forbidden: 'Your role cannot do that.',
  validation: 'Check the highlighted fields.',
  clientGone: 'That client no longer exists.',
  leadGone: 'That lead no longer exists.',
  status: 'Unknown demo status.',
  statusFilter: 'Unknown status filter.',
  step: 'That status change is not allowed now.',
  locked: 'This demo is ready. Only the builder can change it now.',
  idempotency: 'Send an idempotency key with the request.',
  idempotencyReused: 'That request was already sent with different details. Try again.',
  businessName: 'Enter the business name.',
  businessNameLong: 'Keep the business name to 120 characters or fewer.',
  businessType: 'Enter the kind of business.',
  businessTypeLong: 'Keep the kind of business to 80 characters or fewer.',
  area: 'Enter the city or area they serve.',
  areaLong: 'Keep the area to 120 characters or fewer.',
  offer: 'Say what they sell or do.',
  offerLong: 'Keep this to 1,000 characters or fewer.',
  long500: 'Keep this to 500 characters or fewer.',
  wantsLong: 'Keep this to 2,000 characters or fewer.',
  neededBy: 'Pick a valid date.',
  demoUrlBad: 'Enter a full link starting with https://.',
  builderEmail: 'Pick someone on the team.',
  builderNoteLong: 'Keep the note to 1,000 characters or fewer.',
} as const;

const OPEN: readonly DemoStatus[] = OPEN_DEMO_STATUSES;
const EARLY: readonly DemoStatus[] = ['requested', 'building'];
const isOpen = (status: DemoStatus) => OPEN.includes(status);

/** The steps `demos.manage` may take: from -> allowed next statuses. Cancelled from any open status. */
const MANAGE_STEPS: Record<DemoStatus, readonly DemoStatus[]> = {
  requested: ['building', 'cancelled'],
  building: ['ready', 'cancelled'],
  ready: ['shown', 'building', 'cancelled'],
  shown: [],
  cancelled: [],
};

const HTTPS_URL = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{2,5})?([/?#]\S*)?$/i;

/** A real Toronto calendar day `YYYY-MM-DD` (2026-02-30 is not one). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const p = parseCalendarDate(value);
  if (!p) return false;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return d.getUTCFullYear() === p.year && d.getUTCMonth() === p.month - 1 && d.getUTCDate() === p.day;
}

/* ---------- people ---------- */

const emailOf = (user: MockStaff) => user.email.trim().toLowerCase();

/** A team member's name for an email (null when not known). */
function nameOf(email: string): string | null {
  const needle = email.toLowerCase();
  return MOCK_ACCOUNTS.find((a) => a.email === needle)?.name ?? leadAssignees().find((m) => m.email === needle)?.name ?? null;
}

/* ---------- what the caller may do ---------- */

const isRequester = (d: DemoRecord, user: MockStaff) => d.requestedBy === emailOf(user) && mockCan(user, 'demos.request');

/** The contract's rules for this caller, as `can`. */
export function demoCan(d: DemoRecord, user: MockStaff): DemoCan {
  const manage = mockCan(user, 'demos.manage');
  const mine = isRequester(d, user);
  const early = EARLY.includes(d.status);
  return {
    edit: isOpen(d.status) && (manage || (mine && early)),
    cancel: isOpen(d.status) && (manage || (mine && early)),
    markShown: d.status === 'ready' && (manage || mine),
    manage: isOpen(d.status) && manage,
  };
}

/** A request as the caller sees it: names looked up now, events on the detail only. */
function view(d: DemoRecord, user: MockStaff, withEvents: boolean): DemoRequest {
  const lead = d.leadId ? findLead(d.leadId) : undefined;
  return {
    id: d.id,
    status: d.status,
    clientId: d.clientId,
    clientName: d.clientId ? (clientById(d.clientId)?.businessName ?? null) : null,
    leadId: d.leadId,
    leadName: lead ? lead.business?.trim() || lead.name?.trim() || lead.email || null : null,
    business: { ...d.business },
    wants: d.wants,
    neededBy: d.neededBy,
    demoUrl: d.demoUrl,
    builderEmail: d.builderEmail,
    builderNote: d.builderNote,
    requestedBy: d.requestedBy,
    requestedByName: nameOf(d.requestedBy),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    readyAt: d.readyAt,
    shownAt: d.shownAt,
    cancelledAt: d.cancelledAt,
    events: withEvents ? d.events.map((e) => ({ ...e })) : [],
    can: demoCan(d, user),
  };
}

/* ---------- body validation (the server's zod rules by hand) ---------- */

type Issues = Partial<Record<DemoField, string>>;

type TextRule = { max: number; required?: string; tooLong: string };

/**
 * One text field. Absent: undefined (unchanged). Null or blank: null, or an
 * issue when required. Anything else is the trimmed string, or an issue.
 */
function text(raw: unknown, field: DemoField, rule: TextRule, issues: Issues): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    if (rule.required) issues[field] = rule.required;
    return null;
  }
  if (typeof raw !== 'string') {
    issues[field] = rule.required ?? rule.tooLong;
    return undefined;
  }
  const value = raw.trim();
  if (value.length > rule.max) {
    issues[field] = rule.tooLong;
    return undefined;
  }
  return value;
}

const BUSINESS_RULES: Record<keyof DemoBusiness, { field: DemoField; rule: TextRule }> = {
  name: { field: 'businessName', rule: { max: 120, required: M.businessName, tooLong: M.businessNameLong } },
  type: { field: 'businessType', rule: { max: 80, required: M.businessType, tooLong: M.businessTypeLong } },
  area: { field: 'area', rule: { max: 120, required: M.area, tooLong: M.areaLong } },
  offer: { field: 'offer', rule: { max: 1000, required: M.offer, tooLong: M.offerLong } },
  website: { field: 'website', rule: { max: 500, tooLong: M.long500 } },
  brand: { field: 'brand', rule: { max: 500, tooLong: M.long500 } },
  customers: { field: 'customers', rule: { max: 500, tooLong: M.long500 } },
};
const BUSINESS_KEYS = Object.keys(BUSINESS_RULES) as (keyof DemoBusiness)[];

const asObject = (raw: unknown): Record<string, unknown> | null =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

/**
 * The business fields sent. `full`: every required one must be there (POST);
 * otherwise only the keys present change (PATCH), and required ones may not be blanked.
 */
function businessFields(raw: unknown, full: boolean, issues: Issues): Partial<DemoBusiness> {
  const body = asObject(raw) ?? {};
  const out: Partial<DemoBusiness> = {};
  for (const key of BUSINESS_KEYS) {
    const { field, rule } = BUSINESS_RULES[key];
    const value = text(full && body[key] === undefined && rule.required ? null : body[key], field, rule, issues);
    if (value === undefined) continue;
    if (value === null) {
      if (!rule.required) (out as Record<string, string | null>)[key] = null;
      continue;
    }
    (out as Record<string, string | null>)[key] = value;
  }
  return out;
}

function neededByField(raw: unknown, issues: Issues): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw === 'string' && isCalendarDate(raw.trim())) return raw.trim();
  issues.neededBy = M.neededBy;
  return undefined;
}

function demoUrlField(raw: unknown, issues: Issues): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) return null;
  if (typeof raw === 'string' && raw.trim().length <= 2000 && HTTPS_URL.test(raw.trim())) return raw.trim();
  issues.demoUrl = M.demoUrlBad;
  return undefined;
}

function builderField(raw: unknown, issues: Issues): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) return null;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (leadAssignees().some((m) => m.email === email)) return email;
  issues.builderEmail = M.builderEmail;
  return undefined;
}

const validationError = (issues: Issues): MockResult => fail(400, 'validation', M.validation, issues as Record<string, string>);
const hasIssues = (issues: Issues) => Object.keys(issues).length > 0;

/* ---------- writes ---------- */

const touchedEvent = (user: MockStaff, at: string, type: DemoEvent['type'], from: string | null, to: string | null): DemoEvent => ({
  at,
  by: emailOf(user),
  byName: user.name ?? nameOf(emailOf(user)),
  type,
  from,
  to,
});

/** Same key and body: the first result. Same key, different body: refused. Keyed per caller. */
const createdByKey = new Map<string, { signature: string; id: string }>();

/** What the create's body says, without its key (the replay check compares this). */
function signatureOf(body: Record<string, unknown>): string {
  const { idempotencyKey: _ignored, ...rest } = body;
  return JSON.stringify(rest);
}

function counts(rows: DemoRecord[], me: string): DemoCounts {
  const of = (status: DemoStatus) => rows.filter((d) => d.status === status).length;
  return {
    open: rows.filter((d) => isOpen(d.status)).length,
    requested: of('requested'),
    building: of('building'),
    ready: of('ready'),
    mine: rows.filter((d) => isOpen(d.status) && d.requestedBy === me).length,
  };
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/demos',
    latency: 'normal',
    handler: ({ query, user }) => {
      const denied = requireCap(user, 'demos.view');
      if (denied) return denied;
      const status = zDemoListStatus.safeParse(query.status || 'open');
      if (!status.success) return fail(400, 'status', M.statusFilter, { status: M.statusFilter });
      const mine = query.mine === '1' || query.mine === 'true';
      const me = emailOf(user);
      // Counts follow the client or lead, never the status or Mine.
      const scoped = demosDb.filter((d) => (!query.clientId || d.clientId === query.clientId) && (!query.leadId || d.leadId === query.leadId));
      const filter = status.data;
      const rows = scoped
        .filter((d) => (filter === 'all' ? true : filter === 'open' ? isOpen(d.status) : d.status === filter))
        .filter((d) => !mine || d.requestedBy === me)
        .sort(byNewest((d) => d.createdAt));
      const page = paginate(rows, query);
      return ok({ items: page.items.map((d) => view(d, user, false)), nextCursor: page.nextCursor, counts: counts(scoped, me) });
    },
  },
  {
    method: 'GET',
    path: '/demos/:id',
    latency: 'fast',
    handler: ({ params, user }) => {
      const denied = requireCap(user, 'demos.view');
      if (denied) return denied;
      const d = findDemo(params.id);
      return d ? ok(view(d, user, true)) : fail(404, 'not_found', M.notFound);
    },
  },
  {
    method: 'POST',
    path: '/demos',
    latency: 'normal',
    handler: (ctx: MockContext) => {
      const { body, user } = ctx;
      const denied = requireCap(user, 'demos.request');
      if (denied) return denied;
      const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
      if (!key) return fail(400, 'idempotency', M.idempotency);
      const replay = createdByKey.get(`${user.id}:${key}`);
      if (replay) {
        const first = findDemo(replay.id);
        if (replay.signature !== signatureOf(body)) return fail(409, 'idempotency', M.idempotencyReused);
        if (first) return ok(view(first, user, true), 201);
      }

      // Exactly one of clientId / leadId.
      const clientId = typeof body.clientId === 'string' && body.clientId.trim() ? body.clientId.trim() : null;
      const leadId = typeof body.leadId === 'string' && body.leadId.trim() ? body.leadId.trim() : null;
      if ((clientId === null) === (leadId === null)) return fail(400, 'target', M.target);

      const issues: Issues = {};
      const business = businessFields(body.business, true, issues);
      const wants = text(body.wants, 'wants', { max: 2000, tooLong: M.wantsLong }, issues);
      const neededBy = neededByField(body.neededBy, issues);
      if (hasIssues(issues)) return validationError(issues);

      // Unknown (or trashed, or hidden test) client or lead: 404.
      let linkedClient: string | null = null;
      if (clientId) {
        const c = clientById(clientId);
        if (!c || c.deletedAt || (c.isTest && !mockCan(user, 'testdata.view'))) return fail(404, 'not_found', M.clientGone);
        linkedClient = c.id;
      }
      if (leadId) {
        const lead = findLead(leadId);
        if (!lead) return fail(404, 'not_found', M.leadGone);
        // A lead that already became a client: the request carries the client too (the conversion rule).
        linkedClient = lead.convertedClientId ?? null;
      }

      const at = nowIso();
      const me = emailOf(user);
      const record: DemoRecord = {
        id: mockUuid(),
        status: 'requested',
        clientId: linkedClient,
        leadId,
        business: {
          name: business.name ?? '',
          type: business.type ?? '',
          area: business.area ?? '',
          offer: business.offer ?? '',
          website: business.website ?? null,
          brand: business.brand ?? null,
          customers: business.customers ?? null,
        },
        wants: wants ?? null,
        neededBy: neededBy ?? null,
        demoUrl: null,
        builderEmail: null,
        builderNote: null,
        requestedBy: me,
        createdAt: at,
        updatedAt: at,
        readyAt: null,
        shownAt: null,
        cancelledAt: null,
        events: [touchedEvent(user, at, 'created', null, 'requested')],
      };
      demosDb.unshift(record);
      createdByKey.set(`${user.id}:${key}`, { signature: signatureOf(body), id: record.id });
      return ok(view(record, user, true), 201);
    },
  },
  {
    method: 'PATCH',
    path: '/demos/:id',
    latency: 'normal',
    handler: ({ params, body, user }) => {
      const denied = requireAnyCap(user, 'demos.request', 'demos.manage');
      if (denied) return denied;
      const d = findDemo(params.id);
      if (!d) return fail(404, 'not_found', M.notFound);
      const manage = mockCan(user, 'demos.manage');
      const mine = isRequester(d, user);
      if (!manage && !mine) return fail(403, 'forbidden', M.forbidden);
      if (!isOpen(d.status)) return fail(409, 'demo_closed', M.closed);

      let status: DemoStatus | undefined;
      if (body.status !== undefined) {
        const parsed = zDemoStatus.safeParse(body.status);
        if (!parsed.success) return fail(400, 'status', M.status, { status: M.status });
        status = parsed.data;
      }
      const issues: Issues = {};
      const business = body.business === undefined ? {} : businessFields(body.business, false, issues);
      const wants = text(body.wants, 'wants', { max: 2000, tooLong: M.wantsLong }, issues);
      const neededBy = neededByField(body.neededBy, issues);
      const demoUrl = demoUrlField(body.demoUrl, issues);
      const builderEmail = builderField(body.builderEmail, issues);
      const builderNote = text(body.builderNote, 'builderNote', { max: 1000, tooLong: M.builderNoteLong }, issues);
      if (hasIssues(issues)) return validationError(issues);

      const editsRequest = Object.keys(business).length > 0 || wants !== undefined || neededBy !== undefined;
      const statusChange = status !== undefined && status !== d.status ? status : undefined;

      if (!manage) {
        // The builder's fields are never the requester's.
        if (demoUrl !== undefined || builderEmail !== undefined || builderNote !== undefined) return fail(403, 'forbidden', M.forbidden);
        if (statusChange) {
          const allowed = (statusChange === 'shown' && d.status === 'ready') || (statusChange === 'cancelled' && EARLY.includes(d.status));
          if (!allowed) {
            // Steps only a builder takes are a role limit; the right step at the wrong time is a conflict.
            if (statusChange !== 'shown' && statusChange !== 'cancelled') return fail(403, 'forbidden', M.forbidden);
            return fail(409, 'status', M.step);
          }
        }
        if (editsRequest && !EARLY.includes(d.status)) return fail(409, 'demo_ready', M.locked);
      } else if (statusChange && !MANAGE_STEPS[d.status].includes(statusChange)) {
        return fail(409, 'status', M.step);
      }

      // Ready needs a link: the one sent now, or the one already there.
      const nextUrl = demoUrl !== undefined ? demoUrl : d.demoUrl;
      const nextStatus = statusChange ?? d.status;
      if (nextStatus === 'ready' && !nextUrl) return fail(400, 'demo_url', M.demoUrl, { demoUrl: M.demoUrl });

      const at = nowIso();
      const events: DemoEvent[] = [];
      const nextBusiness: DemoBusiness = { ...d.business, ...business };
      const edited =
        JSON.stringify(nextBusiness) !== JSON.stringify(d.business) ||
        (wants !== undefined && wants !== d.wants) ||
        (neededBy !== undefined && neededBy !== d.neededBy) ||
        (builderNote !== undefined && builderNote !== d.builderNote);
      if (edited) {
        d.business = nextBusiness;
        if (wants !== undefined) d.wants = wants;
        if (neededBy !== undefined) d.neededBy = neededBy;
        if (builderNote !== undefined) d.builderNote = builderNote;
        events.push(touchedEvent(user, at, 'edited', null, null));
      }
      if (builderEmail !== undefined && builderEmail !== d.builderEmail) {
        events.push(touchedEvent(user, at, 'builder', d.builderEmail, builderEmail));
        d.builderEmail = builderEmail;
      }
      if (demoUrl !== undefined && demoUrl !== d.demoUrl) {
        events.push(touchedEvent(user, at, 'link', d.demoUrl, demoUrl));
        d.demoUrl = demoUrl;
      }
      if (statusChange) {
        events.push(touchedEvent(user, at, 'status', d.status, statusChange));
        if (statusChange === 'ready') d.readyAt = at;
        // Back to building (rework): not ready any more.
        if (statusChange === 'building' && d.status === 'ready') d.readyAt = null;
        if (statusChange === 'shown') d.shownAt = at;
        if (statusChange === 'cancelled') d.cancelledAt = at;
        d.status = statusChange;
      }
      if (events.length > 0) {
        d.events.push(...events);
        d.updatedAt = at;
      }
      return ok(view(d, user, true));
    },
  },
];
