import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import { api, seg } from '../client';
import type { Meta } from '../schemas/meta';
import {
  zAccessGrant,
  zActivity,
  zActivityPage,
  zAddMemberResult,
  zApproval,
  zCallResult,
  zClient,
  zClientBundle,
  zClientCredits,
  zClientList,
  zCreateClientResult,
  zCrmLocation,
  zDeletedTemplate,
  zGoLiveResult,
  zIntake,
  zMember,
  zMemberLinkResult,
  zOnboardingRun,
  zOnboardingTemplate,
  zOnboardingTemplates,
  zSignedAsset,
  zTaskResult,
  type AccessGrant,
  type AccessProvider,
  type AccessStatus,
  type Activity,
  type ActivityPage,
  type AddMemberResult,
  type Approval,
  type ApprovalKind,
  type CallResult,
  type CallSource,
  type CallStatus,
  type Client,
  type ClientAttention,
  type ClientBundle,
  type ClientCredits,
  type ClientList,
  type CreditRole,
  type ClientListStatus,
  type ClientsMeta,
  type ClientStatus,
  type CreateClientResult,
  type CrmLocation,
  type DeletedTemplate,
  type DisqualifyReason,
  type GoLiveResult,
  type GuaranteeCountRule,
  type GuaranteeStatus,
  type Intake,
  type Member,
  type MemberLinkResult,
  type MemberRole,
  type MemberStatus,
  type OnboardingRun,
  type OnboardingStage,
  type OnboardingTemplate,
  type PlanId,
  type SignedAsset,
  type TaskKind,
  type TaskOwner,
  type TaskResult,
  type TaskStatus,
} from '../schemas/clients';
import { getMeta, sessionKeys } from './session';

/**
 * Typed endpoints and query keys for the "clients" domain: the Clients list,
 * New client, the client detail bundle and every section's writes, Go live,
 * and the owner's checklist templates.
 *
 * Stages, progress, pace and call review badges are computed by the server.
 * Writes that change them return the recomputed parent (run or guarantee) so
 * screens can patch the cache without doing the maths themselves; anything
 * else should invalidate `clientKeys.detail(id)`.
 */

export const CLIENTS_PAGE_SIZE = 30;
export const ACTIVITY_PAGE_SIZE = 30;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export type ClientListParams = {
  /** Filter chip; the server defaults to `active` (not churned, not lead). */
  status?: ClientListStatus;
  /** Business name or email. */
  q?: string;
  /** Owner only ("Test" toggle). The server ignores it for managers. */
  includeTest?: boolean;
  /** Only the clients behind one of Home's "Needs you" cards (combines with status and q). */
  attention?: ClientAttention | null;
  limit?: number;
};

export type NewClientInput = {
  businessName: string;
  /** The portal invite goes here. A client with this email is reused, not duplicated. */
  email: string;
  name?: string | null;
  phone?: string | null;
  /** Omit or null for "No plan yet". */
  planId?: PlanId | null;
  assignedStrategist?: string | null;
  sendInvite: boolean;
  /**
   * "Create client from this lead": links the client to the lead and copies
   * its finder and booker to the client's credits with the default split.
   * Needs `leads.convert` too. 400 `lead_id` (gone), 409 `lead_converted`.
   */
  leadId?: string | null;
};

/** PUT /clients/:id/credits: replaces every row. Shares add up to exactly 100, or the list is empty. */
export type ClientCreditsInput = {
  credits: { email: string; role: CreditRole; share: number }[];
  /** Required, 1 to 500 characters: why it changed. */
  note: string;
};

/** PATCH /clients/:id: send only what changed; null clears a nullable field. */
export type ClientPatch = Partial<{
  businessName: string;
  legalName: string | null;
  website: string | null;
  primaryEmail: string;
  contactName: string | null;
  phone: string | null;
  industry: string | null;
  status: ClientStatus;
  planId: PlanId | null;
  timezone: string;
  assignedStrategist: string | null;
  liveDate: string | null;
  serviceArea: string | null;
  internalNotes: string | null;
  guaranteeEligible: boolean;
  guaranteeTarget: number;
  guaranteeWindowDays: number;
  guaranteeCountRule: GuaranteeCountRule;
  guaranteeStatus: GuaranteeStatus;
  guaranteeClockStartedOn: string | null;
}>;

/** Choosing `complete` completes the run for good (same as completeOnboarding). */
export type OnboardingPatch = Partial<{
  stage: OnboardingStage;
  blocked: boolean;
  blockedReason: string | null;
  targetLiveDate: string | null;
  kickoffAt: string | null;
}>;

export type NewTaskInput = {
  title: string;
  description?: string | null;
  /** Defaults to the run's current stage. */
  stage?: OnboardingStage;
  /** Defaults to tekmadev. A client-owned task shows up in the client's portal. */
  owner?: TaskOwner;
  kind?: TaskKind;
  required?: boolean;
  dueAt?: string | null;
};

export type NewAccessGrantInput = { provider: AccessProvider; label?: string | null; note?: string | null };

/** An empty note keeps the old one; null clears it. */
export type AccessGrantPatch = Partial<{ status: AccessStatus; note: string | null }>;

export type NewApprovalInput = {
  title: string;
  kind?: ApprovalKind;
  description?: string | null;
  previewUrl?: string | null;
  taskId?: string | null;
  attachment?: { label: string; url: string } | null;
};

/** "Log a booked call": hand-logged calls count right away. */
export type NewCallInput = Partial<{
  contactName: string | null;
  phone: string | null;
  email: string | null;
  serviceRequested: string | null;
  bookedAt: string;
  bookedFor: string | null;
  status: CallStatus;
  notes: string | null;
  source: CallSource;
}>;

/** `qualified: null` puts a call back to "Needs review". */
export type CallPatch = Partial<{
  status: CallStatus;
  qualified: boolean | null;
  disqualifiedReason: DisqualifyReason | null;
  notes: string | null;
}>;

/** null locationId removes the mapping. Empty calendarIds: every calendar counts. */
export type CrmLocationInput = { locationId: string | null; calendarIds: string[] };

export type NewMemberInput = { email: string; name?: string | null; title?: string | null; role?: MemberRole };

export type MemberPatch = Partial<{ role: MemberRole; status: MemberStatus }>;

export type NewActivityInput =
  | { kind: 'note'; text: string }
  | { kind: 'update'; text: string; subject?: string | null; actionUrl?: string | null };

/**
 * PUT /onboarding-templates/:key. `payload` may be the JSON editor's raw text:
 * the server parses it and answers 400 `json` when it is not valid JSON.
 */
export type TemplateInput = {
  title: string;
  stage: OnboardingStage;
  owner: TaskOwner;
  kind: TaskKind;
  /** Empty means every plan. */
  plans?: PlanId[];
  dueOffsetDays?: number | null;
  sortOrder?: number;
  description?: string | null;
  payload?: OnboardingTemplate['payload'] | string;
  required?: boolean;
  active?: boolean;
};

/* ------------------------------------------------------------------ */
/* Query keys                                                          */
/* ------------------------------------------------------------------ */

/** Normalised so equal filters always share one cache entry. */
const listKeyParams = (params: ClientListParams) => ({
  status: params.status ?? 'active',
  q: params.q?.trim() ?? '',
  includeTest: params.includeTest ?? false,
  attention: params.attention ?? null,
  limit: params.limit ?? CLIENTS_PAGE_SIZE,
});

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => ['clients', 'list'] as const,
  list: (params: ClientListParams) => ['clients', 'list', listKeyParams(params)] as const,
  details: () => ['clients', 'detail'] as const,
  /** The whole bundle: invalidate it after any write on a client's sections. */
  detail: (id: string) => ['clients', 'detail', id] as const,
  activity: (id: string) => ['clients', 'activity', id] as const,
  /** GET /clients/:id/credits. The bundle carries the same rows as `credits`. */
  credits: (id: string) => ['clients', 'credits', id] as const,
  templates: () => ['clients', 'templates'] as const,
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** GET /clients: one page of rows plus the stat cards (stats ignore the filter and search). */
export function getClients(params: ClientListParams & { cursor?: string | null }, signal?: AbortSignal) {
  return api.get<ClientList>('/clients', {
    query: {
      status: params.status ?? undefined,
      q: params.q?.trim() || undefined,
      test: params.includeTest ? 1 : undefined,
      attention: params.attention ?? undefined,
      // Passed back exactly as the server sent it.
      cursor: params.cursor ?? undefined,
      limit: params.limit ?? CLIENTS_PAGE_SIZE,
    },
    schema: zClientList,
    signal,
  });
}

/** GET /clients/:id: the whole detail bundle. `crmLocation` is absent for managers. */
export function getClient(id: string, signal?: AbortSignal) {
  return api.get<ClientBundle>(`/clients/${seg(id)}`, { schema: zClientBundle, signal });
}

/** GET /clients/:id/activity: newest first. The bundle carries the first page. */
export function getClientActivity(id: string, cursor?: string | null, signal?: AbortSignal, limit = ACTIVITY_PAGE_SIZE) {
  return api.get<ActivityPage>(`/clients/${seg(id)}/activity`, {
    query: { cursor: cursor ?? undefined, limit },
    schema: zActivityPage,
    signal,
  });
}

/** GET /onboarding-templates (owner): every checklist template, in stage then sort order. */
export function getOnboardingTemplates(signal?: AbortSignal) {
  return api.get<OnboardingTemplate[]>('/onboarding-templates', { schema: zOnboardingTemplates, signal });
}

/* ------------------------------------------------------------------ */
/* Client and Go live                                                  */
/* ------------------------------------------------------------------ */

/**
 * POST /clients. 400 `required` without a business name and a valid email.
 * `invite` says whether the portal invite actually went out.
 */
export function createClient(input: NewClientInput, idempotencyKey: string) {
  return api.post<CreateClientResult>('/clients', input, { schema: zCreateClientResult, idempotencyKey });
}

/**
 * GET /clients/:id/credits: every row with `clients.credits.view` (scope
 * "all"), only the caller's own rows with `activity.own` (scope "own").
 */
export function getClientCredits(id: string, signal?: AbortSignal) {
  return api.get<ClientCredits>(`/clients/${seg(id)}/credits`, { schema: zClientCredits, signal });
}

/**
 * PUT /clients/:id/credits (`clients.credits.edit`): replaces every row and
 * logs the change with the note. No Idempotency-Key: sending the same credits
 * again changes nothing. 400 `credits`, `total` or `note` with `fields`.
 */
export function saveClientCredits(id: string, input: ClientCreditsInput) {
  return api.put<ClientCredits>(`/clients/${seg(id)}/credits`, input, { schema: zClientCredits });
}

/** PATCH /clients/:id (account fields and guarantee terms) → the full client. */
export function updateClient(id: string, patch: ClientPatch) {
  return api.patch<Client>(`/clients/${seg(id)}`, patch, { schema: zClient });
}

/** DELETE /clients/:id (owner): moves the client to the trash. Returns it with `deletedAt` set. */
export function deleteClient(id: string) {
  return api.delete<Client>(`/clients/${seg(id)}`, { schema: zClient });
}

/**
 * POST /clients/:id/go-live. 422 `care_required` when the plan needs Webline
 * Care and none is active: show the message, then offer `override: true`.
 */
export function goLive(id: string, options: { override?: boolean } = {}) {
  return api.post<GoLiveResult>(`/clients/${seg(id)}/go-live`, options.override ? { override: true } : {}, { schema: zGoLiveResult });
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

/** PATCH /onboardings/:id. 409 `run_complete` once the run is complete. */
export function updateOnboarding(runId: string, patch: OnboardingPatch) {
  return api.patch<OnboardingRun>(`/onboardings/${seg(runId)}`, patch, { schema: zOnboardingRun });
}

/** POST /onboardings/:id/complete: irreversible (HoldToConfirm first). */
export function completeOnboarding(runId: string) {
  return api.post<OnboardingRun>(`/onboardings/${seg(runId)}/complete`, {}, { schema: zOnboardingRun });
}

/** POST /onboardings/:id/tasks → the task and the recomputed run. */
export function addOnboardingTask(runId: string, input: NewTaskInput, idempotencyKey: string) {
  return api.post<TaskResult>(`/onboardings/${seg(runId)}/tasks`, input, { schema: zTaskResult, idempotencyKey });
}

/** PATCH /tasks/:id { status } → the task and the recomputed run. Safe to apply optimistically. */
export function updateTaskStatus(taskId: string, status: TaskStatus) {
  return api.patch<TaskResult>(`/tasks/${seg(taskId)}`, { status }, { schema: zTaskResult });
}

/** POST /intakes/:id/review: only a submitted intake (409 `not_submitted` otherwise). */
export function reviewIntake(intakeId: string) {
  return api.post<Intake>(`/intakes/${seg(intakeId)}/review`, {}, { schema: zIntake });
}

/* ------------------------------------------------------------------ */
/* Access, files, approvals                                            */
/* ------------------------------------------------------------------ */

/** POST /clients/:id/access-grants ("Request another access"). */
export function requestAccess(clientId: string, input: NewAccessGrantInput, idempotencyKey: string) {
  return api.post<AccessGrant>(`/clients/${seg(clientId)}/access-grants`, input, { schema: zAccessGrant, idempotencyKey });
}

/** PATCH /access-grants/:id. The note is shown to the client; an empty note keeps the old one. */
export function updateAccessGrant(grantId: string, patch: AccessGrantPatch) {
  return api.patch<AccessGrant>(`/access-grants/${seg(grantId)}`, patch, { schema: zAccessGrant });
}

/** POST /assets/:id/sign: a fresh signed URL once `expiresAt` has passed. */
export function signAsset(assetId: string) {
  return api.post<SignedAsset>(`/assets/${seg(assetId)}/sign`, {}, { schema: zSignedAsset });
}

/**
 * POST /clients/:id/approvals. Requesting a title that already exists makes the
 * next version and supersedes the open one, so invalidate the bundle afterwards.
 */
export function requestApproval(clientId: string, input: NewApprovalInput, idempotencyKey: string) {
  return api.post<Approval>(`/clients/${seg(clientId)}/approvals`, input, { schema: zApproval, idempotencyKey });
}

/* ------------------------------------------------------------------ */
/* Calls and the guarantee                                             */
/* ------------------------------------------------------------------ */

/** POST /clients/:id/calls ("Log a booked call"). Counts immediately. */
export function logCall(clientId: string, input: NewCallInput, idempotencyKey: string) {
  return api.post<CallResult>(`/clients/${seg(clientId)}/calls`, input, { schema: zCallResult, idempotencyKey });
}

/** PATCH /calls/:id (edit sheet). A call marked not qualified needs a disqualify reason. */
export function updateCall(callId: string, patch: CallPatch) {
  return api.patch<CallResult>(`/calls/${seg(callId)}`, patch, { schema: zCallResult });
}

/**
 * POST /calls/:id/review: "Real prospect, count it" (true) or "Agree, it does
 * not count" (false, keeps the reason the sync preset).
 */
export function reviewCall(callId: string, counts: boolean) {
  return api.post<CallResult>(`/calls/${seg(callId)}/review`, { counts }, { schema: zCallResult });
}

/**
 * PUT /clients/:id/crm-location (owner). Errors: 400 `crm_location` /
 * `crm_calendar` (format), 409 `crm_taken`, 422 `crm_own`, 500 `crm_db`.
 */
export function saveCrmLocation(clientId: string, input: CrmLocationInput) {
  return api.put<CrmLocation>(`/clients/${seg(clientId)}/crm-location`, input, { schema: zCrmLocation });
}

/* ------------------------------------------------------------------ */
/* Team (the client's portal users)                                    */
/* ------------------------------------------------------------------ */

/** POST /clients/:id/members ("Add a person"). 400 `email`; `invite` says whether the email went out. */
export function addMember(clientId: string, input: NewMemberInput, idempotencyKey: string) {
  return api.post<AddMemberResult>(`/clients/${seg(clientId)}/members`, input, { schema: zAddMemberResult, idempotencyKey });
}

/** PATCH /members/:id (role and status selects). */
export function updateMember(memberId: string, patch: MemberPatch) {
  return api.patch<Member>(`/members/${seg(memberId)}`, patch, { schema: zMember });
}

/**
 * POST /members/:id/invite: "Resend invite" for invited people, "Send reset
 * link" for active ones. 502 `invite` when the email could not be sent.
 */
export function sendMemberLink(memberId: string) {
  return api.post<MemberLinkResult>(`/members/${seg(memberId)}/invite`, {}, { schema: zMemberLinkResult });
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

/** POST /clients/:id/activity: an internal note, or an update shown in the client's portal (no email). */
export function postClientActivity(clientId: string, input: NewActivityInput, idempotencyKey: string) {
  return api.post<Activity>(`/clients/${seg(clientId)}/activity`, input, { schema: zActivity, idempotencyKey });
}

/* ------------------------------------------------------------------ */
/* Checklist templates (owner)                                         */
/* ------------------------------------------------------------------ */

/** PUT /onboarding-templates/:key: create or replace. Changes apply to new runs only. */
export function saveOnboardingTemplate(key: string, input: TemplateInput) {
  return api.put<OnboardingTemplate>(`/onboarding-templates/${seg(key)}`, input, { schema: zOnboardingTemplate });
}

/** DELETE /onboarding-templates/:key. */
export function deleteOnboardingTemplate(key: string) {
  return api.delete<DeletedTemplate>(`/onboarding-templates/${seg(key)}`, { schema: zDeletedTemplate });
}

/* ------------------------------------------------------------------ */
/* Query options                                                       */
/* ------------------------------------------------------------------ */

/** The Clients list (infinite). The stat cards come with every page; read them from the first. */
export function clientsInfiniteQuery(params: ClientListParams = {}) {
  return infiniteQueryOptions({
    queryKey: clientKeys.list(params),
    queryFn: ({ pageParam, signal }) => getClients({ ...params, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function clientQuery(id: string) {
  return queryOptions({
    queryKey: clientKeys.detail(id),
    queryFn: ({ signal }) => getClient(id, signal),
  });
}

/** Older activity below the bundle's first page. */
export function clientActivityInfiniteQuery(id: string) {
  return infiniteQueryOptions({
    queryKey: clientKeys.activity(id),
    queryFn: ({ pageParam, signal }) => getClientActivity(id, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function onboardingTemplatesQuery() {
  return queryOptions({
    queryKey: clientKeys.templates(),
    queryFn: ({ signal }) => getOnboardingTemplates(signal),
  });
}

/**
 * The clients slice of GET /meta (statuses with tones, stages, kinds, plans...).
 * Shares the one ['meta'] cache entry with every other domain; labels change
 * rarely, so it stays fresh for 10 minutes.
 */
export function clientsMetaQuery() {
  return queryOptions({
    queryKey: sessionKeys.meta,
    queryFn: ({ signal }) => getMeta(signal),
    staleTime: 10 * 60_000,
    select: (meta: Meta): ClientsMeta => meta,
  });
}
