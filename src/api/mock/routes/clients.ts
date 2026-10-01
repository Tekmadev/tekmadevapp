import { parseCalendarDate } from '@/lib/dates';

import {
  EDITABLE_CLIENT_STATUSES,
  zAccessProvider,
  zAccessStatus,
  zApprovalKind,
  zCallSource,
  zCallStatus,
  zClientListStatus,
  zClientStatus,
  zDisqualifyReason,
  zGuaranteeCountRule,
  zGuaranteeStatus,
  zMemberRole,
  zMemberStatus,
  zOnboardingStage,
  zPlanId,
  zTaskKind,
  zTaskOwner,
  zTaskStatus,
  type Activity,
  type ClientStatus,
  type Member,
  type OnboardingStage,
  type OnboardingTask,
  type OnboardingTemplate,
  type PlanId,
} from '../../schemas/clients';
import {
  activityOf,
  addActivity,
  bundleFor,
  callView,
  clientById,
  clientsDb,
  clientView,
  CRM_DB_FAIL_LOCATION_ID,
  CRM_OWN_LOCATION_ID,
  createRun,
  defaultMethod,
  GUARANTEE_DEFAULTS,
  guaranteeFor,
  latestRun,
  metaFixture,
  planById,
  rowFor,
  runView,
  setTaskStatus,
  signAsset,
  stageIndex,
  statsFor,
  tasksOf,
  visibleClients,
  type CallRecord,
  type ClientRecord,
  type RunRecord,
} from '../fixtures/clients';
import { bool, fail, isEmail, matches, mockId, notFound, nowIso, num, ok, paginate, str, torontoDate, type MockContext, type MockResult, type MockRoute } from '../router';

/**
 * Mock routes for the "clients" domain (contract section 11, Customers; brief 8.5).
 *
 * Every write changes the in-memory fixtures and returns the full entity, and
 * the derived numbers (stage, progress, pace, review badges) are recomputed on
 * read, so the list, the detail bundle and Home always agree. Test clients are
 * invisible to managers (404), exactly like the rest of test mode.
 */

const REQUIRED = 'Business name and a valid email are required.';
const EMAIL = 'Enter a valid email.';
const INVITE_FAILED = 'Invite email failed. Check the Supabase auth email settings.';
const RUN_COMPLETE = 'This onboarding is complete. A completed run cannot be reopened.';
const LINK = 'Enter a full link starting with https://.';
const INPUT = 'Check the highlighted fields.';

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const CRM_ID = /^[A-Za-z0-9]{20}$/;
const TEMPLATE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Mock email delivery fails for any address containing "bounce", so the failure toasts can be seen. */
const inviteBounces = (email: string) => email.toLowerCase().includes('bounce');

/* ---------- small validation kit ---------- */

const has = (body: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(body, key);
const isUrl = (value: string) => /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(value);
/** A real calendar day (2026-02-30 is not one). */
const isDate = (value: string) => {
  const p = parseCalendarDate(value);
  if (!p) return false;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return d.getUTCFullYear() === p.year && d.getUTCMonth() === p.month - 1 && d.getUTCDate() === p.day;
};
const isInstant = (value: string) => INSTANT.test(value) && !Number.isNaN(Date.parse(value));
const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

type Enum<T extends string> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } };

/**
 * Collects inline field errors. The response carries the first error's code and
 * message (the toast), plus every field message for the form.
 */
class Check {
  readonly fields: Record<string, string> = {};
  private first: { code: string; message: string } | null = null;

  add(field: string, code: string, message: string, inline: string = message) {
    if (!(field in this.fields)) this.fields[field] = inline;
    if (!this.first) this.first = { code, message };
  }

  get failed() {
    return this.first !== null;
  }

  result(): MockResult {
    return fail(400, this.first?.code ?? 'input', this.first?.message ?? INPUT, this.fields);
  }

  /** Optional nullable text: undefined when absent, null to clear (blank clears too), trimmed otherwise. */
  text(body: Record<string, unknown>, key: string, max = 2000): string | null | undefined {
    if (!has(body, key) || body[key] === undefined) return undefined;
    const value = body[key];
    if (value === null) return null;
    if (typeof value !== 'string') {
      this.add(key, 'input', INPUT, 'Send text.');
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length > max) {
      this.add(key, 'input', INPUT, `Keep it under ${max} characters.`);
      return undefined;
    }
    return trimmed === '' ? null : trimmed;
  }

  /** Optional enum: undefined when absent; null only when `nullable`. */
  oneOf<T extends string>(body: Record<string, unknown>, key: string, schema: Enum<T>, inline: string, nullable = false): T | null | undefined {
    if (!has(body, key) || body[key] === undefined) return undefined;
    if (body[key] === null && nullable) return null;
    const parsed = schema.safeParse(body[key]);
    if (parsed.success) return parsed.data;
    this.add(key, 'input', INPUT, inline);
    return undefined;
  }

  flag(body: Record<string, unknown>, key: string): boolean | undefined {
    if (!has(body, key) || body[key] === undefined) return undefined;
    const value = bool(body[key]);
    if (value === undefined) this.add(key, 'input', INPUT, 'Send true or false.');
    return value;
  }

  /** Optional nullable whole number within a range. */
  int(body: Record<string, unknown>, key: string, min: number, max: number, inline: string, nullable = false): number | null | undefined {
    if (!has(body, key) || body[key] === undefined) return undefined;
    if (body[key] === null && nullable) return null;
    const value = num(body[key]);
    if (value === undefined || !Number.isInteger(value) || value < min || value > max) {
      this.add(key, 'input', INPUT, inline);
      return undefined;
    }
    return value;
  }

  date(body: Record<string, unknown>, key: string): string | null | undefined {
    if (!has(body, key) || body[key] === undefined) return undefined;
    if (body[key] === null) return null;
    const value = str(body[key]);
    if (!value || !isDate(value)) {
      this.add(key, 'input', INPUT, 'Enter a date as YYYY-MM-DD.');
      return undefined;
    }
    return value;
  }

  instant(body: Record<string, unknown>, key: string): string | null | undefined {
    if (!has(body, key) || body[key] === undefined) return undefined;
    if (body[key] === null) return null;
    const value = str(body[key]);
    if (!value || !isInstant(value)) {
      this.add(key, 'input', INPUT, 'Enter a valid date and time.');
      return undefined;
    }
    return value;
  }

  url(body: Record<string, unknown>, key: string): string | null | undefined {
    const value = this.text(body, key, 2048);
    if (value && !isUrl(value)) {
      this.add(key, 'url', LINK);
      return undefined;
    }
    return value;
  }
}

/* ---------- lookups that respect who is asking ---------- */

type Actor = Activity['actor'];
const actorOf = (ctx: MockContext): Actor => ({ kind: 'staff', name: ctx.user.name, email: ctx.user.email });
const nameOf = (ctx: MockContext) => ctx.user.name ?? ctx.user.email;

/** A live (not deleted) client the caller may see: managers never see test clients. */
function findClient(ctx: MockContext, id: string | undefined): ClientRecord | undefined {
  const c = id ? clientById(id) : undefined;
  if (!c || (c.isTest && !ctx.isOwner)) return undefined;
  return c;
}

const clientMissing = () => notFound('That client');

function findRun(ctx: MockContext, id: string | undefined): { run: RunRecord; client: ClientRecord } | undefined {
  const run = clientsDb.runs.find((r) => r.id === id);
  const client = run ? findClient(ctx, run.clientId) : undefined;
  return run && client ? { run, client } : undefined;
}

function findTask(ctx: MockContext, id: string | undefined): { task: OnboardingTask; run: RunRecord; client: ClientRecord } | undefined {
  const task = clientsDb.tasks.find((t) => t.id === id);
  const found = task ? findRun(ctx, task.runId) : undefined;
  return task && found ? { task, ...found } : undefined;
}

function owned<T extends { id: string; clientId: string }>(ctx: MockContext, rows: T[], id: string | undefined): { row: T; client: ClientRecord } | undefined {
  const row = rows.find((r) => r.id === id);
  const client = row ? findClient(ctx, row.clientId) : undefined;
  return row && client ? { row, client } : undefined;
}

const touch = (c: ClientRecord) => {
  c.updatedAt = nowIso();
};

const label = <T extends string>(options: readonly { value: T; label: string }[], value: T) => options.find((o) => o.value === value)?.label ?? value;
const statusLabel = (status: ClientStatus) => label(metaFixture.clientStatuses, status);
const stageLabel = (stage: OnboardingStage) => label(metaFixture.onboardingStages, stage);

const shorten = (text: string, max = 140) => {
  const line = text.split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}...` : line;
};

/* ---------- onboarding helpers ---------- */

const isClosed = (status: OnboardingTask['status']) => status === 'done' || status === 'skipped';

function completeRun(run: RunRecord, c: ClientRecord, ctx: MockContext) {
  const at = nowIso();
  run.stage = 'complete';
  run.completedAt = at;
  run.blocked = false;
  run.blockedReason = null;
  run.updatedAt = at;
  addActivity(c, { event: 'onboarding.completed', summary: 'Onboarding marked complete.', actor: actorOf(ctx), visible: true, at });
  touch(c);
}

/* ---------- calls ---------- */

const callResult = (call: CallRecord, c: ClientRecord, status = 200) => ok({ call: callView(call, c), guarantee: guaranteeFor(c) }, status);
const reasonLabel = (reason: CallRecord['disqualifiedReason']) => (reason ? label(metaFixture.disqualifyReasons, reason) : 'Other');

/* ---------- the routes ---------- */

export const routes: MockRoute[] = [
  /* ----- list and create ----- */
  {
    method: 'GET',
    path: '/clients',
    latency: 'normal',
    handler: (ctx) => {
      const status = zClientListStatus.safeParse(ctx.query.status ?? 'active');
      if (!status.success) return fail(400, 'status', 'Unknown status filter.');
      const includeTest = ctx.isOwner && (ctx.query.test === '1' || ctx.query.test === 'true');
      const filter = status.data;
      const rows = visibleClients(includeTest)
        .filter((c) => {
          if (filter === 'all') return true;
          if (filter === 'active') return c.status !== 'churned' && c.status !== 'lead';
          return c.status === filter;
        })
        .filter((c) => matches(ctx.query.q, c.businessName, c.primaryEmail))
        // Most recently touched first, so the clients being worked on sit at the top.
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.businessName.localeCompare(b.businessName));
      const page = paginate(rows, ctx.query);
      return ok({ stats: statsFor(includeTest), items: page.items.map(rowFor), nextCursor: page.nextCursor });
    },
  },
  {
    method: 'POST',
    path: '/clients',
    latency: 'slow',
    handler: (ctx) => {
      const { body } = ctx;
      const check = new Check();
      const businessName = str(body.businessName)?.trim() ?? '';
      const email = str(body.email)?.trim().toLowerCase() ?? '';
      if (!businessName) check.add('businessName', 'required', REQUIRED, 'Enter the business name.');
      if (!isEmail(email)) check.add('email', 'required', REQUIRED, EMAIL);
      const name = check.text(body, 'name', 200);
      const phone = check.text(body, 'phone', 40);
      const planId = check.oneOf(body, 'planId', zPlanId, 'Pick a plan from the list.', true);
      const strategist = check.text(body, 'assignedStrategist', 200);
      if (strategist && !isEmail(strategist)) check.add('assignedStrategist', 'input', INPUT, EMAIL);
      const sendInvite = check.flag(body, 'sendInvite');
      if (check.failed) return check.result();

      const at = nowIso();
      const actor = actorOf(ctx);
      const existing = clientsDb.clients.find((c) => !c.deletedAt && c.primaryEmail.toLowerCase() === email);

      if (existing && existing.isTest && !ctx.isOwner) {
        // Never reveal or touch a test client for a manager: treat the email as taken.
        return fail(409, 'email_taken', 'Another client already uses that email.', { email: 'Another client already uses that email.' });
      }

      let c: ClientRecord;
      if (existing) {
        c = existing;
        c.businessName = businessName;
        if (name !== undefined && name !== null) c.contactName = name;
        if (phone !== undefined && phone !== null) c.phone = phone;
        if (planId !== undefined && planId !== null && planId !== c.planId) {
          c.planId = planId;
          c.guaranteeEligible = planById(planId)?.guarantee ?? false;
        }
        if (strategist !== undefined && strategist !== null) c.assignedStrategist = strategist.toLowerCase();
        addActivity(c, { event: 'client.updated', summary: 'Added again by hand: the existing client was updated.', actor, at });
      } else {
        const plan = planById(planId ?? null);
        c = {
          id: mockId('cl'),
          businessName,
          legalName: null,
          website: null,
          primaryEmail: email,
          contactName: name ?? null,
          phone: phone ?? null,
          industry: null,
          status: 'pending',
          planId: planId ?? null,
          isTest: false,
          timezone: 'America/Toronto',
          assignedStrategist: strategist?.toLowerCase() ?? null,
          liveDate: null,
          serviceArea: null,
          internalNotes: null,
          guaranteeEligible: plan?.guarantee ?? false,
          guaranteeTarget: GUARANTEE_DEFAULTS.target,
          guaranteeWindowDays: GUARANTEE_DEFAULTS.windowDays,
          guaranteeCountRule: GUARANTEE_DEFAULTS.countRule,
          guaranteeStatus: 'not_started',
          guaranteeClockStartedOn: null,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };
        clientsDb.clients.push(c);
        addActivity(c, { event: 'client.created', summary: 'Client added by hand.', actor, at });
        // A plan means work starts: the checklist comes from the plan's active templates.
        if (c.planId) {
          createRun(c, { startedAt: at });
          addActivity(c, { event: 'onboarding.started', summary: `Onboarding started with the ${plan?.name ?? ''} checklist.`, actor: { kind: 'system', name: 'System', email: null }, at });
        }
      }

      // The client's own portal login.
      let member = clientsDb.members.find((m) => m.clientId === c.id && m.email.toLowerCase() === email);
      if (!member) {
        member = { id: mockId('mem'), clientId: c.id, email, name: c.contactName, title: 'Owner', role: 'owner', status: 'invited', invitedAt: null, joinedAt: null, lastSeenAt: null };
        clientsDb.members.push(member);
      }

      let invite: 'sent' | 'failed' | 'skipped' = 'skipped';
      if (sendInvite === true && member.status === 'invited') {
        invite = inviteBounces(email) ? 'failed' : 'sent';
        if (invite === 'sent') {
          member.invitedAt = at;
          addActivity(c, { event: 'member.invited', summary: `Portal invite sent to ${email}.`, actor, at });
        }
      }
      touch(c);
      return ok({ client: clientView(c), reused: !!existing, invite }, existing ? 200 : 201);
    },
  },

  /* ----- one client ----- */
  {
    method: 'GET',
    path: '/clients/:id',
    latency: 'normal',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      return c ? ok(bundleFor(c, ctx.isOwner)) : clientMissing();
    },
  },
  {
    method: 'PATCH',
    path: '/clients/:id',
    latency: 'normal',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      if (!c) return clientMissing();
      const { body } = ctx;
      const check = new Check();

      let businessName: string | undefined;
      if (has(body, 'businessName')) {
        businessName = str(body.businessName)?.trim();
        if (!businessName) check.add('businessName', 'required', REQUIRED, 'Enter the business name.');
      }
      let primaryEmail: string | undefined;
      if (has(body, 'primaryEmail')) {
        primaryEmail = str(body.primaryEmail)?.trim().toLowerCase();
        if (!primaryEmail || !isEmail(primaryEmail)) check.add('primaryEmail', 'required', REQUIRED, EMAIL);
      }
      const legalName = check.text(body, 'legalName', 200);
      const website = check.url(body, 'website');
      const contactName = check.text(body, 'contactName', 200);
      const phone = check.text(body, 'phone', 40);
      const industry = check.text(body, 'industry', 120);
      const serviceArea = check.text(body, 'serviceArea', 500);
      const internalNotes = check.text(body, 'internalNotes', 5000);
      const strategist = check.text(body, 'assignedStrategist', 200);
      if (strategist && !isEmail(strategist)) check.add('assignedStrategist', 'input', INPUT, EMAIL);

      let status = check.oneOf(body, 'status', zClientStatus, 'Pick a status from the list.');
      // A lead becomes a client through checkout, not by hand (unless it already is one).
      if (status && !EDITABLE_CLIENT_STATUSES.includes(status) && status !== c.status) {
        check.add('status', 'input', INPUT, 'Pick a status from the list.');
        status = undefined;
      }
      const planId = check.oneOf(body, 'planId', zPlanId, 'Pick a plan from the list.', true);

      let timezone: string | undefined;
      if (has(body, 'timezone')) {
        timezone = str(body.timezone)?.trim();
        if (!timezone || !isTimeZone(timezone)) {
          check.add('timezone', 'input', INPUT, 'Enter a time zone like America/Toronto.');
          timezone = undefined;
        }
      }
      const liveDate = check.date(body, 'liveDate');
      const clockStartedOn = check.date(body, 'guaranteeClockStartedOn');
      const eligible = check.flag(body, 'guaranteeEligible');
      const target = check.int(body, 'guaranteeTarget', 1, 1000, 'Enter a whole number of 1 or more.');
      const windowDays = check.int(body, 'guaranteeWindowDays', 1, 365, 'Enter a number of days from 1 to 365.');
      const countRule = check.oneOf(body, 'guaranteeCountRule', zGuaranteeCountRule, 'Pick booked or showed.');
      const guaranteeStatus = check.oneOf(body, 'guaranteeStatus', zGuaranteeStatus, 'Pick a guarantee status from the list.');
      if (check.failed) return check.result();
      // One client per email: that is what makes "reuse by email" on create work.
      if (primaryEmail && clientsDb.clients.some((o) => o.id !== c.id && !o.deletedAt && o.primaryEmail.toLowerCase() === primaryEmail)) {
        return fail(409, 'email_taken', 'Another client already uses that email.', { primaryEmail: 'Another client already uses that email.' });
      }

      const changed: string[] = [];
      const set = <K extends keyof ClientRecord>(key: K, value: ClientRecord[K] | undefined, what: string) => {
        if (value === undefined || value === c[key]) return;
        c[key] = value;
        changed.push(what);
      };
      const before = c.status;
      set('businessName', businessName, 'business name');
      set('primaryEmail', primaryEmail, 'primary email');
      set('legalName', legalName, 'legal name');
      set('website', website, 'website');
      set('contactName', contactName, 'contact name');
      set('phone', phone, 'phone');
      set('industry', industry, 'industry');
      set('serviceArea', serviceArea, 'service area');
      set('internalNotes', internalNotes, 'internal notes');
      set('assignedStrategist', strategist === undefined || strategist === null ? strategist : strategist.toLowerCase(), 'strategist');
      set('status', status ?? undefined, 'status');
      if (planId !== undefined && planId !== c.planId) {
        set('planId', planId, 'plan');
        // Guarantee terms follow the plan unless this same request set them.
        if (eligible === undefined) c.guaranteeEligible = planById(planId)?.guarantee ?? false;
        const billing = clientsDb.billing[c.id];
        if (billing) {
          const required = planById(planId)?.needsCarePlan ?? false;
          const care = billing.subscription?.kind === 'care' && (billing.subscription.status === 'active' || billing.subscription.status === 'trialing');
          billing.carePlan = { required, active: required && care };
        }
      }
      set('timezone', timezone, 'time zone');
      set('liveDate', liveDate, 'live date');
      set('guaranteeClockStartedOn', clockStartedOn, 'guarantee clock');
      set('guaranteeEligible', eligible, 'guarantee eligibility');
      set('guaranteeTarget', target ?? undefined, 'guarantee target');
      set('guaranteeWindowDays', windowDays ?? undefined, 'guarantee window');
      set('guaranteeCountRule', countRule ?? undefined, 'count rule');
      set('guaranteeStatus', guaranteeStatus ?? undefined, 'guarantee status');

      if (changed.length) {
        const actor = actorOf(ctx);
        if (c.status !== before) addActivity(c, { event: 'client.status', summary: `Status changed to ${statusLabel(c.status)}.`, actor });
        const rest = changed.filter((w) => w !== 'status');
        if (rest.length) addActivity(c, { event: 'client.updated', summary: `Account updated: ${rest.join(', ')}.`, actor });
        touch(c);
      }
      return ok(clientView(c));
    },
  },
  {
    method: 'DELETE',
    path: '/clients/:id',
    ownerOnly: true,
    latency: 'normal',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      if (!c) return clientMissing();
      const at = nowIso();
      addActivity(c, { event: 'client.updated', summary: 'Moved to the trash.', actor: actorOf(ctx), at });
      c.deletedAt = at;
      c.updatedAt = at;
      return ok(clientView(c));
    },
  },
  {
    method: 'POST',
    path: '/clients/:id/go-live',
    latency: 'normal',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      if (!c) return clientMissing();
      if (c.status === 'live') return fail(409, 'already_live', 'This client is already live.');
      const override = bool(ctx.body.override) === true;
      const plan = planById(c.planId);
      const billing = clientsDb.billing[c.id];
      const careMissing = !!plan?.needsCarePlan && !billing?.carePlan.active;
      if (careMissing && !override) {
        return fail(
          422,
          'care_required',
          `${plan?.name ?? 'This plan'} needs an active Webline Care plan before the site goes live, and this client does not have one. Start Webline Care first, or go live without it.`,
        );
      }

      const at = nowIso();
      const today = torontoDate(0);
      c.status = 'live';
      c.liveDate = today;
      // The clock starts once: going live again after a pause keeps the original window.
      const clockStarts = c.guaranteeEligible && c.guaranteeStatus !== 'waived' && !c.guaranteeClockStartedOn;
      if (clockStarts) {
        c.guaranteeClockStartedOn = today;
        c.guaranteeStatus = 'running';
      }
      const run = latestRun(c.id);
      if (run && !run.completedAt && stageIndex(run.stage) < stageIndex('optimizing')) {
        run.stage = 'optimizing';
        run.updatedAt = at;
      }
      const summary = [careMissing ? 'Went live without a care plan.' : 'Went live.', clockStarts ? 'Guarantee clock started.' : null].filter(Boolean).join(' ');
      addActivity(c, { event: 'client.live', summary, actor: actorOf(ctx), visible: true, at });
      touch(c);
      return ok({ client: clientView(c), guarantee: guaranteeFor(c) });
    },
  },

  /* ----- onboarding ----- */
  {
    method: 'PATCH',
    path: '/onboardings/:id',
    latency: 'normal',
    handler: (ctx) => {
      const found = findRun(ctx, ctx.params.id);
      if (!found) return notFound('That onboarding run');
      const { run, client: c } = found;
      if (run.completedAt) return fail(409, 'run_complete', RUN_COMPLETE);
      const { body } = ctx;
      const check = new Check();
      const stage = check.oneOf(body, 'stage', zOnboardingStage, 'Pick a stage from the list.');
      const blocked = check.flag(body, 'blocked');
      const blockedReason = check.text(body, 'blockedReason', 500);
      const targetLiveDate = check.date(body, 'targetLiveDate');
      const kickoffAt = check.instant(body, 'kickoffAt');
      if (check.failed) return check.result();

      const actor = actorOf(ctx);
      const at = nowIso();
      if (stage === 'complete') {
        completeRun(run, c, ctx);
        return ok(runView(run));
      }
      if (stage && stage !== run.stage) {
        run.stage = stage;
        addActivity(c, { event: 'onboarding.stage', summary: `Stage moved to ${stageLabel(stage)}.`, actor, at });
      }
      if (blocked === true) {
        const reason = blockedReason ?? run.blockedReason;
        if (!run.blocked || blockedReason !== undefined) {
          addActivity(c, { event: 'onboarding.blocked', summary: reason ? `Blocked: ${reason}` : 'Blocked.', actor, at });
        }
        run.blocked = true;
        run.blockedReason = reason ?? null;
      } else if (blocked === false) {
        if (run.blocked) addActivity(c, { event: 'onboarding.unblocked', summary: 'Unblocked.', actor, at });
        run.blocked = false;
        run.blockedReason = null;
      } else if (blockedReason !== undefined) {
        run.blockedReason = blockedReason;
      }
      const details: string[] = [];
      if (targetLiveDate !== undefined && targetLiveDate !== run.targetLiveDate) {
        run.targetLiveDate = targetLiveDate;
        details.push('target go-live');
      }
      if (kickoffAt !== undefined && kickoffAt !== run.kickoffAt) {
        run.kickoffAt = kickoffAt;
        details.push('kickoff');
      }
      if (details.length) addActivity(c, { event: 'onboarding.updated', summary: `Onboarding updated: ${details.join(', ')}.`, actor, at });
      run.updatedAt = at;
      touch(c);
      return ok(runView(run));
    },
  },
  {
    method: 'POST',
    path: '/onboardings/:id/complete',
    latency: 'normal',
    handler: (ctx) => {
      const found = findRun(ctx, ctx.params.id);
      if (!found) return notFound('That onboarding run');
      if (found.run.completedAt) return fail(409, 'run_complete', RUN_COMPLETE);
      completeRun(found.run, found.client, ctx);
      return ok(runView(found.run));
    },
  },
  {
    method: 'POST',
    path: '/onboardings/:id/tasks',
    latency: 'normal',
    handler: (ctx) => {
      const found = findRun(ctx, ctx.params.id);
      if (!found) return notFound('That onboarding run');
      const { run, client: c } = found;
      if (run.completedAt) return fail(409, 'run_complete', RUN_COMPLETE);
      const { body } = ctx;
      const check = new Check();
      const title = str(body.title)?.trim() ?? '';
      if (!title) check.add('title', 'title', 'Enter a task title.');
      else if (title.length > 200) check.add('title', 'title', 'Keep the title under 200 characters.');
      const description = check.text(body, 'description', 2000);
      const stage = check.oneOf(body, 'stage', zOnboardingStage, 'Pick a stage from the list.');
      const owner = check.oneOf(body, 'owner', zTaskOwner, 'Pick Client or Tekmadev.');
      const kind = check.oneOf(body, 'kind', zTaskKind, 'Pick a kind from the list.');
      const required = check.flag(body, 'required');
      const dueAt = check.instant(body, 'dueAt');
      if (stage === 'complete') check.add('stage', 'input', INPUT, 'Tasks cannot be added to the Complete stage.');
      if (check.failed) return check.result();

      const at = nowIso();
      const taskStage = stage ?? runView(run).derivedStage;
      const siblings = tasksOf(run.id).filter((t) => t.stage === taskStage);
      const task: OnboardingTask = {
        id: mockId('tsk'),
        runId: run.id,
        templateKey: null,
        title,
        description: description ?? null,
        stage: taskStage,
        owner: owner ?? 'tekmadev',
        kind: kind ?? 'general',
        required: required ?? false,
        status: 'todo',
        dueAt: dueAt ?? null,
        doneAt: null,
        doneBy: null,
        sortOrder: siblings.reduce((max, t) => Math.max(max, t.sortOrder), 0) + 10,
        createdAt: at,
        updatedAt: at,
      };
      clientsDb.tasks.push(task);
      run.updatedAt = at;
      // A client-owned task shows up (and notifies) in the client's portal.
      addActivity(c, {
        event: 'task.added',
        summary: task.owner === 'client' ? `New task for you: ${title}.` : `Task added: ${title}.`,
        actor: actorOf(ctx),
        visible: task.owner === 'client',
        at,
      });
      touch(c);
      return ok({ task, run: runView(run) }, 201);
    },
  },
  {
    method: 'PATCH',
    path: '/tasks/:id',
    latency: 'fast',
    handler: (ctx) => {
      const found = findTask(ctx, ctx.params.id);
      if (!found) return notFound('That task');
      const { task, run, client: c } = found;
      if (run.completedAt) return fail(409, 'run_complete', RUN_COMPLETE);
      const status = zTaskStatus.safeParse(ctx.body.status);
      if (!status.success) return fail(400, 'status', 'Pick a status from the list.', { status: 'Pick a status from the list.' });
      if (status.data !== task.status) {
        const at = nowIso();
        setTaskStatus(task, status.data, isClosed(status.data) ? nameOf(ctx) : null, at);
        run.updatedAt = at;
        const statusText = label(metaFixture.taskStatuses, status.data);
        addActivity(c, {
          event: status.data === 'done' ? 'task.done' : 'task.status',
          summary: `${task.title}: ${statusText.toLowerCase()}.`,
          actor: actorOf(ctx),
          visible: task.owner === 'client',
          at,
        });
        touch(c);
      }
      return ok({ task, run: runView(run) });
    },
  },
  {
    method: 'POST',
    path: '/intakes/:id/review',
    latency: 'normal',
    handler: (ctx) => {
      const found = owned(ctx, clientsDb.intakes, ctx.params.id);
      if (!found) return notFound('That intake');
      const { row: intake, client: c } = found;
      if (intake.status !== 'submitted') {
        return fail(409, 'not_submitted', intake.status === 'reviewed' ? 'This intake is already reviewed.' : 'Only a submitted intake can be marked reviewed.');
      }
      const at = nowIso();
      intake.status = 'reviewed';
      intake.reviewedAt = at;
      intake.reviewedBy = nameOf(ctx);
      intake.updatedAt = at;
      // Reviewing the intake is also the checklist task for it.
      const run = latestRun(c.id);
      const task = run && !run.completedAt ? tasksOf(run.id).find((t) => t.templateKey === 'review-intake' && !isClosed(t.status)) : undefined;
      if (task && run) {
        setTaskStatus(task, 'done', nameOf(ctx), at);
        run.updatedAt = at;
      }
      addActivity(c, { event: 'intake.reviewed', summary: `Intake v${intake.version} reviewed.`, actor: actorOf(ctx), at });
      touch(c);
      return ok(intake);
    },
  },

  /* ----- access ----- */
  {
    method: 'POST',
    path: '/clients/:id/access-grants',
    latency: 'normal',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      if (!c) return clientMissing();
      const { body } = ctx;
      const check = new Check();
      const provider = zAccessProvider.safeParse(body.provider);
      if (!provider.success) check.add('provider', 'provider', 'Pick what we need access to.');
      const grantLabel = check.text(body, 'label', 120);
      const note = check.text(body, 'note', 1000);
      if (check.failed || !provider.success) return check.result();

      const at = nowIso();
      const grant = {
        id: mockId('acg'),
        clientId: c.id,
        provider: provider.data,
        label: grantLabel ?? null,
        status: 'requested' as const,
        accountIdentifier: null,
        method: defaultMethod(provider.data),
        note: note ?? null,
        clientDoneAt: null,
        verifiedAt: null,
        verifiedBy: null,
        requestedAt: at,
        updatedAt: at,
      };
      clientsDb.accessGrants.push(grant);
      const name = grant.label ?? label(metaFixture.accessProviders, grant.provider);
      addActivity(c, { event: 'access.requested', summary: `Requested access: ${name}.`, actor: actorOf(ctx), visible: true, at });
      touch(c);
      return ok(grant, 201);
    },
  },
  {
    method: 'PATCH',
    path: '/access-grants/:id',
    latency: 'normal',
    handler: (ctx) => {
      const found = owned(ctx, clientsDb.accessGrants, ctx.params.id);
      if (!found) return notFound('That access request');
      const { row: grant, client: c } = found;
      const check = new Check();
      const status = check.oneOf(ctx.body, 'status', zAccessStatus, 'Pick a status from the list.');
      const note = check.text(ctx.body, 'note', 1000);
      if (check.failed) return check.result();

      const at = nowIso();
      const actor = actorOf(ctx);
      if (status && status !== grant.status) {
        grant.status = status;
        if (status === 'client_says_done' && !grant.clientDoneAt) grant.clientDoneAt = at;
        if (status === 'verified') {
          grant.verifiedAt = at;
          grant.verifiedBy = nameOf(ctx);
        } else if (status === 'requested' || status === 'pending_client') {
          // Asked again: earlier confirmations no longer apply.
          grant.clientDoneAt = null;
          grant.verifiedAt = null;
          grant.verifiedBy = null;
        }
        const name = grant.label ?? label(metaFixture.accessProviders, grant.provider);
        addActivity(c, { event: 'access.updated', summary: `${name}: ${label(metaFixture.accessStatuses, status).toLowerCase()}.`, actor, visible: true, at });
      }
      // An empty note keeps the old one; only an explicit null clears it.
      if (ctx.body.note === null) grant.note = null;
      else if (note) grant.note = note;
      grant.updatedAt = at;
      touch(c);
      return ok(grant);
    },
  },

  /* ----- files ----- */
  {
    method: 'POST',
    path: '/assets/:id/sign',
    latency: 'fast',
    handler: (ctx) => {
      const found = owned(ctx, clientsDb.assets, ctx.params.id);
      if (!found) return notFound('That file');
      const signed = signAsset(found.row);
      // The bundle hands out the fresh URL from now on too.
      Object.assign(found.row, signed);
      return ok(signed);
    },
  },

  /* ----- approvals ----- */
  {
    method: 'POST',
    path: '/clients/:id/approvals',
    latency: 'normal',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      if (!c) return clientMissing();
      const { body } = ctx;
      const check = new Check();
      const title = str(body.title)?.trim() ?? '';
      if (!title) check.add('title', 'title', 'Enter a title.');
      else if (title.length > 200) check.add('title', 'title', 'Keep the title under 200 characters.');
      const kind = check.oneOf(body, 'kind', zApprovalKind, 'Pick a kind from the list.');
      const description = check.text(body, 'description', 4000);
      const previewUrl = check.url(body, 'previewUrl');
      const taskId = check.text(body, 'taskId', 100);
      const runIds = new Set(clientsDb.runs.filter((r) => r.clientId === c.id).map((r) => r.id));
      const task = taskId ? clientsDb.tasks.find((t) => t.id === taskId && runIds.has(t.runId)) : undefined;
      if (taskId && !task) check.add('taskId', 'task', "That task is not on this client's checklist.");
      let attachment: { label: string; url: string } | null = null;
      if (body.attachment !== undefined && body.attachment !== null) {
        const raw = body.attachment as Record<string, unknown>;
        const attLabel = typeof raw === 'object' ? str(raw.label)?.trim() : undefined;
        const attUrl = typeof raw === 'object' ? str(raw.url)?.trim() : undefined;
        if (!attLabel || !attUrl || !isUrl(attUrl)) check.add('attachment', 'attachment', 'Add a label and a full https:// link for the attachment.');
        else attachment = { label: attLabel, url: attUrl };
      }
      if (check.failed) return check.result();

      const at = nowIso();
      const same = clientsDb.approvals.filter((a) => a.clientId === c.id && a.title.trim().toLowerCase() === title.toLowerCase());
      // A new version replaces whatever was still waiting on the client.
      for (const prev of same) {
        if (prev.status === 'pending') {
          prev.status = 'superseded';
        }
      }
      const approval = {
        id: mockId('apr'),
        clientId: c.id,
        title,
        kind: kind ?? 'other',
        version: same.reduce((max, a) => Math.max(max, a.version), 0) + 1,
        description: description ?? null,
        previewUrl: previewUrl ?? null,
        taskId: task?.id ?? null,
        attachment,
        status: 'pending' as const,
        feedback: null,
        requestedAt: at,
        requestedBy: nameOf(ctx),
        decidedAt: null,
        decidedBy: null,
      };
      clientsDb.approvals.push(approval);
      // The linked client task now waits on the client's decision.
      if (task && task.owner === 'client' && !isClosed(task.status) && task.status !== 'waiting_client') {
        setTaskStatus(task, 'waiting_client', null, at);
      }
      addActivity(c, { event: 'approval.requested', summary: `Approval requested: ${title} v${approval.version}.`, actor: actorOf(ctx), visible: true, at });
      touch(c);
      return ok(approval, 201);
    },
  },

  /* ----- calls and the guarantee ----- */
  {
    method: 'POST',
    path: '/clients/:id/calls',
    latency: 'normal',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      if (!c) return clientMissing();
      const { body } = ctx;
      const check = new Check();
      const contactName = check.text(body, 'contactName', 200);
      const phone = check.text(body, 'phone', 40);
      const email = check.text(body, 'email', 200);
      if (email && !isEmail(email)) check.add('email', 'email', EMAIL);
      const serviceRequested = check.text(body, 'serviceRequested', 200);
      const bookedAt = check.instant(body, 'bookedAt');
      const bookedFor = check.instant(body, 'bookedFor');
      const status = check.oneOf(body, 'status', zCallStatus, 'Pick a status from the list.');
      const notes = check.text(body, 'notes', 4000);
      const source = check.oneOf(body, 'source', zCallSource, 'Pick a source from the list.');
      if (source === 'crm') check.add('source', 'source', 'CRM calls arrive through the sync. Pick another source.');
      if (!check.failed && !contactName && !phone && !email) {
        check.add('contactName', 'contact', 'Add a name, phone or email for this call.');
      }
      if (check.failed) return check.result();

      const at = nowIso();
      // Calls logged by hand are real prospects by definition: they count right away.
      const call: CallRecord = {
        id: mockId('call'),
        clientId: c.id,
        source: source ?? 'manual',
        contactName: contactName ?? null,
        phone: phone ?? null,
        email: email ?? null,
        serviceRequested: serviceRequested ?? null,
        bookedAt: bookedAt ?? at,
        bookedFor: bookedFor ?? null,
        status: status ?? 'booked',
        notes: notes ?? null,
        qualified: true,
        disqualifiedReason: null,
        reviewedAt: at,
        reviewedBy: nameOf(ctx),
        crmAppointmentId: null,
        createdAt: at,
        updatedAt: at,
      };
      clientsDb.calls.push(call);
      addActivity(c, { event: 'call.logged', summary: `Booked call logged: ${call.contactName ?? call.phone ?? call.email ?? 'unknown caller'}.`, actor: actorOf(ctx), at });
      touch(c);
      return callResult(call, c, 201);
    },
  },
  {
    method: 'PATCH',
    path: '/calls/:id',
    latency: 'normal',
    handler: (ctx) => {
      const found = owned(ctx, clientsDb.calls, ctx.params.id);
      if (!found) return notFound('That call');
      const { row: call, client: c } = found;
      const { body } = ctx;
      const check = new Check();
      const status = check.oneOf(body, 'status', zCallStatus, 'Pick a status from the list.');
      let qualified: boolean | null | undefined;
      if (has(body, 'qualified') && body.qualified !== undefined) {
        qualified = body.qualified === null ? null : bool(body.qualified);
        if (qualified === undefined) check.add('qualified', 'input', INPUT, 'Pick yes or no.');
      }
      const reason = check.oneOf(body, 'disqualifiedReason', zDisqualifyReason, 'Pick a reason from the list.', true);
      const notes = check.text(body, 'notes', 4000);
      const nextQualified = qualified === undefined ? call.qualified : qualified;
      const nextReason = nextQualified === true ? null : reason === undefined ? call.disqualifiedReason : reason;
      if (!check.failed && nextQualified === false && !nextReason) {
        check.add('disqualifiedReason', 'reason', 'Pick why it does not count.');
      }
      if (check.failed) return check.result();

      const at = nowIso();
      if (status) call.status = status;
      if (notes !== undefined) call.notes = notes;
      if (qualified !== undefined && qualified !== call.qualified) {
        call.qualified = qualified;
        call.reviewedAt = qualified === null ? null : at;
        call.reviewedBy = qualified === null ? null : nameOf(ctx);
      }
      call.disqualifiedReason = nextReason;
      call.updatedAt = at;
      addActivity(c, { event: 'call.updated', summary: `Call updated: ${call.contactName ?? 'unknown caller'}.`, actor: actorOf(ctx), at });
      touch(c);
      return callResult(call, c);
    },
  },
  {
    method: 'POST',
    path: '/calls/:id/review',
    latency: 'fast',
    handler: (ctx) => {
      const found = owned(ctx, clientsDb.calls, ctx.params.id);
      if (!found) return notFound('That call');
      const { row: call, client: c } = found;
      const counts = bool(ctx.body.counts);
      if (counts === undefined) return fail(400, 'counts', 'Say whether the call counts.', { counts: 'Send true or false.' });
      const at = nowIso();
      call.qualified = counts;
      // "Agree, it does not count" keeps the reason the sync preset.
      call.disqualifiedReason = counts ? null : call.disqualifiedReason ?? 'other';
      call.reviewedAt = at;
      call.reviewedBy = nameOf(ctx);
      call.updatedAt = at;
      const who = call.contactName ?? 'unknown caller';
      addActivity(c, {
        event: 'call.reviewed',
        summary: counts ? `${who}: counts toward the guarantee.` : `${who}: does not count (${reasonLabel(call.disqualifiedReason)}).`,
        actor: actorOf(ctx),
        at,
      });
      touch(c);
      return callResult(call, c);
    },
  },
  {
    method: 'PUT',
    path: '/clients/:id/crm-location',
    ownerOnly: true,
    latency: 'normal',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      if (!c) return clientMissing();
      const { body } = ctx;
      const rawLocation = body.locationId;
      if (rawLocation !== null && rawLocation !== undefined && typeof rawLocation !== 'string') {
        return fail(400, 'crm_location', 'Send the CRM sub-account id as text.', { locationId: 'Send the CRM sub-account id as text.' });
      }
      const locationId = typeof rawLocation === 'string' && rawLocation.trim() !== '' ? rawLocation.trim() : null;
      if (locationId && !CRM_ID.test(locationId)) {
        const message = 'That sub-account id does not look right. Copy it from the CRM: it is 20 letters and numbers.';
        return fail(400, 'crm_location', message, { locationId: message });
      }
      const rawCalendars = body.calendarIds ?? [];
      if (!Array.isArray(rawCalendars) || !rawCalendars.every((x) => typeof x === 'string')) {
        const message = 'Send the calendar ids as a list, one id per line.';
        return fail(400, 'crm_calendar', message, { calendarIds: message });
      }
      const calendarIds = Array.from(new Set(rawCalendars.map((x: string) => x.trim()).filter(Boolean)));
      const bad = calendarIds.find((id) => !CRM_ID.test(id));
      if (bad) {
        const message = `"${bad.length > 30 ? `${bad.slice(0, 30)}...` : bad}" is not a calendar id. Calendar ids are 20 letters and numbers, one per line.`;
        return fail(400, 'crm_calendar', message, { calendarIds: message });
      }
      if (!locationId && calendarIds.length) {
        const message = 'Add the sub-account id before its calendars.';
        return fail(400, 'crm_location', message, { locationId: message });
      }
      if (locationId === CRM_OWN_LOCATION_ID) {
        const message = "That is Tekmadev's own CRM account. Use the client's sub-account id.";
        return fail(422, 'crm_own', message, { locationId: message });
      }
      if (locationId) {
        const takenBy = Object.entries(clientsDb.crm).find(([clientId, m]) => clientId !== c.id && m.locationId === locationId && clientById(clientId));
        if (takenBy) {
          const other = clientById(takenBy[0]);
          const message = `That CRM sub-account is already mapped to ${other?.businessName ?? 'another client'}.`;
          return fail(409, 'crm_taken', message, { locationId: message });
        }
      }
      if (locationId === CRM_DB_FAIL_LOCATION_ID) {
        return fail(500, 'crm_db', 'Could not save the CRM mapping. Nothing changed. Try again.');
      }

      const at = nowIso();
      const current = clientsDb.crm[c.id];
      const sameLocation = !!current && current.locationId === locationId;
      clientsDb.crm[c.id] = {
        locationId,
        calendarIds: locationId ? calendarIds : [],
        // Appointments already synced for this sub-account stay queued; a new mapping starts clean.
        pendingToApply: sameLocation && current ? current.pendingToApply : 0,
        mappedAt: locationId ? (sameLocation && current?.mappedAt ? current.mappedAt : at) : null,
      };
      addActivity(c, { event: 'crm.mapped', summary: locationId ? 'CRM mapping saved.' : 'CRM mapping removed.', actor: actorOf(ctx), at });
      touch(c);
      return ok(clientsDb.crm[c.id]);
    },
  },

  /* ----- team ----- */
  {
    method: 'POST',
    path: '/clients/:id/members',
    latency: 'slow',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      if (!c) return clientMissing();
      const { body } = ctx;
      const check = new Check();
      const email = str(body.email)?.trim().toLowerCase() ?? '';
      if (!isEmail(email)) check.add('email', 'email', EMAIL);
      const name = check.text(body, 'name', 200);
      const title = check.text(body, 'title', 120);
      const role = check.oneOf(body, 'role', zMemberRole, 'Pick a role from the list.');
      if (check.failed) return check.result();
      if (clientsDb.members.some((m) => m.clientId === c.id && m.email.toLowerCase() === email)) {
        return fail(409, 'member_exists', 'That person is already on this team.', { email: 'That person is already on this team.' });
      }

      const at = nowIso();
      const invite = inviteBounces(email) ? 'failed' : 'sent';
      const member: Member = {
        id: mockId('mem'),
        clientId: c.id,
        email,
        name: name ?? null,
        title: title ?? null,
        role: role ?? 'member',
        status: 'invited',
        invitedAt: invite === 'sent' ? at : null,
        joinedAt: null,
        lastSeenAt: null,
      };
      clientsDb.members.push(member);
      const actor = actorOf(ctx);
      addActivity(c, { event: 'member.added', summary: `Added ${name ?? email} to the portal team.`, actor, at });
      if (invite === 'sent') addActivity(c, { event: 'member.invited', summary: `Portal invite sent to ${email}.`, actor, at });
      touch(c);
      return ok({ member, invite }, 201);
    },
  },
  {
    method: 'PATCH',
    path: '/members/:id',
    latency: 'normal',
    handler: (ctx) => {
      const found = owned(ctx, clientsDb.members, ctx.params.id);
      if (!found) return notFound('That person');
      const { row: member, client: c } = found;
      const check = new Check();
      const role = check.oneOf(ctx.body, 'role', zMemberRole, 'Pick a role from the list.');
      const status = check.oneOf(ctx.body, 'status', zMemberStatus, 'Pick a status from the list.');
      if (check.failed) return check.result();

      const changes: string[] = [];
      if (role && role !== member.role) {
        member.role = role;
        changes.push(`role ${label(metaFixture.memberRoles, role).toLowerCase()}`);
      }
      if (status) {
        // Turning someone back on: only people who have logged in before are "active".
        const next = status === 'disabled' ? 'disabled' : member.joinedAt ? 'active' : 'invited';
        if (next !== member.status) {
          member.status = next;
          changes.push(next === 'disabled' ? 'disabled' : 'turned back on');
        }
      }
      if (changes.length) {
        addActivity(c, { event: 'member.updated', summary: `${member.name ?? member.email}: ${changes.join(', ')}.`, actor: actorOf(ctx) });
        touch(c);
      }
      return ok(member);
    },
  },
  {
    method: 'POST',
    path: '/members/:id/invite',
    latency: 'slow',
    handler: (ctx) => {
      const found = owned(ctx, clientsDb.members, ctx.params.id);
      if (!found) return notFound('That person');
      const { row: member, client: c } = found;
      if (member.status === 'disabled') return fail(409, 'member_disabled', 'This person is turned off. Turn them back on first.');
      if (inviteBounces(member.email)) return fail(502, 'invite', INVITE_FAILED);
      const at = nowIso();
      const sent = member.status === 'invited' ? 'invite' : 'reset';
      if (sent === 'invite') member.invitedAt = at;
      addActivity(c, {
        event: sent === 'invite' ? 'member.invited' : 'member.reset',
        summary: sent === 'invite' ? `Portal invite sent again to ${member.email}.` : `Password reset link sent to ${member.email}.`,
        actor: actorOf(ctx),
        at,
      });
      touch(c);
      return ok({ member, sent });
    },
  },

  /* ----- activity ----- */
  {
    method: 'GET',
    path: '/clients/:id/activity',
    latency: 'fast',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      return c ? ok(paginate(activityOf(c.id), ctx.query)) : clientMissing();
    },
  },
  {
    method: 'POST',
    path: '/clients/:id/activity',
    latency: 'normal',
    handler: (ctx) => {
      const c = findClient(ctx, ctx.params.id);
      if (!c) return clientMissing();
      const { body } = ctx;
      const check = new Check();
      const kind = body.kind === 'note' || body.kind === 'update' ? body.kind : undefined;
      if (!kind) check.add('kind', 'kind', 'Pick an internal note or an update to the client.');
      const text = check.text(body, 'text', 5000);
      if (!text && !('text' in check.fields)) check.add('text', 'text', 'Write something first.');
      const subject = kind === 'update' ? check.text(body, 'subject', 200) : undefined;
      const actionUrl = kind === 'update' ? check.url(body, 'actionUrl') : undefined;
      if (check.failed || !kind || !text) return check.result();

      const entry = addActivity(c, {
        kind,
        event: kind,
        summary: kind === 'update' ? subject ?? shorten(text) : shorten(text),
        subject: subject ?? null,
        text,
        actionUrl: actionUrl ?? null,
        // An update appears in the client's portal (no email is sent); a note never does.
        visible: kind === 'update',
        actor: actorOf(ctx),
      });
      touch(c);
      return ok(entry, 201);
    },
  },

  /* ----- checklist templates (owner) ----- */
  {
    method: 'GET',
    path: '/onboarding-templates',
    ownerOnly: true,
    latency: 'fast',
    handler: () =>
      ok([...clientsDb.templates].sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage) || a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))),
  },
  {
    method: 'PUT',
    path: '/onboarding-templates/:key',
    ownerOnly: true,
    latency: 'normal',
    handler: (ctx) => {
      const key = ctx.params.key ?? '';
      if (!TEMPLATE_KEY.test(key) || key.length > 60) {
        return fail(400, 'key', 'Use lowercase letters, numbers and dashes for the key.', { key: 'Use lowercase letters, numbers and dashes for the key.' });
      }
      const existing = clientsDb.templates.find((t) => t.key === key);
      const { body } = ctx;
      const check = new Check();

      let title: string | undefined;
      if (has(body, 'title') || !existing) {
        title = str(body.title)?.trim();
        if (!title) check.add('title', 'title', 'Enter a title.');
      }
      const stage = check.oneOf(body, 'stage', zOnboardingStage, 'Pick a stage from the list.');
      const owner = check.oneOf(body, 'owner', zTaskOwner, 'Pick Client or Tekmadev.');
      const kind = check.oneOf(body, 'kind', zTaskKind, 'Pick a kind from the list.');
      if (!existing) {
        if (!has(body, 'stage')) check.add('stage', 'input', INPUT, 'Pick a stage from the list.');
        if (!has(body, 'owner')) check.add('owner', 'input', INPUT, 'Pick Client or Tekmadev.');
        if (!has(body, 'kind')) check.add('kind', 'input', INPUT, 'Pick a kind from the list.');
      }
      let plans: PlanId[] | undefined;
      if (has(body, 'plans') && body.plans !== undefined) {
        const raw = body.plans;
        const parsed = Array.isArray(raw) ? raw.map((p) => zPlanId.safeParse(p)) : null;
        if (!parsed || parsed.some((p) => !p.success)) check.add('plans', 'input', INPUT, 'Pick plans from the list.');
        else plans = Array.from(new Set(parsed.flatMap((p) => (p.success ? [p.data] : []))));
      }
      const dueOffsetDays = check.int(body, 'dueOffsetDays', 0, 365, 'Enter a whole number of days, 0 or more.', true);
      const sortOrder = check.int(body, 'sortOrder', -10000, 10000, 'Enter a whole number.');
      const description = check.text(body, 'description', 2000);
      const required = check.flag(body, 'required');
      const active = check.flag(body, 'active');

      // The JSON editor sends its raw text; parsed values are accepted as they are.
      let payload: OnboardingTemplate['payload'] | undefined;
      if (has(body, 'payload') && body.payload !== undefined) {
        const raw = body.payload;
        if (typeof raw === 'string') {
          if (raw.trim() === '') payload = null;
          else {
            try {
              payload = JSON.parse(raw) as OnboardingTemplate['payload'];
            } catch {
              check.add('payload', 'json', 'Payload must be valid JSON.');
            }
          }
        } else {
          payload = raw as OnboardingTemplate['payload'];
        }
      }
      if (check.failed) return check.result();

      const at = nowIso();
      const next: OnboardingTemplate = {
        key,
        title: title ?? existing?.title ?? key,
        stage: stage ?? existing?.stage ?? 'welcome',
        owner: owner ?? existing?.owner ?? 'tekmadev',
        kind: kind ?? existing?.kind ?? 'general',
        plans: plans ?? existing?.plans ?? [],
        dueOffsetDays: dueOffsetDays === undefined ? existing?.dueOffsetDays ?? null : dueOffsetDays,
        sortOrder: sortOrder ?? existing?.sortOrder ?? 100,
        description: description === undefined ? existing?.description ?? null : description,
        payload: payload === undefined ? existing?.payload ?? null : payload,
        required: required ?? existing?.required ?? true,
        active: active ?? existing?.active ?? true,
        updatedAt: at,
      };
      if (existing) Object.assign(existing, next);
      else clientsDb.templates.push(next);
      return ok(existing ?? next, existing ? 200 : 201);
    },
  },
  {
    method: 'DELETE',
    path: '/onboarding-templates/:key',
    ownerOnly: true,
    latency: 'normal',
    handler: (ctx) => {
      const index = clientsDb.templates.findIndex((t) => t.key === ctx.params.key);
      if (index < 0) return notFound('That template');
      clientsDb.templates.splice(index, 1);
      return ok({ key: ctx.params.key, deleted: true });
    },
  },
];
