import { z } from 'zod';

import { zDate, zInstant, zMoney, zPage, zTone } from '../types';

/**
 * Schemas for the "clients" domain (contract section 11, Customers; brief 8.5).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * Field names follow the contract (camelCase). Derived values (derived stage,
 * percent done, guarantee pace, call review state) are computed by the server so
 * the list, the detail and Home always agree; the app never recomputes them.
 */

/* ---------- enums ---------- */

export const zClientStatus = z.enum(['lead', 'pending', 'onboarding', 'live', 'paused', 'churned']);
export type ClientStatus = z.infer<typeof zClientStatus>;

/** Filter chips on the list. `active` (the default) is everything except churned and lead. */
export const zClientListStatus = z.enum(['active', 'lead', 'onboarding', 'live', 'pending', 'paused', 'churned', 'all']);
export type ClientListStatus = z.infer<typeof zClientListStatus>;
export const CLIENT_LIST_STATUSES: readonly ClientListStatus[] = zClientListStatus.options;

/**
 * `GET /clients?attention=`: the clients behind each Home "Needs you" card, so a
 * card opens exactly the rows it counts (same rules as `GET /overview` attention).
 * blocked: the current run is blocked (churned excluded); calls_to_review: CRM
 * appointments waiting for review; intake_to_review: the latest intake is
 * submitted; behind_pace: live, guarantee behind pace with days left.
 */
export const zClientAttention = z.enum(['blocked', 'calls_to_review', 'intake_to_review', 'behind_pace']);
export type ClientAttention = z.infer<typeof zClientAttention>;
export const CLIENT_ATTENTIONS: readonly ClientAttention[] = zClientAttention.options;

/** Statuses the Account sheet can set (a lead becomes a client through checkout, not by hand). */
export const EDITABLE_CLIENT_STATUSES: readonly ClientStatus[] = ['pending', 'onboarding', 'live', 'paused', 'churned'];

export const zPlanId = z.enum(['convert', 'grow', 'lets-talk', 'webline']);
export type PlanId = z.infer<typeof zPlanId>;
export const zPlanKind = z.enum(['growth', 'product']);
export type PlanKind = z.infer<typeof zPlanKind>;

export const zOnboardingStage = z.enum(['welcome', 'intake', 'kickoff', 'build', 'review', 'go_live', 'optimizing', 'complete']);
export type OnboardingStage = z.infer<typeof zOnboardingStage>;
/** The 8 stages in tracker order. */
export const ONBOARDING_STAGES: readonly OnboardingStage[] = zOnboardingStage.options;

export const zTaskOwner = z.enum(['client', 'tekmadev']);
export type TaskOwner = z.infer<typeof zTaskOwner>;

export const zTaskKind = z.enum(['general', 'form', 'upload', 'access', 'meeting', 'agreement', 'build', 'approval', 'review', 'launch', 'billing']);
export type TaskKind = z.infer<typeof zTaskKind>;

export const zTaskStatus = z.enum(['todo', 'in_progress', 'waiting_client', 'done', 'skipped', 'blocked']);
export type TaskStatus = z.infer<typeof zTaskStatus>;
/** Done and skipped tasks are closed: struck through, and they count toward "done". */
export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = ['done', 'skipped'];

export const zAccessProvider = z.enum([
  'google_business_profile',
  'google_ads',
  'google_analytics',
  'google_search_console',
  'meta_business',
  'instagram',
  'domain_registrar',
  'dns',
  'website_hosting',
  'wordpress',
  'wix',
  'squarespace',
  'shopify',
  'crm',
  'call_tracking',
  'email_provider',
  'other',
]);
export type AccessProvider = z.infer<typeof zAccessProvider>;

export const zAccessMethod = z.enum(['invite_user', 'partner_request', 'password_manager', 'api_key', 'screen_share', 'other']);
export type AccessMethod = z.infer<typeof zAccessMethod>;

export const zAccessStatus = z.enum(['requested', 'pending_client', 'client_says_done', 'granted', 'verified', 'revoked', 'not_applicable']);
export type AccessStatus = z.infer<typeof zAccessStatus>;

export const zAssetKind = z.enum(['logo', 'photo', 'brand', 'document', 'video', 'other']);
export type AssetKind = z.infer<typeof zAssetKind>;

export const zApprovalKind = z.enum(['website', 'landing_page', 'copy', 'design', 'ad_creative', 'email', 'automation', 'other']);
export type ApprovalKind = z.infer<typeof zApprovalKind>;

export const zApprovalStatus = z.enum(['pending', 'approved', 'changes_requested', 'superseded']);
export type ApprovalStatus = z.infer<typeof zApprovalStatus>;

export const zAgreementStatus = z.enum(['draft', 'sent', 'viewed', 'signed', 'declined', 'voided']);
export type AgreementStatus = z.infer<typeof zAgreementStatus>;

export const zCallStatus = z.enum(['booked', 'confirmed', 'showed', 'no_show', 'cancelled', 'rescheduled']);
export type CallStatus = z.infer<typeof zCallStatus>;

/** Where a booked call came from. `crm` rows are synced; everything else is logged by hand. */
export const zCallSource = z.enum(['crm', 'manual', 'phone', 'website', 'referral', 'other']);
export type CallSource = z.infer<typeof zCallSource>;

/**
 * The review state behind the call's review badge:
 * needs_review "Needs review", qualified "Counts" (when `counts` is true),
 * disqualified "DQ: <reason>", outside_window "Outside window".
 */
export const zCallReview = z.enum(['needs_review', 'qualified', 'disqualified', 'outside_window']);
export type CallReview = z.infer<typeof zCallReview>;

export const zDisqualifyReason = z.enum(['spam', 'duplicate', 'out_of_area', 'wrong_service', 'fake', 'other']);
export type DisqualifyReason = z.infer<typeof zDisqualifyReason>;

export const zMemberRole = z.enum(['owner', 'admin', 'member']);
export type MemberRole = z.infer<typeof zMemberRole>;
export const zMemberStatus = z.enum(['active', 'invited', 'disabled']);
export type MemberStatus = z.infer<typeof zMemberStatus>;

export const zGuaranteeCountRule = z.enum(['booked', 'showed']);
export type GuaranteeCountRule = z.infer<typeof zGuaranteeCountRule>;

/** The stored guarantee status on the account (edited in the Account sheet). */
export const zGuaranteeStatus = z.enum(['not_started', 'running', 'met', 'missed', 'waived']);
export type GuaranteeStatus = z.infer<typeof zGuaranteeStatus>;

/** The computed pace badge: Met, On pace, Behind pace, Not started, n/a. */
export const zGuaranteePace = z.enum(['met', 'on_pace', 'behind', 'not_started', 'n/a']);
export type GuaranteePace = z.infer<typeof zGuaranteePace>;

export const zIntakeStatus = z.enum(['draft', 'submitted', 'reviewed']);
export type IntakeStatus = z.infer<typeof zIntakeStatus>;
export const zIntakeSectionKey = z.enum(['business', 'services', 'leads', 'brand', 'goals']);
export type IntakeSectionKey = z.infer<typeof zIntakeSectionKey>;
export const zIntakeFieldType = z.enum(['text', 'textarea', 'select', 'multiselect', 'url', 'number']);
export type IntakeFieldType = z.infer<typeof zIntakeFieldType>;

/** note: internal, update: shown in the client's portal, event: written by the system. */
export const zActivityKind = z.enum(['note', 'update', 'event']);
export type ActivityKind = z.infer<typeof zActivityKind>;
export const zActorKind = z.enum(['staff', 'client', 'system']);
export type ActorKind = z.infer<typeof zActorKind>;

export const zSubscriptionStatus = z.enum(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused', 'canceled']);
export type SubscriptionStatus = z.infer<typeof zSubscriptionStatus>;
export const zOrderStatus = z.enum(['paid', 'pending', 'failed', 'refunded', 'partially_refunded']);
export type OrderStatus = z.infer<typeof zOrderStatus>;

export const zInviteOutcome = z.enum(['sent', 'failed', 'skipped']);
export type InviteOutcome = z.infer<typeof zInviteOutcome>;

/* ---------- list ---------- */

/** Pace summary on a list row: "12/30 · 41d" plus the badge. */
export const zGuaranteeSummary = z.object({
  eligible: z.boolean(),
  counted: z.number().int(),
  target: z.number().int(),
  daysIn: z.number().int(),
  daysLeft: z.number().int(),
  windowDays: z.number().int(),
  status: zGuaranteePace,
});
export type GuaranteeSummary = z.infer<typeof zGuaranteeSummary>;

export const zClientRow = z.object({
  id: z.string(),
  businessName: z.string(),
  primaryEmail: z.string(),
  isTest: z.boolean(),
  planId: zPlanId.nullable(),
  planName: z.string().nullable(),
  status: zClientStatus,
  /** Derived stage of the latest onboarding run; null when there is no run. */
  stage: zOnboardingStage.nullable(),
  blocked: z.boolean(),
  blockedReason: z.string().nullable(),
  /** Open tasks by owner: "N client · M us". */
  openTasks: z.object({ client: z.number().int(), us: z.number().int() }),
  /** "live Sep 12" when liveDate is set, otherwise "8d to live" / "3d late" from targetDate (Toronto dates). */
  goLive: z.object({ liveDate: zDate.nullable(), targetDate: zDate.nullable() }),
  guarantee: zGuaranteeSummary,
  /**
   * CRM appointments waiting for staff review ("N calls to review"). Requested
   * addition to the contract: optional so a server that does not send it yet
   * still loads the list (the row then shows no review badge).
   */
  callsToReview: z.number().int().optional(),
  /** The latest intake is submitted and not reviewed yet ("Intake to review"). Requested addition, optional like callsToReview. */
  intakeToReview: z.boolean().optional(),
  /** Assigned strategist email. */
  strategist: z.string().nullable(),
  updatedAt: zInstant,
});
export type ClientRow = z.infer<typeof zClientRow>;

export const zClientStats = z.object({
  /** Signed up, not paid. */
  leads: z.number().int(),
  /** Onboarding plus pending. */
  onboarding: z.number().int(),
  live: z.number().int(),
  /** Onboarding runs marked blocked ("waiting on something"). */
  blocked: z.number().int(),
  /** Guarantee clock running and behind pace. */
  behindPace: z.number().int(),
});
export type ClientStats = z.infer<typeof zClientStats>;

/** GET /clients: one page plus the stat cards (stats ignore the status filter and search). */
export const zClientList = z.object({
  stats: zClientStats,
  items: z.array(zClientRow),
  nextCursor: z.string().nullable(),
});
export type ClientList = z.infer<typeof zClientList>;

/* ---------- client (account) ---------- */

export const zClient = z.object({
  id: z.string(),
  businessName: z.string(),
  legalName: z.string().nullable(),
  website: z.string().nullable(),
  primaryEmail: z.string(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  industry: z.string().nullable(),
  status: zClientStatus,
  planId: zPlanId.nullable(),
  planName: z.string().nullable(),
  isTest: z.boolean(),
  /** IANA zone of the client's business (display stays in America/Toronto). */
  timezone: z.string(),
  /** Strategist email. */
  assignedStrategist: z.string().nullable(),
  liveDate: zDate.nullable(),
  serviceArea: z.string().nullable(),
  /** Never shown to the client. */
  internalNotes: z.string().nullable(),
  guaranteeEligible: z.boolean(),
  guaranteeTarget: z.number().int(),
  guaranteeWindowDays: z.number().int(),
  guaranteeCountRule: zGuaranteeCountRule,
  guaranteeStatus: zGuaranteeStatus,
  guaranteeClockStartedOn: zDate.nullable(),
  /** Client portal home for this client (opened in a Custom Tab). */
  portalUrl: z.string(),
  createdAt: zInstant,
  updatedAt: zInstant,
  deletedAt: zInstant.nullable(),
});
export type Client = z.infer<typeof zClient>;

/* ---------- billing ---------- */

export const zBillingSubscription = z.object({
  id: z.string(),
  /** plan: a Growth System plan; care: Webline Care. */
  kind: z.enum(['plan', 'care']),
  productName: z.string(),
  status: zSubscriptionStatus,
  /** True while cancelling: show "Ending" and "ends <currentPeriodEnd>". */
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: zInstant.nullable(),
  amount: zMoney,
  interval: z.enum(['month', 'year']),
});
export type BillingSubscription = z.infer<typeof zBillingSubscription>;

export const zBillingOrder = z.object({
  id: z.string(),
  productName: z.string(),
  status: zOrderStatus,
  amount: zMoney,
  /** Display text such as "Visa •••• 4242"; null when unknown. */
  paymentMethod: z.string().nullable(),
  paidAt: zInstant.nullable(),
  createdAt: zInstant,
});
export type BillingOrder = z.infer<typeof zBillingOrder>;

/** Null when the client has no billing record at all ("no billing record"). */
export const zBilling = z.object({
  subscription: zBillingSubscription.nullable(),
  latestOrder: zBillingOrder.nullable(),
  /** Webline needs an active Webline Care plan before going live. */
  carePlan: z.object({ required: z.boolean(), active: z.boolean() }),
});
export type Billing = z.infer<typeof zBilling>;

/* ---------- onboarding ---------- */

export const zOnboardingRun = z.object({
  id: z.string(),
  clientId: z.string(),
  /** The stored stage (what the Stage select shows). */
  stage: zOnboardingStage,
  /** The first stage with an open required task, or the stored stage if further along. */
  derivedStage: zOnboardingStage,
  /** 0 to 100, required tasks done or skipped. */
  percentRequiredDone: z.number().int(),
  requiredDone: z.number().int(),
  requiredTotal: z.number().int(),
  /** Open tasks owned by the client or waiting on them. */
  waitingOnClient: z.number().int(),
  blocked: z.boolean(),
  blockedReason: z.string().nullable(),
  targetLiveDate: zDate.nullable(),
  kickoffAt: zInstant.nullable(),
  startedAt: zInstant,
  /** Set once; a completed run cannot be reopened. */
  completedAt: zInstant.nullable(),
  updatedAt: zInstant,
});
export type OnboardingRun = z.infer<typeof zOnboardingRun>;

export const zOnboardingTask = z.object({
  id: z.string(),
  runId: z.string(),
  /** The checklist template it came from; null for tasks added by hand. */
  templateKey: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  stage: zOnboardingStage,
  owner: zTaskOwner,
  kind: zTaskKind,
  required: z.boolean(),
  status: zTaskStatus,
  dueAt: zInstant.nullable(),
  doneAt: zInstant.nullable(),
  /** Display name of who closed it. */
  doneBy: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: zInstant,
  updatedAt: zInstant,
});
export type OnboardingTask = z.infer<typeof zOnboardingTask>;

export const zOnboarding = z.object({ run: zOnboardingRun, tasks: z.array(zOnboardingTask) });
export type Onboarding = z.infer<typeof zOnboarding>;

/* ---------- intake ---------- */

/** text, textarea, url and select answers are strings; multiselect is a list of option values. */
export const zIntakeAnswer = z.union([z.string(), z.number(), z.array(z.string()), z.null()]);
export type IntakeAnswer = z.infer<typeof zIntakeAnswer>;

export const zIntake = z.object({
  id: z.string(),
  clientId: z.string(),
  /** The latest version only: "vN". */
  version: z.number().int(),
  status: zIntakeStatus,
  startedAt: zInstant,
  submittedAt: zInstant.nullable(),
  reviewedAt: zInstant.nullable(),
  reviewedBy: z.string().nullable(),
  updatedAt: zInstant,
  /** Keyed by intake field key (keys are unique across the 5 sections). Missing key: not answered. */
  answers: z.record(z.string(), zIntakeAnswer),
});
export type Intake = z.infer<typeof zIntake>;

/* ---------- access ---------- */

export const zAccessGrant = z.object({
  id: z.string(),
  clientId: z.string(),
  provider: zAccessProvider,
  /** Shown instead of the provider name when set. */
  label: z.string().nullable(),
  status: zAccessStatus,
  /** The account, page or domain the access is for. */
  accountIdentifier: z.string().nullable(),
  method: zAccessMethod.nullable(),
  /** Note shown to the client. */
  note: z.string().nullable(),
  clientDoneAt: zInstant.nullable(),
  verifiedAt: zInstant.nullable(),
  verifiedBy: z.string().nullable(),
  requestedAt: zInstant,
  updatedAt: zInstant,
});
export type AccessGrant = z.infer<typeof zAccessGrant>;

/* ---------- files ---------- */

export const zAsset = z.object({
  id: z.string(),
  clientId: z.string(),
  fileName: z.string(),
  kind: zAssetKind,
  mime: z.string(),
  sizeBytes: z.number().int(),
  /** Signed URL. Re-sign with POST /assets/:id/sign once `expiresAt` has passed. */
  url: z.string(),
  expiresAt: zInstant,
  /** Signed thumbnail for images (same expiry); null for other files. */
  thumbnailUrl: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  uploadedAt: zInstant,
  uploadedBy: z.string().nullable(),
});
export type Asset = z.infer<typeof zAsset>;

export const zSignedAsset = z.object({
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  expiresAt: zInstant,
});
export type SignedAsset = z.infer<typeof zSignedAsset>;

/* ---------- approvals and agreements ---------- */

export const zApproval = z.object({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  kind: zApprovalKind,
  /** Requesting the same title again makes a new version and supersedes the open one. */
  version: z.number().int(),
  description: z.string().nullable(),
  previewUrl: z.string().nullable(),
  taskId: z.string().nullable(),
  attachment: z.object({ label: z.string(), url: z.string() }).nullable(),
  status: zApprovalStatus,
  /** The client's feedback, shown in quotes. */
  feedback: z.string().nullable(),
  requestedAt: zInstant,
  requestedBy: z.string().nullable(),
  decidedAt: zInstant.nullable(),
  decidedBy: z.string().nullable(),
});
export type Approval = z.infer<typeof zApproval>;

export const zAgreement = z.object({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  version: z.number().int(),
  status: zAgreementStatus,
  sentAt: zInstant.nullable(),
  viewedAt: zInstant.nullable(),
  acceptedAt: zInstant.nullable(),
  acceptedByName: z.string().nullable(),
  acceptedByEmail: z.string().nullable(),
  /** Full SHA-256 of the accepted text; the app shows a short prefix. */
  contentHash: z.string(),
});
export type Agreement = z.infer<typeof zAgreement>;

/* ---------- calls and the guarantee ---------- */

export const zCall = z.object({
  id: z.string(),
  clientId: z.string(),
  source: zCallSource,
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  serviceRequested: z.string().nullable(),
  /** When the appointment was booked (this is what the guarantee window counts). */
  bookedAt: zInstant,
  /** When the appointment is for. */
  bookedFor: zInstant.nullable(),
  status: zCallStatus,
  notes: z.string().nullable(),
  /** null: not reviewed yet. */
  qualified: z.boolean().nullable(),
  /** Set by staff, or preset by the CRM sync on an unreviewed call ("Agree, it does not count"). */
  disqualifiedReason: zDisqualifyReason.nullable(),
  review: zCallReview,
  /** Counts toward the guarantee right now (qualified, inside the window, status allowed by the count rule). */
  counts: z.boolean(),
  reviewedAt: zInstant.nullable(),
  reviewedBy: z.string().nullable(),
  crmAppointmentId: z.string().nullable(),
  createdAt: zInstant,
  updatedAt: zInstant,
});
export type Call = z.infer<typeof zCall>;

export const zGuarantee = z.object({
  eligible: z.boolean(),
  counted: z.number().int(),
  target: z.number().int(),
  windowDays: z.number().int(),
  countRule: zGuaranteeCountRule,
  clockStarted: z.boolean(),
  clockStartedOn: zDate.nullable(),
  /** Last day of the window (Toronto date). */
  endsOn: zDate.nullable(),
  daysIn: z.number().int(),
  daysLeft: z.number().int(),
  /** Linear pace: floor(target * daysIn / windowDays). */
  expectedByNow: z.number().int(),
  status: zGuaranteePace,
  /** CRM appointments waiting for review (the banner). */
  needsReview: z.number().int(),
});
export type Guarantee = z.infer<typeof zGuarantee>;

/* ---------- CRM mapping (owner only) ---------- */

export const zCrmLocation = z.object({
  /** CRM sub-account id; null when not mapped. */
  locationId: z.string().nullable(),
  /** Qualifying calendars; empty means every calendar counts. */
  calendarIds: z.array(z.string()),
  /** Appointments synced but not applied to this client yet. */
  pendingToApply: z.number().int(),
  mappedAt: zInstant.nullable(),
});
export type CrmLocation = z.infer<typeof zCrmLocation>;

/* ---------- portal team ---------- */

export const zMember = z.object({
  id: z.string(),
  clientId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  title: z.string().nullable(),
  role: zMemberRole,
  status: zMemberStatus,
  invitedAt: zInstant.nullable(),
  joinedAt: zInstant.nullable(),
  /** null: "no login yet". */
  lastSeenAt: zInstant.nullable(),
});
export type Member = z.infer<typeof zMember>;

export const zAddMemberResult = z.object({ member: zMember, invite: zInviteOutcome });
export type AddMemberResult = z.infer<typeof zAddMemberResult>;

/** POST /members/:id/invite: an invite for invited people, a reset link for active ones. */
export const zMemberLinkResult = z.object({ member: zMember, sent: z.enum(['invite', 'reset']) });
export type MemberLinkResult = z.infer<typeof zMemberLinkResult>;

/* ---------- activity ---------- */

export const zActivity = z.object({
  id: z.string(),
  clientId: z.string(),
  kind: zActivityKind,
  /** Event key, labelled by meta `activityEvents` (e.g. "task.done"). */
  event: z.string(),
  summary: z.string(),
  subject: z.string().nullable(),
  /** Full text of a note or update (the summary may be shortened). */
  text: z.string().nullable(),
  actionUrl: z.string().nullable(),
  /** Gold dot and "client sees" badge. */
  visibleToClient: z.boolean(),
  actor: z.object({ kind: zActorKind, name: z.string().nullable(), email: z.string().nullable() }),
  createdAt: zInstant,
});
export type Activity = z.infer<typeof zActivity>;

export const zActivityPage = zPage(zActivity);
export type ActivityPage = z.infer<typeof zActivityPage>;

/* ---------- commission credit (the website's docs/admin-api/staff.md) ---------- */

/** Who found the lead, who booked the call, anyone else who helped win the client. */
export const zCreditRole = z.enum(['finder', 'booker', 'other']);
export type CreditRole = z.infer<typeof zCreditRole>;

/** One credit on a client: a team member, their role and their share of 100 (two decimals at most). */
export const zClientCredit = z.object({
  email: z.string(),
  name: z.string().nullable(),
  role: zCreditRole,
  /** 0.01 to 100. */
  share: z.number(),
});
export type ClientCredit = z.infer<typeof zClientCredit>;

/** GET and PUT /clients/:id/credits. */
export const zClientCredits = z.object({
  clientId: z.string(),
  /** "all": every row (`clients.credits.view`); "own": only the caller's rows (`activity.own`). */
  scope: z.enum(['all', 'own']),
  /** The lead this client was created from. */
  leadId: z.string().nullable(),
  /** Finder, then booker, then other; biggest share first; then email. */
  credits: z.array(zClientCredit),
  /** The newest change among the rows shown. */
  updatedAt: zInstant.nullable(),
});
export type ClientCredits = z.infer<typeof zClientCredits>;

/* ---------- the detail bundle ---------- */

export const zClientBundle = z.object({
  client: zClient,
  billing: zBilling.nullable(),
  /** The latest run (a completed run is still returned); null: "No active onboarding run." */
  onboarding: zOnboarding.nullable(),
  intake: zIntake.nullable(),
  accessGrants: z.array(zAccessGrant),
  assets: z.array(zAsset),
  approvals: z.array(zApproval),
  agreements: z.array(zAgreement),
  calls: z.array(zCall),
  guarantee: zGuarantee,
  /** Owner only: the key is absent for managers. */
  crmLocation: zCrmLocation.optional(),
  members: z.array(zMember),
  /** First page, newest first; more with GET /clients/:id/activity. */
  activity: zActivityPage,
  /**
   * Commission credit: every row for `clients.credits.view`, only the caller's
   * own rows otherwise (often none). Optional: servers and caches from before
   * staff management do not send it.
   */
  credits: z.array(zClientCredit).optional(),
});
export type ClientBundle = z.infer<typeof zClientBundle>;

export const zCreateClientResult = z.object({
  client: zClient,
  /** True when a client with this email already existed and was updated instead. */
  reused: z.boolean(),
  invite: zInviteOutcome,
});
export type CreateClientResult = z.infer<typeof zCreateClientResult>;

/* ---------- mutation results that carry a recomputed parent ---------- */

/** POST /clients/:id/go-live: the live account plus the guarantee (`clockStarted` decides the toast). */
export const zGoLiveResult = z.object({ client: zClient, guarantee: zGuarantee });
export type GoLiveResult = z.infer<typeof zGoLiveResult>;

/** Task writes: the task and its run, whose derived stage and progress the server just recomputed. */
export const zTaskResult = z.object({ task: zOnboardingTask, run: zOnboardingRun });
export type TaskResult = z.infer<typeof zTaskResult>;

/** Call writes: the call and the guarantee it may have moved. */
export const zCallResult = z.object({ call: zCall, guarantee: zGuarantee });
export type CallResult = z.infer<typeof zCallResult>;

/* ---------- checklist templates (owner) ---------- */

export const zOnboardingTemplate = z.object({
  key: z.string(),
  title: z.string(),
  stage: zOnboardingStage,
  owner: zTaskOwner,
  kind: zTaskKind,
  /** Empty means every plan. */
  plans: z.array(zPlanId),
  dueOffsetDays: z.number().int().nullable(),
  sortOrder: z.number().int(),
  /** Shown to the client for client-owned tasks. */
  description: z.string().nullable(),
  /** Free JSON the portal uses for the task (e.g. which access provider). */
  payload: z.json(),
  required: z.boolean(),
  active: z.boolean(),
  updatedAt: zInstant,
});
export type OnboardingTemplate = z.infer<typeof zOnboardingTemplate>;

export const zOnboardingTemplates = z.array(zOnboardingTemplate);

export const zDeletedTemplate = z.object({ key: z.string(), deleted: z.literal(true) });
export type DeletedTemplate = z.infer<typeof zDeletedTemplate>;

/* ---------- GET /meta fragment ---------- */

const option = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string() });
const tonedOption = <T extends z.ZodType>(value: T) => z.object({ value, label: z.string(), tone: zTone });

export const zPlanOption = z.object({
  id: zPlanId,
  name: z.string(),
  kind: zPlanKind,
  /** Grow and Let's Talk: 30 qualified booked appointments in 60 days. */
  guarantee: z.boolean(),
  /** Webline needs Webline Care before going live. */
  needsCarePlan: z.boolean(),
});
export type PlanOption = z.infer<typeof zPlanOption>;

export const zOnboardingStageMeta = z.object({
  value: zOnboardingStage,
  label: z.string(),
  /** Internal day range for staff ("Days 1 to 3"); never shown to clients. */
  dayRange: z.string().nullable(),
});
export type OnboardingStageMeta = z.infer<typeof zOnboardingStageMeta>;

export const zIntakeField = z.object({
  key: z.string(),
  label: z.string(),
  type: zIntakeFieldType,
  /** For select and multiselect: answers hold the value, show the label. */
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  help: z.string().nullable(),
});
export type IntakeField = z.infer<typeof zIntakeField>;

export const zIntakeSection = z.object({
  key: zIntakeSectionKey,
  title: z.string(),
  fields: z.array(zIntakeField),
});
export type IntakeSection = z.infer<typeof zIntakeSection>;

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  clientStatuses: z.array(tonedOption(zClientStatus)),
  onboardingStages: z.array(zOnboardingStageMeta),
  taskKinds: z.array(option(zTaskKind)),
  taskStatuses: z.array(tonedOption(zTaskStatus)),
  taskOwners: z.array(option(zTaskOwner)),
  accessProviders: z.array(option(zAccessProvider)),
  accessMethods: z.array(option(zAccessMethod)),
  accessStatuses: z.array(tonedOption(zAccessStatus)),
  assetKinds: z.array(option(zAssetKind)),
  approvalKinds: z.array(option(zApprovalKind)),
  approvalStatuses: z.array(tonedOption(zApprovalStatus)),
  agreementStatuses: z.array(tonedOption(zAgreementStatus)),
  callStatuses: z.array(tonedOption(zCallStatus)),
  callSources: z.array(option(zCallSource)),
  callReviewStates: z.array(tonedOption(zCallReview)),
  disqualifyReasons: z.array(option(zDisqualifyReason)),
  memberRoles: z.array(option(zMemberRole)),
  memberStatuses: z.array(tonedOption(zMemberStatus)),
  guaranteeCountRules: z.array(option(zGuaranteeCountRule)),
  guaranteeStatuses: z.array(tonedOption(zGuaranteeStatus)),
  guaranteePaces: z.array(tonedOption(zGuaranteePace)),
  guaranteeDefaults: z.object({ target: z.number().int(), windowDays: z.number().int(), countRule: zGuaranteeCountRule }),
  intakeSchema: z.array(zIntakeSection),
  /**
   * Plans and one-time products a client can be on (New client, Account).
   * Named planOptions so it never collides with the Pricing slice of GET /meta.
   */
  planOptions: z.array(zPlanOption),
  activityEvents: z.array(z.object({ value: z.string(), label: z.string() })),
});
export type ClientsMeta = z.infer<typeof metaFragment>;
