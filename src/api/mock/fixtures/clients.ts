import { addDays, daysBetween, toDate, torontoDateOf } from '@/lib/dates';

import type {
  AccessGrant,
  AccessMethod,
  AccessProvider,
  AccessStatus,
  Activity,
  ActivityKind,
  Agreement,
  AgreementStatus,
  Approval,
  ApprovalKind,
  ApprovalStatus,
  Asset,
  AssetKind,
  Billing,
  BillingOrder,
  BillingSubscription,
  Call,
  CallSource,
  CallStatus,
  Client,
  ClientBundle,
  ClientRow,
  ClientsMeta,
  ClientStats,
  CrmLocation,
  DisqualifyReason,
  Guarantee,
  GuaranteeStatus,
  Intake,
  IntakeAnswer,
  IntakeStatus,
  Member,
  MemberRole,
  MemberStatus,
  OnboardingRun,
  OnboardingStage,
  OnboardingTask,
  OnboardingTemplate,
  PlanId,
  PlanOption,
  TaskKind,
  TaskOwner,
  TaskStatus,
} from '../../schemas/clients';
import { daysAgo, hoursAgo, isoMicros, minutesAgo, paginate, pick, torontoDate } from '../router';

import { SEED_CLIENTS, SEED_PEOPLE, STRATEGISTS, type SeedClient } from './seed';
import { MOCK_ACCOUNTS } from './staff';

/**
 * Fixtures for the "clients" domain: one rich bundle per SEED_CLIENTS entry plus
 * a few lighter accounts so the list pages. Everything here is mutable in-memory
 * state: the routes change it, and every read derives stages, pace and review
 * badges from it, so the list, the detail and Home always agree.
 *
 * All businesses and people are fictional.
 */

/* ---------- meta ---------- */

export const PLANS: PlanOption[] = [
  { id: 'convert', name: 'Convert', kind: 'growth', guarantee: false, needsCarePlan: false },
  { id: 'grow', name: 'Grow', kind: 'growth', guarantee: true, needsCarePlan: false },
  { id: 'lets-talk', name: "Let's Talk", kind: 'growth', guarantee: true, needsCarePlan: false },
  { id: 'webline', name: 'Webline', kind: 'product', guarantee: false, needsCarePlan: true },
];
export const planById = (id: PlanId | null) => (id ? PLANS.find((p) => p.id === id) ?? null : null);

export const GUARANTEE_DEFAULTS = { target: 30, windowDays: 60, countRule: 'booked' } as const;

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export const metaFixture: ClientsMeta = {
  clientStatuses: [
    { value: 'lead', label: 'Lead', tone: 'muted' },
    { value: 'pending', label: 'Pending', tone: 'neutral' },
    { value: 'onboarding', label: 'Onboarding', tone: 'gold' },
    { value: 'live', label: 'Live', tone: 'ok' },
    { value: 'paused', label: 'Paused', tone: 'warn' },
    { value: 'churned', label: 'Churned', tone: 'muted' },
  ],
  onboardingStages: [
    { value: 'welcome', label: 'Welcome', dayRange: 'Days 1 to 2' },
    { value: 'intake', label: 'Intake', dayRange: 'Days 1 to 5' },
    { value: 'kickoff', label: 'Kickoff', dayRange: 'Days 3 to 7' },
    { value: 'build', label: 'Build', dayRange: 'Days 7 to 21' },
    { value: 'review', label: 'Review', dayRange: 'Days 21 to 25' },
    { value: 'go_live', label: 'Go live', dayRange: 'Days 25 to 30' },
    { value: 'optimizing', label: 'Optimizing', dayRange: 'Days 30 to 90' },
    { value: 'complete', label: 'Complete', dayRange: null },
  ],
  taskKinds: [
    { value: 'general', label: 'General' },
    { value: 'form', label: 'Form' },
    { value: 'upload', label: 'Upload' },
    { value: 'access', label: 'Access' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'agreement', label: 'Agreement' },
    { value: 'build', label: 'Build' },
    { value: 'approval', label: 'Approval' },
    { value: 'review', label: 'Review' },
    { value: 'launch', label: 'Launch' },
    { value: 'billing', label: 'Billing' },
  ],
  taskStatuses: [
    { value: 'todo', label: 'To do', tone: 'neutral' },
    { value: 'in_progress', label: 'In progress', tone: 'gold' },
    { value: 'waiting_client', label: 'Waiting on client', tone: 'warn' },
    { value: 'done', label: 'Done', tone: 'ok' },
    { value: 'skipped', label: 'Skipped', tone: 'muted' },
    { value: 'blocked', label: 'Blocked', tone: 'signal' },
  ],
  taskOwners: [
    { value: 'client', label: 'Client' },
    { value: 'tekmadev', label: 'Tekmadev' },
  ],
  accessProviders: [
    { value: 'google_business_profile', label: 'Google Business Profile' },
    { value: 'google_ads', label: 'Google Ads' },
    { value: 'google_analytics', label: 'Google Analytics' },
    { value: 'google_search_console', label: 'Google Search Console' },
    { value: 'meta_business', label: 'Meta Business' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'domain_registrar', label: 'Domain registrar' },
    { value: 'dns', label: 'DNS' },
    { value: 'website_hosting', label: 'Website hosting' },
    { value: 'wordpress', label: 'WordPress' },
    { value: 'wix', label: 'Wix' },
    { value: 'squarespace', label: 'Squarespace' },
    { value: 'shopify', label: 'Shopify' },
    { value: 'crm', label: 'CRM' },
    { value: 'call_tracking', label: 'Call tracking' },
    { value: 'email_provider', label: 'Email provider' },
    { value: 'other', label: 'Other' },
  ],
  accessMethods: [
    { value: 'invite_user', label: 'Add us as a user' },
    { value: 'partner_request', label: 'Partner or agency request' },
    { value: 'password_manager', label: 'Shared through a password manager' },
    { value: 'api_key', label: 'API key' },
    { value: 'screen_share', label: 'Set up together on a call' },
    { value: 'other', label: 'Other' },
  ],
  accessStatuses: [
    { value: 'requested', label: 'Requested', tone: 'neutral' },
    { value: 'pending_client', label: 'Pending client', tone: 'gold' },
    { value: 'client_says_done', label: 'Client says done', tone: 'warn' },
    { value: 'granted', label: 'Granted', tone: 'ok' },
    { value: 'verified', label: 'Verified', tone: 'ok' },
    { value: 'revoked', label: 'Revoked', tone: 'signal' },
    { value: 'not_applicable', label: 'Not applicable', tone: 'muted' },
  ],
  assetKinds: [
    { value: 'logo', label: 'Logo' },
    { value: 'photo', label: 'Photo' },
    { value: 'brand', label: 'Brand guide' },
    { value: 'document', label: 'Document' },
    { value: 'video', label: 'Video' },
    { value: 'other', label: 'Other' },
  ],
  approvalKinds: [
    { value: 'website', label: 'Website' },
    { value: 'landing_page', label: 'Landing page' },
    { value: 'copy', label: 'Copy' },
    { value: 'design', label: 'Design' },
    { value: 'ad_creative', label: 'Ad creative' },
    { value: 'email', label: 'Email' },
    { value: 'automation', label: 'Automation' },
    { value: 'other', label: 'Other' },
  ],
  approvalStatuses: [
    { value: 'pending', label: 'Pending', tone: 'gold' },
    { value: 'approved', label: 'Approved', tone: 'ok' },
    { value: 'changes_requested', label: 'Changes requested', tone: 'warn' },
    { value: 'superseded', label: 'Superseded', tone: 'muted' },
  ],
  agreementStatuses: [
    { value: 'draft', label: 'Draft', tone: 'muted' },
    { value: 'sent', label: 'Sent', tone: 'gold' },
    { value: 'viewed', label: 'Viewed', tone: 'gold' },
    { value: 'signed', label: 'Signed', tone: 'ok' },
    { value: 'declined', label: 'Declined', tone: 'muted' },
    { value: 'voided', label: 'Voided', tone: 'muted' },
  ],
  callStatuses: [
    { value: 'booked', label: 'Booked', tone: 'neutral' },
    { value: 'confirmed', label: 'Confirmed', tone: 'gold' },
    { value: 'showed', label: 'Showed', tone: 'ok' },
    { value: 'no_show', label: 'No show', tone: 'warn' },
    { value: 'cancelled', label: 'Cancelled', tone: 'muted' },
    { value: 'rescheduled', label: 'Rescheduled', tone: 'neutral' },
  ],
  callSources: [
    { value: 'crm', label: 'CRM' },
    { value: 'manual', label: 'Manual' },
    { value: 'phone', label: 'Phone' },
    { value: 'website', label: 'Website' },
    { value: 'referral', label: 'Referral' },
    { value: 'other', label: 'Other' },
  ],
  callReviewStates: [
    { value: 'needs_review', label: 'Needs review', tone: 'gold' },
    { value: 'qualified', label: 'Counts', tone: 'ok' },
    { value: 'disqualified', label: 'DQ', tone: 'muted' },
    { value: 'outside_window', label: 'Outside window', tone: 'muted' },
  ],
  disqualifyReasons: [
    { value: 'spam', label: 'Spam' },
    { value: 'duplicate', label: 'Duplicate' },
    { value: 'out_of_area', label: 'Out of area' },
    { value: 'wrong_service', label: 'Wrong service' },
    { value: 'fake', label: 'Fake' },
    { value: 'other', label: 'Other' },
  ],
  memberRoles: [
    { value: 'owner', label: 'Owner' },
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
  ],
  memberStatuses: [
    { value: 'active', label: 'Active', tone: 'ok' },
    { value: 'invited', label: 'Invited', tone: 'gold' },
    { value: 'disabled', label: 'Disabled', tone: 'muted' },
  ],
  guaranteeCountRules: [
    { value: 'booked', label: 'Booked' },
    { value: 'showed', label: 'Showed' },
  ],
  guaranteeStatuses: [
    { value: 'not_started', label: 'Not started', tone: 'muted' },
    { value: 'running', label: 'Running', tone: 'gold' },
    { value: 'met', label: 'Met', tone: 'ok' },
    { value: 'missed', label: 'Missed', tone: 'signal' },
    { value: 'waived', label: 'Waived', tone: 'muted' },
  ],
  guaranteePaces: [
    { value: 'met', label: 'Met', tone: 'ok' },
    { value: 'on_pace', label: 'On pace', tone: 'ok' },
    { value: 'behind', label: 'Behind pace', tone: 'warn' },
    { value: 'not_started', label: 'Not started', tone: 'muted' },
    { value: 'n/a', label: 'n/a', tone: 'muted' },
  ],
  guaranteeDefaults: { ...GUARANTEE_DEFAULTS },
  intakeSchema: [
    {
      key: 'business',
      title: 'Your business',
      fields: [
        { key: 'business_legal_name', label: 'Legal business name', type: 'text', help: null },
        { key: 'business_years', label: 'Years in business', type: 'number', help: null },
        { key: 'business_locations', label: 'Locations and addresses', type: 'textarea', help: 'One per line.' },
        { key: 'business_hours', label: 'Business hours', type: 'textarea', help: null },
        {
          key: 'business_team_size',
          label: 'Team size',
          type: 'select',
          options: [
            { value: '1_5', label: '1 to 5' },
            { value: '6_15', label: '6 to 15' },
            { value: '16_50', label: '16 to 50' },
            { value: '50_plus', label: 'More than 50' },
          ],
          help: null,
        },
      ],
    },
    {
      key: 'services',
      title: 'Services',
      fields: [
        { key: 'services_list', label: 'Services you offer', type: 'textarea', help: null },
        { key: 'services_top', label: 'The services you want more of', type: 'textarea', help: 'Your top three, most important first.' },
        { key: 'services_area', label: 'Service area', type: 'textarea', help: 'Cities, neighbourhoods or a radius.' },
        {
          key: 'services_avg_job',
          label: 'Average job value',
          type: 'select',
          options: [
            { value: 'under_500', label: 'Under $500' },
            { value: '500_2000', label: '$500 to $2,000' },
            { value: '2000_10000', label: '$2,000 to $10,000' },
            { value: 'over_10000', label: 'Over $10,000' },
          ],
          help: null,
        },
        { key: 'services_emergency', label: 'Do you offer emergency service?', type: 'select', options: yesNo, help: null },
      ],
    },
    {
      key: 'leads',
      title: 'Leads and sales',
      fields: [
        {
          key: 'leads_sources',
          label: 'Where new customers find you today',
          type: 'multiselect',
          options: [
            { value: 'google_search', label: 'Google search' },
            { value: 'google_maps', label: 'Google Maps' },
            { value: 'referrals', label: 'Referrals' },
            { value: 'facebook', label: 'Facebook' },
            { value: 'instagram', label: 'Instagram' },
            { value: 'directories', label: 'Directories' },
            { value: 'flyers', label: 'Flyers and mail' },
            { value: 'other', label: 'Other' },
          ],
          help: null,
        },
        { key: 'leads_monthly', label: 'New leads per month today', type: 'number', help: 'A rough number is fine.' },
        { key: 'leads_handling', label: 'Who answers new leads, and how fast?', type: 'textarea', help: null },
        {
          key: 'leads_tracking',
          label: 'How you track leads today',
          type: 'select',
          options: [
            { value: 'none', label: 'Nothing yet' },
            { value: 'paper', label: 'Paper or a notebook' },
            { value: 'spreadsheet', label: 'A spreadsheet' },
            { value: 'other_crm', label: 'Another CRM' },
          ],
          help: null,
        },
        { key: 'leads_booking_url', label: 'Booking link, if you have one', type: 'url', help: null },
      ],
    },
    {
      key: 'brand',
      title: 'Brand',
      fields: [
        {
          key: 'brand_logo_ready',
          label: 'Do you have a logo file?',
          type: 'select',
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'refresh', label: 'Yes, but it needs a refresh' },
          ],
          help: null,
        },
        { key: 'brand_colours', label: 'Brand colours', type: 'text', help: null },
        {
          key: 'brand_voice',
          label: 'How you want to sound',
          type: 'multiselect',
          options: [
            { value: 'friendly', label: 'Friendly' },
            { value: 'professional', label: 'Professional' },
            { value: 'premium', label: 'Premium' },
            { value: 'local', label: 'Proudly local' },
            { value: 'technical', label: 'Expert and technical' },
            { value: 'playful', label: 'Playful' },
          ],
          help: null,
        },
        { key: 'brand_competitors', label: 'Competitors you want to beat', type: 'textarea', help: null },
        { key: 'brand_website', label: 'Current website', type: 'url', help: null },
      ],
    },
    {
      key: 'goals',
      title: 'Goals',
      fields: [
        {
          key: 'goals_primary',
          label: 'Main goal',
          type: 'select',
          options: [
            { value: 'more_calls', label: 'More calls' },
            { value: 'more_bookings', label: 'More booked jobs' },
            { value: 'bigger_jobs', label: 'Bigger jobs' },
            { value: 'new_area', label: 'A new service area' },
          ],
          help: null,
        },
        { key: 'goals_target', label: 'Booked appointments per month you want', type: 'number', help: null },
        { key: 'goals_capacity', label: 'New jobs you can take per week', type: 'number', help: null },
        { key: 'goals_success', label: 'What a great year looks like', type: 'textarea', help: null },
        { key: 'goals_notes', label: 'Anything else we should know?', type: 'textarea', help: null },
      ],
    },
  ],
  planOptions: PLANS,
  activityEvents: [
    { value: 'client.created', label: 'Client created' },
    { value: 'client.updated', label: 'Account updated' },
    { value: 'client.live', label: 'Went live' },
    { value: 'client.status', label: 'Status changed' },
    { value: 'billing.paid', label: 'Payment received' },
    { value: 'billing.failed', label: 'Payment failed' },
    { value: 'billing.care_started', label: 'Care plan started' },
    { value: 'onboarding.started', label: 'Onboarding started' },
    { value: 'onboarding.stage', label: 'Stage changed' },
    { value: 'onboarding.blocked', label: 'Blocked' },
    { value: 'onboarding.unblocked', label: 'Unblocked' },
    { value: 'onboarding.updated', label: 'Onboarding updated' },
    { value: 'onboarding.completed', label: 'Onboarding complete' },
    { value: 'task.added', label: 'Task added' },
    { value: 'task.status', label: 'Task updated' },
    { value: 'task.done', label: 'Task done' },
    { value: 'intake.started', label: 'Intake started' },
    { value: 'intake.submitted', label: 'Intake submitted' },
    { value: 'intake.reviewed', label: 'Intake reviewed' },
    { value: 'access.requested', label: 'Access requested' },
    { value: 'access.updated', label: 'Access updated' },
    { value: 'asset.uploaded', label: 'File uploaded' },
    { value: 'approval.requested', label: 'Approval requested' },
    { value: 'approval.decided', label: 'Approval decided' },
    { value: 'agreement.sent', label: 'Agreement sent' },
    { value: 'agreement.signed', label: 'Agreement signed' },
    { value: 'call.booked', label: 'Call booked' },
    { value: 'call.logged', label: 'Call logged' },
    { value: 'call.reviewed', label: 'Call reviewed' },
    { value: 'call.updated', label: 'Call updated' },
    { value: 'crm.mapped', label: 'CRM mapping saved' },
    { value: 'member.added', label: 'Person added' },
    { value: 'member.invited', label: 'Invite sent' },
    { value: 'member.joined', label: 'Portal login' },
    { value: 'member.updated', label: 'Person updated' },
    { value: 'member.reset', label: 'Reset link sent' },
    { value: 'note', label: 'Internal note' },
    { value: 'update', label: 'Update to client' },
  ],
};

/* ---------- the in-memory database ---------- */

/** What the store keeps; planName and portalUrl are derived on read. */
export type ClientRecord = Omit<Client, 'planName' | 'portalUrl'>;
/** Progress numbers and the derived stage are computed on read. */
export type RunRecord = Omit<OnboardingRun, 'derivedStage' | 'percentRequiredDone' | 'requiredDone' | 'requiredTotal' | 'waitingOnClient'>;
/** Review state and `counts` depend on the client's guarantee terms, so they are computed on read. */
export type CallRecord = Omit<Call, 'review' | 'counts'>;

export type ClientsDb = {
  clients: ClientRecord[];
  billing: Record<string, Billing>;
  runs: RunRecord[];
  tasks: OnboardingTask[];
  intakes: Intake[];
  accessGrants: AccessGrant[];
  assets: Asset[];
  /** Where each asset's signed URL points (the mock "storage path"). */
  assetSources: Record<string, { file: string; thumb: string | null }>;
  approvals: Approval[];
  agreements: Agreement[];
  calls: CallRecord[];
  crm: Record<string, CrmLocation>;
  members: Member[];
  activity: Activity[];
  templates: OnboardingTemplate[];
};

export const clientsDb: ClientsDb = {
  clients: [],
  billing: {},
  runs: [],
  tasks: [],
  intakes: [],
  accessGrants: [],
  assets: [],
  assetSources: {},
  approvals: [],
  agreements: [],
  calls: [],
  crm: {},
  members: [],
  activity: [],
  templates: [],
};

/** Tekmadev's own CRM agency account: mapping it to a client is refused (crm_own). */
export const CRM_OWN_LOCATION_ID = 'tekmadevAgencyOwn001';
/** Mapping this sub-account id makes the save fail (crm_db), so the error can be seen. */
export const CRM_DB_FAIL_LOCATION_ID = 'dbWriteFails00000000';

const PORTAL_BASE = 'https://account.tekmadev.com';
const DAY_MS = 86_400_000;

/* ---------- small helpers ---------- */

let seq = 0;
/** Deterministic fixture ids ("tsk_000k3"), so deep links stay stable across reloads. */
const fid = (prefix: string) => {
  seq += 1;
  return `${prefix}_${seq.toString(36).padStart(5, '0')}`;
};

const ms = (iso: string) => toDate(iso)?.getTime() ?? Date.now();
const shiftInstant = (iso: string, days: number) => isoMicros(new Date(ms(iso) + days * DAY_MS));
/** Clamp an instant so fixture history never lands in the future. */
const notFuture = (iso: string, fallbackHoursAgo = 2) => (ms(iso) > Date.now() ? hoursAgo(fallbackHoursAgo) : iso);

/** A stable 64 hex digit "hash" (fixtures only: not a real SHA-256). */
function fakeHash(text: string): string {
  let out = '';
  let h = 2166136261;
  for (let round = 0; out.length < 64; round++) {
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i) + round;
      h = Math.imul(h, 16777619) >>> 0;
    }
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

export function staffName(email: string | null | undefined): string | null {
  if (!email) return null;
  return MOCK_ACCOUNTS.find((a) => a.email === email)?.name ?? email;
}

const STAGE_INDEX: Record<OnboardingStage, number> = {
  welcome: 0,
  intake: 1,
  kickoff: 2,
  build: 3,
  review: 4,
  go_live: 5,
  optimizing: 6,
  complete: 7,
};
export const stageIndex = (stage: OnboardingStage) => STAGE_INDEX[stage];
const STAGES = Object.keys(STAGE_INDEX) as OnboardingStage[];

const isClosed = (status: TaskStatus) => status === 'done' || status === 'skipped';

type Actor = Activity['actor'];
const SYSTEM: Actor = { kind: 'system', name: 'System', email: null };
const staffActor = (email: string | null): Actor => ({ kind: 'staff', name: staffName(email), email });
const clientActor = (c: ClientRecord): Actor => ({ kind: 'client', name: c.contactName, email: c.primaryEmail });

/* ---------- checklist templates ---------- */

type TemplateSeed = [
  key: string,
  title: string,
  stage: OnboardingStage,
  owner: TaskOwner,
  kind: TaskKind,
  plans: PlanId[],
  dueOffsetDays: number | null,
  sortOrder: number,
  required: boolean,
  description: string | null,
  payload: OnboardingTemplate['payload'],
];

const GROWTH: PlanId[] = ['convert', 'grow', 'lets-talk'];
const GUARANTEED: PlanId[] = ['grow', 'lets-talk'];

const TEMPLATE_SEEDS: TemplateSeed[] = [
  ['welcome-call', 'Welcome call', 'welcome', 'tekmadev', 'meeting', [], 1, 10, true, null, null],
  ['portal-login', 'Log in to your portal', 'welcome', 'client', 'general', [], 1, 20, true, 'Use the invite email to set your password, then come back here.', null],
  ['service-agreement', 'Accept the service agreement', 'welcome', 'client', 'agreement', [], 2, 30, true, 'Read and accept the agreement under Agreements.', { agreement: 'service' }],
  ['complete-intake', 'Complete the intake form', 'intake', 'client', 'form', [], 3, 10, true, 'Tell us about your business, services, leads, brand and goals.', { sections: ['business', 'services', 'leads', 'brand', 'goals'] }],
  ['upload-logo', 'Upload your logo', 'intake', 'client', 'upload', [], 3, 20, true, 'The highest quality file you have. SVG or PNG is best.', { assetKind: 'logo' }],
  ['upload-photos', 'Upload photos of your work', 'intake', 'client', 'upload', [], 5, 30, false, 'Real photos of your team, vehicles and finished jobs beat stock photos every time.', { assetKind: 'photo', min: 5 }],
  ['review-intake', 'Review the intake', 'intake', 'tekmadev', 'review', [], 5, 40, true, null, null],
  ['kickoff-call', 'Kickoff call', 'kickoff', 'tekmadev', 'meeting', [], 7, 10, true, null, { durationMinutes: 45 }],
  ['access-gbp', 'Give us access to your Google Business Profile', 'kickoff', 'client', 'access', [], 7, 20, true, 'Add us as a manager on your profile.', { provider: 'google_business_profile' }],
  ['access-domain', 'Give us access to your domain registrar', 'kickoff', 'client', 'access', [], 7, 30, true, 'Where you bought your domain name.', { provider: 'domain_registrar' }],
  ['access-dns', 'Give us access to your DNS', 'kickoff', 'client', 'access', [], 7, 40, true, 'Often the same place as your domain registrar.', { provider: 'dns' }],
  ['access-ads', 'Give us access to Google Ads', 'kickoff', 'client', 'access', GUARANTEED, 7, 50, true, 'Accept our manager account request, or create an account and add us.', { provider: 'google_ads' }],
  ['access-hosting', 'Give us access to your website hosting', 'kickoff', 'client', 'access', ['webline'], 7, 60, false, 'Only if you already have hosting you want to keep.', { provider: 'website_hosting' }],
  ['build-funnel', 'Build the landing pages and booking flow', 'build', 'tekmadev', 'build', GROWTH, 14, 10, true, null, null],
  ['build-site', 'Build the Webline site', 'build', 'tekmadev', 'build', ['webline'], 14, 20, true, null, null],
  ['crm-setup', 'Set up the CRM sub-account and calendars', 'build', 'tekmadev', 'build', GROWTH, 14, 30, true, null, { calendars: ['estimates'] }],
  ['ai-receptionist', 'Set up the AI receptionist and missed-call text-back', 'build', 'tekmadev', 'build', GUARANTEED, 16, 40, true, null, null],
  ['ads-prep', 'Prepare the Google Ads campaigns', 'build', 'tekmadev', 'build', GUARANTEED, 16, 50, true, null, null],
  ['approve-site', 'Approve the website', 'review', 'client', 'approval', [], 20, 10, true, 'Look through the preview link and approve it, or tell us what to change.', null],
  ['approve-ads', 'Approve the ad copy', 'review', 'client', 'approval', GUARANTEED, 20, 20, true, 'Approve the ads before they go live.', null],
  ['qa-pass', 'QA pass on forms, calls and booking', 'review', 'tekmadev', 'review', [], 22, 30, true, null, { checklist: ['forms', 'calls', 'booking', 'mobile'] }],
  ['care-plan', 'Start your Webline Care plan', 'go_live', 'client', 'billing', ['webline'], 24, 10, true, 'Webline Care keeps your site hosted, backed up and updated.', { product: 'webline-care' }],
  ['dns-cutover', 'Point the domain to the new site', 'go_live', 'tekmadev', 'launch', [], 25, 20, true, null, null],
  ['launch-check', 'Launch checks', 'go_live', 'tekmadev', 'launch', [], 26, 30, true, null, null],
  ['first-report', 'Send the first results report', 'optimizing', 'tekmadev', 'review', GROWTH, 37, 10, false, null, null],
  ['ads-tune', 'First ads optimization pass', 'optimizing', 'tekmadev', 'build', GUARANTEED, 40, 20, false, null, null],
  ['fax-forwarding', 'Set up fax forwarding', 'build', 'tekmadev', 'general', [], null, 90, false, null, { legacy: true }],
];

for (const [key, title, stage, owner, kind, plans, dueOffsetDays, sortOrder, required, description, payload] of TEMPLATE_SEEDS) {
  clientsDb.templates.push({
    key,
    title,
    stage,
    owner,
    kind,
    plans,
    dueOffsetDays,
    sortOrder,
    description,
    payload,
    required,
    active: key !== 'fax-forwarding',
    updatedAt: daysAgo(90 - sortOrder / 10, 2),
  });
}

/** Active templates for a plan (no plan: only the templates meant for every plan), in checklist order. */
export function templatesFor(planId: PlanId | null): OnboardingTemplate[] {
  return clientsDb.templates
    .filter((t) => t.active && (t.plans.length === 0 || (planId !== null && t.plans.includes(planId))))
    .sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage) || a.sortOrder - b.sortOrder);
}

/* ---------- derived views ---------- */

export const clientById = (id: string) => clientsDb.clients.find((c) => c.id === id && !c.deletedAt);

export function clientView(c: ClientRecord): Client {
  return { ...c, planName: planById(c.planId)?.name ?? null, portalUrl: `${PORTAL_BASE}/?client=${encodeURIComponent(c.id)}` };
}

export const latestRun = (clientId: string): RunRecord | undefined =>
  clientsDb.runs.filter((r) => r.clientId === clientId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

export const tasksOf = (runId: string) =>
  clientsDb.tasks
    .filter((t) => t.runId === runId)
    .sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

export function runView(run: RunRecord): OnboardingRun {
  const tasks = tasksOf(run.id);
  const required = tasks.filter((t) => t.required);
  const requiredDone = required.filter((t) => isClosed(t.status)).length;
  const open = tasks.filter((t) => !isClosed(t.status));
  const firstOpen = required
    .filter((t) => !isClosed(t.status))
    .reduce<number | null>((min, t) => (min === null ? stageIndex(t.stage) : Math.min(min, stageIndex(t.stage))), null);
  // Nothing required is open: the run is ready to go live (or already past it).
  const derivedIndex = Math.max(stageIndex(run.stage), firstOpen ?? stageIndex('go_live'));
  return {
    ...run,
    derivedStage: run.completedAt ? 'complete' : STAGES[derivedIndex],
    percentRequiredDone: required.length ? Math.round((requiredDone / required.length) * 100) : 0,
    requiredDone,
    requiredTotal: required.length,
    waitingOnClient: open.filter((t) => t.owner === 'client' || t.status === 'waiting_client').length,
  };
}

type Window = { start: string; end: string } | null;

function windowOf(c: ClientRecord): Window {
  if (!c.guaranteeEligible || !c.guaranteeClockStartedOn) return null;
  return { start: c.guaranteeClockStartedOn, end: addDays(c.guaranteeClockStartedOn, c.guaranteeWindowDays - 1) };
}

export function callView(call: CallRecord, c: ClientRecord): Call {
  const window = windowOf(c);
  const bookedOn = torontoDateOf(call.bookedAt);
  const inWindow = !!window && bookedOn >= window.start && bookedOn <= window.end;
  const review: Call['review'] =
    call.qualified === null ? 'needs_review' : call.qualified === false ? 'disqualified' : c.guaranteeEligible && !inWindow ? 'outside_window' : 'qualified';
  const statusCounts = c.guaranteeCountRule === 'showed' ? call.status === 'showed' : call.status !== 'cancelled';
  return { ...call, review, counts: review === 'qualified' && statusCounts };
}

export const callsOf = (c: ClientRecord) =>
  clientsDb.calls
    .filter((x) => x.clientId === c.id)
    .map((x) => callView(x, c))
    .sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));

export function guaranteeFor(c: ClientRecord, today: string = torontoDate(0)): Guarantee {
  const calls = callsOf(c);
  const counted = calls.filter((x) => x.counts).length;
  const needsReview = calls.filter((x) => x.review === 'needs_review').length;
  const base = {
    eligible: c.guaranteeEligible,
    counted,
    target: c.guaranteeTarget,
    windowDays: c.guaranteeWindowDays,
    countRule: c.guaranteeCountRule,
    needsReview,
  };
  if (!c.guaranteeEligible || c.guaranteeStatus === 'waived') {
    return { ...base, clockStarted: false, clockStartedOn: null, endsOn: null, daysIn: 0, daysLeft: 0, expectedByNow: 0, status: 'n/a' };
  }
  const window = windowOf(c);
  if (!window) {
    return { ...base, clockStarted: false, clockStartedOn: null, endsOn: null, daysIn: 0, daysLeft: c.guaranteeWindowDays, expectedByNow: 0, status: 'not_started' };
  }
  const daysIn = Math.min(Math.max(daysBetween(window.start, today), 0), c.guaranteeWindowDays);
  const expectedByNow = Math.floor((c.guaranteeTarget * daysIn) / Math.max(c.guaranteeWindowDays, 1));
  return {
    ...base,
    clockStarted: true,
    clockStartedOn: window.start,
    endsOn: window.end,
    daysIn,
    daysLeft: c.guaranteeWindowDays - daysIn,
    expectedByNow,
    status: counted >= c.guaranteeTarget ? 'met' : counted >= expectedByNow ? 'on_pace' : 'behind',
  };
}

export function rowFor(c: ClientRecord): ClientRow {
  const run = latestRun(c.id);
  const view = run ? runView(run) : null;
  const active = !!run && !run.completedAt;
  const open = active ? tasksOf(run.id).filter((t) => !isClosed(t.status)) : [];
  const g = guaranteeFor(c);
  return {
    id: c.id,
    businessName: c.businessName,
    primaryEmail: c.primaryEmail,
    isTest: c.isTest,
    planId: c.planId,
    planName: planById(c.planId)?.name ?? null,
    status: c.status,
    stage: view?.derivedStage ?? null,
    blocked: active && run.blocked,
    blockedReason: active && run.blocked ? run.blockedReason : null,
    openTasks: { client: open.filter((t) => t.owner === 'client').length, us: open.filter((t) => t.owner === 'tekmadev').length },
    goLive: { liveDate: c.liveDate, targetDate: c.liveDate ? null : run?.targetLiveDate ?? null },
    guarantee: { eligible: g.eligible, counted: g.counted, target: g.target, daysIn: g.daysIn, daysLeft: g.daysLeft, windowDays: g.windowDays, status: g.status },
    strategist: c.assignedStrategist,
    updatedAt: c.updatedAt,
  };
}

/** Clients a caller may see: never deleted ones; test clients only for owners who asked for them. */
export const visibleClients = (includeTest: boolean) => clientsDb.clients.filter((c) => !c.deletedAt && (includeTest || !c.isTest));

export function statsFor(includeTest: boolean): ClientStats {
  const rows = visibleClients(includeTest).map(rowFor);
  return {
    leads: rows.filter((r) => r.status === 'lead').length,
    onboarding: rows.filter((r) => r.status === 'onboarding' || r.status === 'pending').length,
    live: rows.filter((r) => r.status === 'live').length,
    blocked: rows.filter((r) => r.blocked && r.status !== 'churned').length,
    behindPace: rows.filter((r) => r.guarantee.status === 'behind' && r.guarantee.daysLeft > 0 && r.status === 'live').length,
  };
}

/** Counts for Home's "needs attention" card (real clients only). */
export function clientsAttention() {
  const real = visibleClients(false);
  return {
    blockedOnboardings: statsFor(false).blocked,
    callsToReview: real.reduce((n, c) => n + guaranteeFor(c).needsReview, 0),
    intakesToReview: real.filter((c) => latestIntake(c.id)?.status === 'submitted').length,
    behindPace: statsFor(false).behindPace,
  };
}

export const latestIntake = (clientId: string) =>
  clientsDb.intakes.filter((i) => i.clientId === clientId).sort((a, b) => b.version - a.version)[0];

export const activityOf = (clientId: string) =>
  clientsDb.activity.filter((a) => a.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function crmOf(clientId: string): CrmLocation {
  return clientsDb.crm[clientId] ?? { locationId: null, calendarIds: [], pendingToApply: 0, mappedAt: null };
}

export function bundleFor(c: ClientRecord, isOwner: boolean): ClientBundle {
  const run = latestRun(c.id);
  const byNewest = <T>(field: (row: T) => string) => (a: T, b: T) => field(b).localeCompare(field(a));
  return {
    client: clientView(c),
    billing: clientsDb.billing[c.id] ?? null,
    onboarding: run ? { run: runView(run), tasks: tasksOf(run.id) } : null,
    intake: latestIntake(c.id) ?? null,
    accessGrants: clientsDb.accessGrants.filter((g) => g.clientId === c.id).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    assets: clientsDb.assets.filter((a) => a.clientId === c.id).sort(byNewest((a) => a.uploadedAt)),
    approvals: clientsDb.approvals.filter((a) => a.clientId === c.id).sort(byNewest((a) => a.requestedAt)),
    agreements: clientsDb.agreements.filter((a) => a.clientId === c.id).sort(byNewest((a) => a.sentAt ?? a.acceptedAt ?? '')),
    calls: callsOf(c),
    guarantee: guaranteeFor(c),
    // Owner only: managers never get the key at all.
    ...(isOwner ? { crmLocation: crmOf(c.id) } : {}),
    members: clientsDb.members.filter((m) => m.clientId === c.id).sort((a, b) => (a.invitedAt ?? a.joinedAt ?? '').localeCompare(b.invitedAt ?? b.joinedAt ?? '')),
    activity: paginate(activityOf(c.id), {}),
  };
}

/* ---------- writers (shared by the seed below and the routes) ---------- */

export function addActivity(
  c: ClientRecord,
  input: { kind?: ActivityKind; event: string; summary: string; actor: Actor; at?: string; subject?: string | null; text?: string | null; actionUrl?: string | null; visible?: boolean },
): Activity {
  const kind = input.kind ?? 'event';
  const entry: Activity = {
    id: fid('act'),
    clientId: c.id,
    kind,
    event: input.event,
    summary: input.summary,
    subject: input.subject ?? null,
    text: input.text ?? null,
    actionUrl: input.actionUrl ?? null,
    visibleToClient: input.visible ?? kind === 'update',
    actor: input.actor,
    createdAt: input.at ?? minutesAgo(0),
  };
  clientsDb.activity.push(entry);
  return entry;
}

/** Create a run with tasks from the active templates for the client's plan. */
export function createRun(
  c: ClientRecord,
  opts: { startedAt: string; stage?: OnboardingStage; targetLiveDate?: string | null; kickoffAt?: string | null; blockedReason?: string | null },
): RunRecord {
  const run: RunRecord = {
    id: fid('run'),
    clientId: c.id,
    stage: opts.stage ?? 'welcome',
    blocked: !!opts.blockedReason,
    blockedReason: opts.blockedReason ?? null,
    targetLiveDate: opts.targetLiveDate ?? null,
    kickoffAt: opts.kickoffAt ?? null,
    startedAt: opts.startedAt,
    completedAt: null,
    updatedAt: opts.startedAt,
  };
  clientsDb.runs.push(run);
  for (const t of templatesFor(c.planId)) {
    clientsDb.tasks.push({
      id: fid('tsk'),
      runId: run.id,
      templateKey: t.key,
      title: t.title,
      description: t.description,
      stage: t.stage,
      owner: t.owner,
      kind: t.kind,
      required: t.required,
      status: 'todo',
      dueAt: t.dueOffsetDays === null ? null : shiftInstant(opts.startedAt, t.dueOffsetDays),
      doneAt: null,
      doneBy: null,
      sortOrder: t.sortOrder,
      createdAt: opts.startedAt,
      updatedAt: opts.startedAt,
    });
  }
  return run;
}

/** Who closed a task, as the portal records it. */
export const taskCloser = (c: ClientRecord, owner: TaskOwner) => (owner === 'client' ? c.contactName ?? c.primaryEmail : staffName(c.assignedStrategist));

export function setTaskStatus(task: OnboardingTask, status: TaskStatus, by: string | null, at: string = minutesAgo(0)) {
  task.status = status;
  task.updatedAt = at;
  if (isClosed(status)) {
    task.doneAt = at;
    task.doneBy = by;
  } else {
    task.doneAt = null;
    task.doneBy = null;
  }
}

/* ---------- seed builders ---------- */

const PRICES = { convert: 149_700, grow: 249_700, 'lets-talk': 395_000, webline: 99_700, care: 7_750 } as const;
const SETUP = { convert: 149_700, grow: 249_700, 'lets-talk': 450_000 } as const;
const CARDS = ['Visa •••• 4242', 'Mastercard •••• 5454', 'Amex •••• 0005', 'Visa •••• 1881', 'Mastercard •••• 4444'];
const cad = (amount: number) => ({ amount, currency: 'CAD' });

function seedOf(id: string): SeedClient {
  const s = SEED_CLIENTS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown seed client ${id}`);
  return s;
}

function addClient(s: SeedClient, o: Partial<ClientRecord> = {}): ClientRecord {
  const plan = planById(s.planId);
  const rec: ClientRecord = {
    id: s.id,
    businessName: s.businessName,
    legalName: null,
    website: s.website,
    primaryEmail: s.email,
    contactName: s.contactName,
    phone: s.phone,
    industry: s.industry,
    status: s.status,
    planId: s.planId,
    isTest: s.isTest,
    timezone: 'America/Toronto',
    assignedStrategist: STRATEGISTS[s.ageDays % 2],
    liveDate: null,
    serviceArea: s.city,
    internalNotes: null,
    guaranteeEligible: plan?.guarantee ?? false,
    guaranteeTarget: GUARANTEE_DEFAULTS.target,
    guaranteeWindowDays: GUARANTEE_DEFAULTS.windowDays,
    guaranteeCountRule: GUARANTEE_DEFAULTS.countRule,
    guaranteeStatus: 'not_started',
    guaranteeClockStartedOn: null,
    createdAt: daysAgo(s.ageDays, 5),
    updatedAt: hoursAgo(1 + (s.ageDays % 40) * 3),
    deletedAt: null,
    ...o,
  };
  clientsDb.clients.push(rec);
  return rec;
}

/** Go live `days` ago: live date, and the guarantee clock for eligible plans. */
function liveSince(c: ClientRecord, days: number, guaranteeStatus: GuaranteeStatus = 'running') {
  c.liveDate = torontoDate(-days);
  if (c.guaranteeEligible) {
    c.guaranteeClockStartedOn = torontoDate(-days);
    c.guaranteeStatus = guaranteeStatus;
  }
}

type RunSpec = {
  startedDaysAgo: number;
  stage: OnboardingStage;
  blockedReason?: string;
  targetLiveDate?: string | null;
  kickoffAt?: string | null;
  completedDaysAgo?: number;
  /** Status by template key. Unlisted tasks: done before `stage`, todo from it on. */
  progress?: Record<string, TaskStatus>;
};

function seedRun(c: ClientRecord, spec: RunSpec): RunRecord {
  const run = createRun(c, {
    startedAt: daysAgo(spec.startedDaysAgo, 4),
    stage: spec.stage,
    targetLiveDate: spec.targetLiveDate ?? null,
    kickoffAt: spec.kickoffAt ?? null,
    blockedReason: spec.blockedReason ?? null,
  });
  const current = stageIndex(spec.stage);
  for (const task of tasksOf(run.id)) {
    const listed = task.templateKey ? spec.progress?.[task.templateKey] : undefined;
    const status: TaskStatus = listed ?? (spec.completedDaysAgo !== undefined || stageIndex(task.stage) < current ? 'done' : 'todo');
    if (status === 'todo') continue;
    const due = task.dueAt ?? shiftInstant(run.startedAt, 3);
    const at = notFuture(shiftInstant(due, -0.3), 3 + (task.sortOrder % 9));
    setTaskStatus(task, status, isClosed(status) ? taskCloser(c, task.owner) : null, at);
  }
  if (spec.completedDaysAgo !== undefined) {
    run.stage = 'complete';
    run.completedAt = daysAgo(spec.completedDaysAgo, 2);
  }
  run.updatedAt = notFuture(daysAgo(Math.min(spec.startedDaysAgo, 1), 1));
  return run;
}

function addHandTask(
  run: RunRecord,
  c: ClientRecord,
  t: { title: string; description?: string | null; stage: OnboardingStage; owner: TaskOwner; kind?: TaskKind; required?: boolean; status: TaskStatus; dueInDays?: number | null; createdDaysAgo: number },
): OnboardingTask {
  const created = daysAgo(t.createdDaysAgo, 1);
  const task: OnboardingTask = {
    id: fid('tsk'),
    runId: run.id,
    templateKey: null,
    title: t.title,
    description: t.description ?? null,
    stage: t.stage,
    owner: t.owner,
    kind: t.kind ?? 'general',
    required: t.required ?? false,
    status: 'todo',
    dueAt: t.dueInDays === undefined || t.dueInDays === null ? null : isoMicros(new Date(Date.now() + t.dueInDays * DAY_MS)),
    doneAt: null,
    doneBy: null,
    sortOrder: 100,
    createdAt: created,
    updatedAt: created,
  };
  clientsDb.tasks.push(task);
  if (t.status !== 'todo') setTaskStatus(task, t.status, isClosed(t.status) ? taskCloser(c, t.owner) : null, notFuture(shiftInstant(created, 0.5)));
  return task;
}

function setTask(run: RunRecord, key: string, patch: Partial<OnboardingTask>) {
  const task = tasksOf(run.id).find((t) => t.templateKey === key);
  if (task) Object.assign(task, patch);
}

const SERVICES: Record<string, { list: string; top: string; avg: string; competitors: string; colours: string }> = {
  Plumbing: {
    list: 'Drain cleaning, water heaters, sump pumps, leak repair, bathroom renovations, backflow testing',
    top: 'Water heater installs\nDrain cleaning\nSump pumps',
    avg: '500_2000',
    competitors: 'Mountain Drain Co., Barton Flow Plumbing',
    colours: 'Navy and safety orange',
  },
  HVAC: {
    list: 'Furnace and AC installs, heat pumps, maintenance plans, ductless mini splits, emergency repair',
    top: 'Heat pump installs\nMaintenance plans\nFurnace replacement',
    avg: '2000_10000',
    competitors: 'Bay Area Comfort, Halton Heating',
    colours: 'Deep blue and white',
  },
  Roofing: {
    list: 'Shingle replacement, flat roofs, leak repair, eavestroughs, skylights',
    top: 'Full roof replacement\nLeak repair\nEavestroughs',
    avg: 'over_10000',
    competitors: 'Capital Roofing, Ottawa Valley Roofers',
    colours: 'Charcoal and red',
  },
};
const serviceFor = (industry: string) =>
  SERVICES[industry] ?? {
    list: `${industry} services for homes and small businesses`,
    top: `${industry} for new customers\nRepeat customers\nReferrals`,
    avg: '500_2000',
    competitors: 'The two biggest names on Google Maps nearby',
    colours: 'Green and white',
  };

function intakeAnswers(c: ClientRecord, overrides: Record<string, IntakeAnswer> = {}): Record<string, IntakeAnswer> {
  const svc = serviceFor(c.industry ?? 'Home services');
  return {
    business_legal_name: c.legalName ?? `${c.businessName} Inc.`,
    business_years: 8 + (c.businessName.length % 17),
    business_locations: `${c.serviceArea ?? 'Hamilton'}, Ontario`,
    business_hours: 'Mon to Fri 7 AM to 6 PM\nSat 8 AM to 2 PM',
    business_team_size: c.businessName.length % 2 ? '6_15' : '1_5',
    services_list: svc.list,
    services_top: svc.top,
    services_area: `${c.serviceArea ?? 'Hamilton'} and about 30 km around it`,
    services_avg_job: svc.avg,
    services_emergency: 'yes',
    leads_sources: ['google_search', 'google_maps', 'referrals'],
    leads_monthly: 25 + (c.businessName.length % 30),
    leads_handling: 'The office answers during the day. After hours it goes to voicemail and we call back the next morning.',
    leads_tracking: 'spreadsheet',
    leads_booking_url: null,
    brand_logo_ready: 'yes',
    brand_colours: svc.colours,
    brand_voice: ['friendly', 'local'],
    brand_competitors: svc.competitors,
    brand_website: c.website,
    goals_primary: 'more_bookings',
    goals_target: 30,
    goals_capacity: 10,
    goals_success: 'A full calendar two weeks out, without paying for leads we cannot use.',
    goals_notes: null,
    ...overrides,
  };
}

function addIntake(c: ClientRecord, o: { version?: number; status: IntakeStatus; startedDaysAgo: number; submittedDaysAgo?: number; reviewedDaysAgo?: number; answers?: Record<string, IntakeAnswer> }) {
  const intake: Intake = {
    id: fid('itk'),
    clientId: c.id,
    version: o.version ?? 1,
    status: o.status,
    startedAt: daysAgo(o.startedDaysAgo, 2),
    submittedAt: o.submittedDaysAgo === undefined ? null : daysAgo(o.submittedDaysAgo, 1),
    reviewedAt: o.reviewedDaysAgo === undefined ? null : daysAgo(o.reviewedDaysAgo, 0.5),
    reviewedBy: o.reviewedDaysAgo === undefined ? null : staffName(c.assignedStrategist),
    updatedAt: daysAgo(Math.min(o.startedDaysAgo, o.submittedDaysAgo ?? o.startedDaysAgo, o.reviewedDaysAgo ?? o.startedDaysAgo), 0.2),
    answers: o.answers ?? intakeAnswers(c),
  };
  clientsDb.intakes.push(intake);
  return intake;
}

const METHOD_BY_PROVIDER: Partial<Record<AccessProvider, AccessMethod>> = {
  google_business_profile: 'invite_user',
  google_ads: 'partner_request',
  google_analytics: 'invite_user',
  google_search_console: 'invite_user',
  meta_business: 'partner_request',
  instagram: 'partner_request',
  domain_registrar: 'password_manager',
  dns: 'password_manager',
  website_hosting: 'password_manager',
  wordpress: 'invite_user',
  call_tracking: 'api_key',
  email_provider: 'invite_user',
};
export const defaultMethod = (provider: AccessProvider): AccessMethod | null => METHOD_BY_PROVIDER[provider] ?? null;

function addGrant(
  c: ClientRecord,
  provider: AccessProvider,
  status: AccessStatus,
  o: { requestedDaysAgo: number; label?: string; account?: string | null; note?: string | null; clientDoneDaysAgo?: number; verifiedDaysAgo?: number },
) {
  const requestedAt = daysAgo(o.requestedDaysAgo, 3);
  const clientDone = o.clientDoneDaysAgo ?? (['client_says_done', 'granted', 'verified'].includes(status) ? Math.max(o.requestedDaysAgo - 2, 0.2) : undefined);
  const verified = o.verifiedDaysAgo ?? (status === 'verified' ? Math.max((clientDone ?? o.requestedDaysAgo) - 1, 0.1) : undefined);
  const grant: AccessGrant = {
    id: fid('acg'),
    clientId: c.id,
    provider,
    label: o.label ?? null,
    status,
    accountIdentifier: o.account ?? null,
    method: defaultMethod(provider),
    note: o.note ?? null,
    clientDoneAt: clientDone === undefined ? null : daysAgo(clientDone, 1),
    verifiedAt: verified === undefined ? null : daysAgo(verified, 0.5),
    verifiedBy: verified === undefined ? null : staffName(c.assignedStrategist),
    requestedAt,
    updatedAt: daysAgo(Math.min(o.requestedDaysAgo, clientDone ?? o.requestedDaysAgo, verified ?? o.requestedDaysAgo), 0.4),
  };
  clientsDb.accessGrants.push(grant);
  return grant;
}

/** Fresh signed URLs (one hour), or already expired ones so the app must re-sign. */
export function signAsset(asset: Asset, expiresInMinutes = 60): { url: string; thumbnailUrl: string | null; expiresAt: string } {
  const source = clientsDb.assetSources[asset.id];
  const expiresMs = Date.now() + expiresInMinutes * 60_000;
  const token = fakeHash(`${asset.id}:${expiresMs}`).slice(0, 24);
  const q = `sig=${token}&exp=${Math.floor(expiresMs / 1000)}`;
  const join = (base: string) => `${base}${base.includes('?') ? '&' : '?'}${q}`;
  return {
    url: join(source?.file ?? `https://files.tekmadev.test/c/${asset.clientId}/${encodeURIComponent(asset.fileName)}`),
    thumbnailUrl: source?.thumb ? join(source.thumb) : null,
    expiresAt: isoMicros(new Date(expiresMs)),
  };
}

function addAsset(
  c: ClientRecord,
  fileName: string,
  kind: AssetKind,
  o: { uploadedDaysAgo: number; sizeBytes: number; mime: string; image?: { seed: string; width: number; height: number }; expired?: boolean; byStaff?: boolean },
) {
  const asset: Asset = {
    id: fid('ast'),
    clientId: c.id,
    fileName,
    kind,
    mime: o.mime,
    sizeBytes: o.sizeBytes,
    url: '',
    expiresAt: '',
    thumbnailUrl: null,
    width: o.image?.width ?? null,
    height: o.image?.height ?? null,
    uploadedAt: daysAgo(o.uploadedDaysAgo, 2),
    uploadedBy: o.byStaff ? staffName(c.assignedStrategist) : c.contactName,
  };
  // Images point at a placeholder photo service so the viewer has something real to show.
  clientsDb.assetSources[asset.id] = o.image
    ? { file: `https://picsum.photos/seed/${o.image.seed}/${o.image.width}/${o.image.height}`, thumb: `https://picsum.photos/seed/${o.image.seed}/480/360` }
    : { file: `https://files.tekmadev.test/c/${c.id}/${encodeURIComponent(fileName)}`, thumb: null };
  Object.assign(asset, signAsset(asset, o.expired ? -30 : 60));
  clientsDb.assets.push(asset);
  return asset;
}

function addApproval(
  c: ClientRecord,
  o: { title: string; kind: ApprovalKind; version?: number; status: ApprovalStatus; requestedDaysAgo: number; decidedDaysAgo?: number; description?: string; previewUrl?: string | null; feedback?: string | null; taskId?: string | null; attachment?: { label: string; url: string } | null },
) {
  const approval: Approval = {
    id: fid('apr'),
    clientId: c.id,
    title: o.title,
    kind: o.kind,
    version: o.version ?? 1,
    description: o.description ?? null,
    previewUrl: o.previewUrl === undefined ? `https://preview.tekmadev.test/${c.id}/${o.kind}-v${o.version ?? 1}` : o.previewUrl,
    taskId: o.taskId ?? null,
    attachment: o.attachment ?? null,
    status: o.status,
    feedback: o.feedback ?? null,
    requestedAt: daysAgo(o.requestedDaysAgo, 2),
    requestedBy: staffName(c.assignedStrategist),
    decidedAt: o.decidedDaysAgo === undefined ? null : daysAgo(o.decidedDaysAgo, 1),
    decidedBy: o.decidedDaysAgo === undefined ? null : c.contactName,
  };
  clientsDb.approvals.push(approval);
  return approval;
}

function addAgreement(c: ClientRecord, o: { title: string; version: number; status: AgreementStatus; sentDaysAgo: number; viewedDaysAgo?: number; acceptedDaysAgo?: number }) {
  const agreement: Agreement = {
    id: fid('agr'),
    clientId: c.id,
    title: o.title,
    version: o.version,
    status: o.status,
    sentAt: daysAgo(o.sentDaysAgo, 3),
    viewedAt: o.viewedDaysAgo === undefined ? (o.acceptedDaysAgo === undefined ? null : daysAgo(o.acceptedDaysAgo, 1.5)) : daysAgo(o.viewedDaysAgo, 2),
    acceptedAt: o.acceptedDaysAgo === undefined ? null : daysAgo(o.acceptedDaysAgo, 1),
    acceptedByName: o.acceptedDaysAgo === undefined ? null : c.contactName,
    acceptedByEmail: o.acceptedDaysAgo === undefined ? null : c.primaryEmail,
    contentHash: fakeHash(`${o.title}:${o.version}`),
  };
  clientsDb.agreements.push(agreement);
  return agreement;
}

const SERVICE_REQUESTS: Record<string, string[]> = {
  Plumbing: ['Water heater replacement', 'Clogged kitchen drain', 'Sump pump install', 'Basement leak', 'Bathroom rough-in'],
  HVAC: ['Heat pump quote', 'Furnace not starting', 'AC tune-up', 'Ductless mini split quote', 'Maintenance plan'],
  Roofing: ['Roof replacement quote', 'Leak after the storm', 'Eavestrough repair', 'Skylight leak', 'Flat roof inspection'],
  'Law firm': ['Real estate closing', 'Wills and estates consult', 'Small business incorporation', 'Lease review'],
  Moving: ['Two-bedroom move', 'Office move', 'Piano move', 'Packing quote'],
  Renovations: ['Basement finishing quote', 'Kitchen renovation', 'Bathroom remodel', 'Deck build'],
  'Dental clinic': ['New patient exam', 'Emergency toothache', 'Whitening consult', 'Cleaning'],
};
const serviceRequest = (c: ClientRecord, i: number) => pick(SERVICE_REQUESTS[c.industry ?? ''] ?? ['Quote request', 'Estimate', 'Consultation'], i);

let personCursor = 0;
function addCall(
  c: ClientRecord,
  o: { bookedDaysAgo: number; source?: CallSource; status?: CallStatus; qualified: boolean | null; reason?: DisqualifyReason | null; notes?: string | null; person?: number; leadInDays?: number },
): CallRecord {
  personCursor += 1;
  const person = pick(SEED_PEOPLE, o.person ?? personCursor);
  const bookedAt = daysAgo(o.bookedDaysAgo, 0);
  const bookedFor = shiftInstant(bookedAt, o.leadInDays ?? 2 + (personCursor % 4));
  const past = ms(bookedFor) < Date.now();
  const status = o.status ?? (past ? (personCursor % 7 === 0 ? 'no_show' : 'showed') : personCursor % 2 ? 'confirmed' : 'booked');
  const source = o.source ?? 'crm';
  const call: CallRecord = {
    id: fid('call'),
    clientId: c.id,
    source,
    contactName: person.name,
    phone: person.phone,
    email: person.email,
    serviceRequested: serviceRequest(c, personCursor),
    bookedAt,
    bookedFor,
    status,
    notes: o.notes ?? null,
    qualified: o.qualified,
    disqualifiedReason: o.reason ?? null,
    reviewedAt: o.qualified === null ? null : notFuture(shiftInstant(bookedAt, 0.4)),
    reviewedBy: o.qualified === null ? null : staffName(c.assignedStrategist),
    crmAppointmentId: source === 'crm' ? `appt${fakeHash(`${c.id}:${personCursor}`).slice(0, 16)}` : null,
    createdAt: bookedAt,
    updatedAt: notFuture(shiftInstant(bookedAt, 0.5)),
  };
  clientsDb.calls.push(call);
  return call;
}

/** `n` qualified calls spread evenly between two points in time (days ago). */
function addCountedCalls(c: ClientRecord, n: number, fromDaysAgo: number, toDaysAgo: number) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    addCall(c, { bookedDaysAgo: fromDaysAgo - t * (fromDaysAgo - toDaysAgo), qualified: true, source: i % 5 === 4 ? 'phone' : 'crm' });
  }
}

function addMember(
  c: ClientRecord,
  o: { email: string; name: string | null; title?: string | null; role: MemberRole; status: MemberStatus; invitedDaysAgo?: number | null; joinedDaysAgo?: number | null; lastSeenHoursAgo?: number | null },
) {
  const member: Member = {
    id: fid('mem'),
    clientId: c.id,
    email: o.email,
    name: o.name,
    title: o.title ?? null,
    role: o.role,
    status: o.status,
    invitedAt: o.invitedDaysAgo === undefined || o.invitedDaysAgo === null ? null : daysAgo(o.invitedDaysAgo, 2),
    joinedAt: o.joinedDaysAgo === undefined || o.joinedDaysAgo === null ? null : daysAgo(o.joinedDaysAgo, 1),
    lastSeenAt: o.lastSeenHoursAgo === undefined || o.lastSeenHoursAgo === null ? null : hoursAgo(o.lastSeenHoursAgo),
  };
  clientsDb.members.push(member);
  return member;
}

/** The client's own portal login, created with the client. */
function ownerMember(c: ClientRecord, o: { status: MemberStatus; joinedDaysAgo?: number; lastSeenHoursAgo?: number | null; title?: string }) {
  const age = Math.max(daysBetween(torontoDateOf(c.createdAt), torontoDate(0)), 0);
  return addMember(c, {
    email: c.primaryEmail,
    name: c.contactName,
    title: o.title ?? 'Owner',
    role: 'owner',
    status: o.status,
    invitedDaysAgo: age,
    joinedDaysAgo: o.status === 'active' ? o.joinedDaysAgo ?? Math.max(age - 1, 0) : null,
    lastSeenHoursAgo: o.status === 'active' ? o.lastSeenHoursAgo ?? 30 : null,
  });
}

function planSubscription(c: ClientRecord, o: { status?: BillingSubscription['status']; cancelAtPeriodEnd?: boolean; periodEndsInDays?: number } = {}): BillingSubscription | null {
  if (!c.planId || c.planId === 'webline') return null;
  return {
    id: `sub_${c.id.slice(3)}`,
    kind: 'plan',
    productName: `${planById(c.planId)?.name ?? 'Growth'} (monthly)`,
    status: o.status ?? 'active',
    cancelAtPeriodEnd: o.cancelAtPeriodEnd ?? false,
    currentPeriodEnd: isoMicros(new Date(Date.now() + (o.periodEndsInDays ?? 12) * DAY_MS)),
    amount: cad(PRICES[c.planId]),
    interval: 'month',
  };
}

function setupOrder(c: ClientRecord, o: { status?: BillingOrder['status']; daysAgo: number; card?: number }): BillingOrder | null {
  const planId = c.planId;
  if (!planId) return null;
  const status = o.status ?? 'paid';
  return {
    id: `ord_${c.id.slice(3)}`,
    productName: planId === 'webline' ? 'Webline' : `Build & Install: ${planById(planId)?.name ?? ''}`,
    status,
    amount: cad(planId === 'webline' ? PRICES.webline : SETUP[planId]),
    paymentMethod: status === 'pending' ? null : pick(CARDS, o.card ?? c.businessName.length),
    paidAt: status === 'paid' || status === 'refunded' || status === 'partially_refunded' ? daysAgo(o.daysAgo, 4) : null,
    createdAt: daysAgo(o.daysAgo, 4.2),
  };
}

function careSubscription(c: ClientRecord, o: { status?: BillingSubscription['status']; periodEndsInDays?: number } = {}): BillingSubscription {
  return {
    id: `sub_care_${c.id.slice(3)}`,
    kind: 'care',
    productName: 'Webline Care',
    status: o.status ?? 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: isoMicros(new Date(Date.now() + (o.periodEndsInDays ?? 17) * DAY_MS)),
    amount: cad(PRICES.care),
    interval: 'month',
  };
}

function setBilling(c: ClientRecord, subscription: BillingSubscription | null, latestOrder: BillingOrder | null) {
  const required = planById(c.planId)?.needsCarePlan ?? false;
  clientsDb.billing[c.id] = {
    subscription,
    latestOrder,
    carePlan: { required, active: required && subscription?.kind === 'care' && (subscription.status === 'active' || subscription.status === 'trialing') },
  };
}

function setCrm(c: ClientRecord, locationId: string, calendarIds: string[], pendingToApply = 0, mappedDaysAgo = 10) {
  clientsDb.crm[c.id] = { locationId, calendarIds, pendingToApply, mappedAt: daysAgo(mappedDaysAgo, 3) };
}

/** A short, believable history for clients that are not the showcase. */
function standardHistory(c: ClientRecord, o: { liveDaysAgo?: number | null; extra?: { daysAgo: number; event: string; summary: string; kind?: ActivityKind; staff?: boolean }[] } = {}) {
  const age = Math.max(daysBetween(torontoDateOf(c.createdAt), torontoDate(0)), 0);
  const strategist = staffActor(c.assignedStrategist);
  if (c.status !== 'lead') {
    addActivity(c, { event: 'billing.paid', summary: `Checkout paid: ${planById(c.planId)?.name ?? 'plan'}.`, actor: SYSTEM, at: daysAgo(age, 5) });
  }
  addActivity(c, {
    event: 'client.created',
    summary: c.status === 'lead' ? 'Signed up in the portal. No payment yet.' : 'Client created from a paid checkout.',
    actor: c.status === 'lead' ? clientActor(c) : SYSTEM,
    at: daysAgo(age, 4.9),
  });
  if (c.status !== 'lead') {
    addActivity(c, { event: 'onboarding.started', summary: 'Onboarding started.', actor: SYSTEM, at: daysAgo(age, 4.8) });
    addActivity(c, {
      kind: 'update',
      event: 'update',
      subject: 'Welcome to Tekmadev',
      summary: 'Welcome to Tekmadev',
      text: `Welcome aboard, ${c.contactName?.split(' ')[0] ?? 'there'}. Your checklist is in the portal. Start with the intake form so we can get to work.`,
      actor: strategist,
      at: daysAgo(age, 3),
    });
  }
  for (const e of o.extra ?? []) {
    addActivity(c, { kind: e.kind ?? (e.event === 'note' ? 'note' : 'event'), event: e.event, summary: e.summary, text: e.kind === 'note' || e.event === 'note' ? e.summary : null, actor: e.staff ? strategist : SYSTEM, at: daysAgo(e.daysAgo, 2) });
  }
  if (o.liveDaysAgo !== undefined && o.liveDaysAgo !== null) {
    addActivity(c, {
      event: 'client.live',
      summary: c.guaranteeEligible ? 'Went live. Guarantee clock started.' : 'Went live.',
      actor: strategist,
      at: daysAgo(o.liveDaysAgo, 6),
    });
  }
}

/* ---------- the showcase: Acme Plumbing ---------- */

function seedAcme() {
  const c = addClient(seedOf('cl_acmeplumb01'), {
    legalName: 'Acme Plumbing & Drain Ltd.',
    serviceArea: 'Hamilton, Stoney Creek, Ancaster, Dundas',
    assignedStrategist: STRATEGISTS[1],
    internalNotes: 'Daniel prefers texts over email. Wife Rita runs the office and the books. Old web developer still controls DNS.',
    updatedAt: hoursAgo(1),
  });
  const strategist = staffActor(c.assignedStrategist);
  const owner = staffActor(STRATEGISTS[0]);
  const client = clientActor(c);

  const run = seedRun(c, {
    startedDaysAgo: 19,
    stage: 'kickoff',
    blockedReason: 'Waiting on DNS access from their old web developer.',
    targetLiveDate: torontoDate(4),
    kickoffAt: daysAgo(11, -2),
    progress: {
      'upload-photos': 'in_progress',
      'review-intake': 'todo',
      'kickoff-call': 'done',
      'access-gbp': 'done',
      'access-domain': 'done',
      'access-dns': 'blocked',
      'access-ads': 'done',
      'build-funnel': 'in_progress',
      'crm-setup': 'in_progress',
      'ai-receptionist': 'todo',
      'ads-prep': 'todo',
      'approve-site': 'waiting_client',
      'approve-ads': 'done',
    },
  });
  // The intake was re-submitted (v2), so the review is open again.
  setTask(run, 'review-intake', { status: 'todo', doneAt: null, doneBy: null });
  addHandTask(run, c, {
    title: "Send us your old web developer's contact details",
    description: 'Name, email and phone, so we can ask for the DNS login directly.',
    stage: 'kickoff',
    owner: 'client',
    status: 'waiting_client',
    dueInDays: 1,
    createdDaysAgo: 3,
  });
  addHandTask(run, c, { title: 'Set up a Yelp listing', stage: 'build', owner: 'tekmadev', status: 'skipped', createdDaysAgo: 12 });
  addHandTask(run, c, {
    title: 'Record a 30 second intro video for the landing page',
    description: 'Phone video is fine. Daniel in front of the van, saying who you are and what you fix.',
    stage: 'review',
    owner: 'client',
    kind: 'upload',
    required: false,
    status: 'todo',
    dueInDays: 6,
    createdDaysAgo: 5,
  });

  addIntake(c, { version: 2, status: 'submitted', startedDaysAgo: 17, submittedDaysAgo: 2,
    answers: intakeAnswers(c, {
      business_years: 14,
      business_locations: '412 Barton St E, Hamilton\nWarehouse: 77 Kenilworth Ave N, Hamilton',
      business_team_size: '6_15',
      services_top: 'Water heater installs\nDrain cleaning\nSump pumps',
      leads_sources: ['google_search', 'google_maps', 'referrals', 'flyers'],
      leads_monthly: 45,
      leads_handling: 'Rita answers the office line 8 to 4. After that it goes to Daniel\'s cell, and he misses most of them on jobs.',
      leads_booking_url: null,
      brand_logo_ready: 'refresh',
      brand_voice: ['friendly', 'local', 'professional'],
      goals_target: 35,
      goals_capacity: 14,
      goals_notes: 'We do not do work in Burlington anymore. Please keep ads out of there.',
    }),
  });

  addGrant(c, 'google_business_profile', 'verified', { requestedDaysAgo: 14, account: 'Acme Plumbing (Barton St E)', clientDoneDaysAgo: 10, verifiedDaysAgo: 10 });
  addGrant(c, 'google_ads', 'granted', { requestedDaysAgo: 14, account: '412-883-1907', clientDoneDaysAgo: 9 });
  addGrant(c, 'domain_registrar', 'client_says_done', { requestedDaysAgo: 14, account: 'acmeplumbing.test', clientDoneDaysAgo: 4, note: 'Add owner@tekmadev.test as a user, or share the login through 1Password.' });
  addGrant(c, 'dns', 'pending_client', { requestedDaysAgo: 14, account: 'acmeplumbing.test', note: 'Your old developer controls this. Ask them to add us, or to send you the login.' });
  addGrant(c, 'website_hosting', 'requested', { requestedDaysAgo: 14 });
  addGrant(c, 'meta_business', 'not_applicable', { requestedDaysAgo: 14, note: 'No Facebook page yet. We will skip this for now.' });
  addGrant(c, 'instagram', 'revoked', { requestedDaysAgo: 12, account: '@acmeplumbinghamilton', label: 'Instagram (business account)', clientDoneDaysAgo: 8, note: 'Our access was removed. Can you add us back as a partner?' });
  addGrant(c, 'call_tracking', 'requested', { requestedDaysAgo: 1, label: 'Call tracking number forwarding' });

  addAsset(c, 'acme-logo.png', 'logo', { uploadedDaysAgo: 16, sizeBytes: 184_320, mime: 'image/png', image: { seed: 'acme-logo', width: 1200, height: 1200 } });
  addAsset(c, 'van-wrap.jpg', 'photo', { uploadedDaysAgo: 16, sizeBytes: 2_481_772, mime: 'image/jpeg', image: { seed: 'acme-van', width: 2400, height: 1600 }, expired: true });
  addAsset(c, 'team-photo.jpg', 'photo', { uploadedDaysAgo: 8, sizeBytes: 3_102_455, mime: 'image/jpeg', image: { seed: 'acme-team', width: 2400, height: 1600 } });
  addAsset(c, 'bathroom-before-after.jpg', 'photo', { uploadedDaysAgo: 8, sizeBytes: 1_906_004, mime: 'image/jpeg', image: { seed: 'acme-bath', width: 1600, height: 2000 } });
  addAsset(c, 'service-price-list-2026.pdf', 'document', { uploadedDaysAgo: 8, sizeBytes: 412_660, mime: 'application/pdf' });
  addAsset(c, 'Acme Plumbing brand guide (final, final v3).pdf', 'brand', { uploadedDaysAgo: 15, sizeBytes: 8_820_301, mime: 'application/pdf', expired: true });
  addAsset(c, 'truck-walkaround.mp4', 'video', { uploadedDaysAgo: 1, sizeBytes: 48_120_904, mime: 'video/mp4' });

  const approveSite = tasksOf(run.id).find((t) => t.templateKey === 'approve-site');
  addApproval(c, { title: 'Homepage design', kind: 'website', version: 1, status: 'superseded', requestedDaysAgo: 7, decidedDaysAgo: 6, feedback: 'Love it. Can the phone number be bigger at the top? Most people just want to call.', taskId: approveSite?.id ?? null });
  addApproval(c, { title: 'Homepage design', kind: 'website', version: 2, status: 'pending', requestedDaysAgo: 5, description: 'Bigger phone number in the header, new hero photo of the van, Saturday hours added.', taskId: approveSite?.id ?? null, attachment: { label: 'Mobile screenshots', url: 'https://preview.tekmadev.test/cl_acmeplumb01/homepage-mobile.pdf' } });
  addApproval(c, { title: 'Google Ads copy', kind: 'ad_creative', status: 'approved', requestedDaysAgo: 5, decidedDaysAgo: 4, feedback: 'Good to go.' });
  addApproval(c, { title: 'Missed-call text-back message', kind: 'automation', status: 'changes_requested', requestedDaysAgo: 3, decidedDaysAgo: 2, feedback: 'Can we mention we are open on Saturdays? And sign it from Rita, not Acme.', previewUrl: null });

  addAgreement(c, { title: 'Growth System service agreement', version: 3, status: 'signed', sentDaysAgo: 18.5, acceptedDaysAgo: 18 });
  addAgreement(c, { title: 'Guarantee terms', version: 1, status: 'viewed', sentDaysAgo: 18.5, viewedDaysAgo: 17 });
  addAgreement(c, { title: 'Photo and video release', version: 1, status: 'sent', sentDaysAgo: 1 });

  // Synced from the CRM while the build is still running: nothing counts until reviewed.
  addCall(c, { bookedDaysAgo: 2, qualified: null, person: 0, notes: 'Water heater leaking in the basement. Wants a quote this week.' });
  addCall(c, { bookedDaysAgo: 1.2, qualified: null, person: 1 });
  addCall(c, { bookedDaysAgo: 0.9, qualified: null, person: 2, reason: 'spam', notes: 'Booked "SEO services consultation". Looks like a marketing pitch.' });
  addCall(c, { bookedDaysAgo: 0.25, qualified: null, person: 3, leadInDays: 1.5 });

  setCrm(c, 'aCmEpLuMb7Hx2KqW9rTz', ['cal8Fh2Kq0Lr5Tz3Wm1x'], 2, 6);

  addMember(c, { email: c.primaryEmail, name: c.contactName, title: 'Owner', role: 'owner', status: 'active', invitedDaysAgo: 19, joinedDaysAgo: 18, lastSeenHoursAgo: 2 });
  addMember(c, { email: 'rita@acmeplumbing.test', name: 'Rita Okafor', title: 'Office manager', role: 'admin', status: 'active', invitedDaysAgo: 17, joinedDaysAgo: 17, lastSeenHoursAgo: 26 });
  addMember(c, { email: 'office+bounce@acmeplumbing.test', name: null, title: 'Front desk', role: 'member', status: 'invited', invitedDaysAgo: 6 });
  addMember(c, { email: 'kyle@acmeplumbing.test', name: 'Kyle Brennan', title: 'Former dispatcher', role: 'member', status: 'disabled', invitedDaysAgo: 17, joinedDaysAgo: 16, lastSeenHoursAgo: 240 });

  setBilling(c, planSubscription(c, { periodEndsInDays: 11 }), setupOrder(c, { daysAgo: 19, card: 0 }));

  // 50 entries over 19 days, oldest first.
  type Entry = [daysAgo: number, actor: Actor, event: string, summary: string, extra?: { kind?: ActivityKind; subject?: string; text?: string; visible?: boolean; actionUrl?: string }];
  const entries: Entry[] = [
    [19.2, SYSTEM, 'billing.paid', 'Checkout paid: Grow (Build & Install and first month).'],
    [19.19, SYSTEM, 'client.created', 'Client created from a paid checkout.'],
    [19.18, SYSTEM, 'onboarding.started', 'Onboarding started with the Grow checklist.'],
    [19.17, SYSTEM, 'member.invited', 'Portal invite sent to dan@acmeplumbing.test.'],
    [19.1, strategist, 'update', 'Welcome to Tekmadev', { kind: 'update', subject: 'Welcome to Tekmadev', text: 'Welcome aboard, Daniel. Your checklist is in the portal. Start with the intake form so we can get to work.' }],
    [18.6, client, 'member.joined', 'Daniel Okafor logged in to the portal for the first time.'],
    [18.5, SYSTEM, 'agreement.sent', 'Growth System service agreement v3 sent.'],
    [18.0, client, 'agreement.signed', 'Daniel Okafor accepted the Growth System service agreement v3.', { visible: true }],
    [17.9, client, 'task.done', 'Log in to your portal: done.', { visible: true }],
    [17.4, client, 'intake.started', 'Intake started.'],
    [17.0, strategist, 'note', 'Called Daniel to walk through the intake. He wants to push water heaters and drain cleaning, not general plumbing.', { kind: 'note' }],
    [16.3, client, 'asset.uploaded', 'Uploaded acme-logo.png.', { visible: true }],
    [16.2, client, 'asset.uploaded', 'Uploaded van-wrap.jpg.', { visible: true }],
    [16.1, client, 'task.done', 'Upload your logo: done.', { visible: true }],
    [15.4, client, 'intake.submitted', 'Intake v1 submitted.', { visible: true }],
    [15.0, client, 'asset.uploaded', 'Uploaded Acme Plumbing brand guide (final, final v3).pdf.', { visible: true }],
    [14.8, strategist, 'intake.reviewed', 'Intake v1 reviewed.'],
    [14.5, strategist, 'access.requested', 'Requested access: Google Business Profile.', { visible: true }],
    [14.49, strategist, 'access.requested', 'Requested access: Google Ads.', { visible: true }],
    [14.48, strategist, 'access.requested', 'Requested access: Domain registrar.', { visible: true }],
    [14.47, strategist, 'access.requested', 'Requested access: DNS.', { visible: true }],
    [14.46, strategist, 'access.requested', 'Requested access: Website hosting.', { visible: true }],
    [13.2, strategist, 'onboarding.updated', 'Kickoff call booked.'],
    [12.4, strategist, 'onboarding.stage', 'Stage moved to Kickoff.'],
    [12.0, strategist, 'access.requested', 'Requested access: Instagram.', { visible: true }],
    [11.1, owner, 'note', 'Kickoff done. Service area is Hamilton, Stoney Creek, Ancaster and Dundas. No Burlington jobs.', { kind: 'note' }],
    [11.0, strategist, 'task.done', 'Kickoff call: done.', { visible: true }],
    [10.9, strategist, 'update', 'Kickoff recap', { kind: 'update', subject: 'Kickoff recap', text: 'Thanks for the time today. Next up: access to your domain, DNS and hosting so we can start the build.', actionUrl: 'https://account.tekmadev.com/access' }],
    [10.2, client, 'access.updated', 'Google Business Profile: client says done.', { visible: true }],
    [10.0, strategist, 'access.updated', 'Google Business Profile: verified.', { visible: true }],
    [9.1, client, 'access.updated', 'Google Ads: client says done.', { visible: true }],
    [8.9, strategist, 'access.updated', 'Google Ads: granted.', { visible: true }],
    [8.4, client, 'asset.uploaded', 'Uploaded team-photo.jpg.', { visible: true }],
    [8.3, client, 'asset.uploaded', 'Uploaded bathroom-before-after.jpg.', { visible: true }],
    [8.2, client, 'asset.uploaded', 'Uploaded service-price-list-2026.pdf.', { visible: true }],
    [7.0, strategist, 'approval.requested', 'Approval requested: Homepage design v1.', { visible: true }],
    [6.2, client, 'approval.decided', 'Homepage design v1: changes requested.', { visible: true }],
    [6.0, owner, 'crm.mapped', 'CRM sub-account mapped.'],
    [5.1, strategist, 'approval.requested', 'Approval requested: Homepage design v2.', { visible: true }],
    [5.0, strategist, 'approval.requested', 'Approval requested: Google Ads copy v1.', { visible: true }],
    [4.2, client, 'approval.decided', 'Google Ads copy v1: approved.', { visible: true }],
    [4.0, client, 'access.updated', 'Domain registrar: client says done.', { visible: true }],
    [3.3, strategist, 'onboarding.blocked', 'Blocked: Waiting on DNS access from their old web developer.'],
    [3.2, strategist, 'note', 'Their old developer owns the DNS account. Daniel emailed him twice. Following up Friday.', { kind: 'note' }],
    [3.0, strategist, 'approval.requested', 'Approval requested: Missed-call text-back message v1.', { visible: true }],
    [2.4, client, 'approval.decided', 'Missed-call text-back message v1: changes requested.', { visible: true }],
    [2.0, client, 'intake.submitted', 'Intake v2 submitted.', { visible: true }],
    [1.9, SYSTEM, 'call.booked', 'CRM appointment synced: Olivia Martin.'],
    [1.2, SYSTEM, 'call.booked', 'CRM appointment synced: Noah Singh.'],
    [0.9, SYSTEM, 'call.booked', 'CRM appointment synced: Chloe Roy.'],
    [0.3, SYSTEM, 'call.booked', 'CRM appointment synced: Liam Wilson.'],
    [0.12, strategist, 'access.updated', 'Instagram: revoked.', { visible: true }],
    [0.04, strategist, 'note', 'Daniel says the old developer will hand over DNS by Thursday.', { kind: 'note' }],
  ];
  for (const [d, actor, event, summary, extra] of entries) {
    addActivity(c, {
      kind: extra?.kind ?? (event === 'note' ? 'note' : 'event'),
      event,
      summary,
      subject: extra?.subject ?? null,
      text: extra?.text ?? (event === 'note' ? summary : null),
      actionUrl: extra?.actionUrl ?? null,
      visible: extra?.visible,
      actor,
      at: daysAgo(d),
    });
  }
}

/* ---------- the other seed clients ---------- */

function seedHarbour() {
  // Live 19 days on Let's Talk: 12 of 30 with 41 days left, ahead of the 9 expected.
  const c = addClient(seedOf('cl_harbourhvac'), { legalName: 'Harbour Heating & Cooling Inc.', serviceArea: 'Burlington, Oakville, Hamilton', assignedStrategist: STRATEGISTS[0] });
  liveSince(c, 19);
  seedRun(c, { startedDaysAgo: 96, stage: 'optimizing', targetLiveDate: torontoDate(-21), kickoffAt: daysAgo(88, -3), progress: { 'first-report': 'in_progress', 'ads-tune': 'todo' } });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 94, submittedDaysAgo: 90, reviewedDaysAgo: 89 });
  for (const p of ['google_business_profile', 'google_ads', 'domain_registrar', 'dns', 'google_analytics'] as const) addGrant(c, p, 'verified', { requestedDaysAgo: 88 });
  addGrant(c, 'meta_business', 'granted', { requestedDaysAgo: 88 });
  addAsset(c, 'harbour-logo.svg', 'logo', { uploadedDaysAgo: 90, sizeBytes: 22_118, mime: 'image/svg+xml' });
  addAsset(c, 'install-crew.jpg', 'photo', { uploadedDaysAgo: 85, sizeBytes: 2_204_118, mime: 'image/jpeg', image: { seed: 'harbour-crew', width: 2000, height: 1333 } });
  addApproval(c, { title: 'Website and booking flow', kind: 'website', status: 'approved', requestedDaysAgo: 30, decidedDaysAgo: 28, feedback: 'Looks great.' });
  addApproval(c, { title: 'Heat pump rebate landing page', kind: 'landing_page', status: 'approved', requestedDaysAgo: 26, decidedDaysAgo: 25 });
  addAgreement(c, { title: 'Growth System service agreement', version: 3, status: 'signed', sentDaysAgo: 95, acceptedDaysAgo: 95 });
  addAgreement(c, { title: 'Guarantee terms', version: 1, status: 'signed', sentDaysAgo: 95, acceptedDaysAgo: 94 });
  addCall(c, { bookedDaysAgo: 24, qualified: true, notes: 'Booked from the soft launch before go-live.' });
  addCountedCalls(c, 11, 18.5, 0.6);
  addCall(c, { bookedDaysAgo: 8, qualified: true, status: 'no_show' });
  addCall(c, { bookedDaysAgo: 6, qualified: true, status: 'cancelled', notes: 'Went with their brother-in-law.' });
  addCall(c, { bookedDaysAgo: 5, qualified: false, reason: 'duplicate', notes: 'Same person as the Tuesday booking.' });
  addCall(c, { bookedDaysAgo: 3, qualified: false, reason: 'out_of_area', notes: 'Lives in Guelph.' });
  setCrm(c, 'hRbRhVaC4kQ8pL2mN6sT', ['calHv1Est7Qz9Lm2Rt5x', 'calHv2Svc3Pw8Kd4Nb6y'], 0, 40);
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 5, title: 'General manager' });
  addMember(c, { email: 'dispatch@harbourhvac.test', name: 'Owen Lee', title: 'Dispatcher', role: 'member', status: 'active', invitedDaysAgo: 60, joinedDaysAgo: 59, lastSeenHoursAgo: 20 });
  setBilling(c, planSubscription(c, { periodEndsInDays: 4 }), setupOrder(c, { daysAgo: 96 }));
  standardHistory(c, { liveDaysAgo: 19, extra: [{ daysAgo: 6, event: 'note', summary: 'Priya asked about adding Oakville to the ads. Waiting for the first report first.', staff: true }] });
}

function seedBytown() {
  // Live 38 days on Grow: 7 of 30 where 19 were expected.
  const c = addClient(seedOf('cl_bytownroof'), {
    legalName: 'Bytown Roofing Company Ltd.',
    serviceArea: 'Ottawa, Nepean, Kanata, Orleans',
    internalNotes: 'Roofing is seasonal. Expect a slow November. Marc wants weekly numbers by text.',
  });
  liveSince(c, 38);
  seedRun(c, { startedDaysAgo: 74, stage: 'optimizing', targetLiveDate: torontoDate(-40), progress: { 'first-report': 'done', 'ads-tune': 'in_progress' } });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 72, submittedDaysAgo: 70, reviewedDaysAgo: 69 });
  for (const p of ['google_business_profile', 'google_ads', 'domain_registrar', 'dns'] as const) addGrant(c, p, 'verified', { requestedDaysAgo: 66 });
  addGrant(c, 'wordpress', 'granted', { requestedDaysAgo: 66, account: 'bytownroofing.test/wp-admin' });
  addAsset(c, 'bytown-logo.png', 'logo', { uploadedDaysAgo: 70, sizeBytes: 96_210, mime: 'image/png', image: { seed: 'bytown-logo', width: 800, height: 800 } });
  addAsset(c, 'drone-roof-shots.zip', 'other', { uploadedDaysAgo: 64, sizeBytes: 182_330_112, mime: 'application/zip' });
  addApproval(c, { title: 'Storm damage landing page', kind: 'landing_page', status: 'approved', requestedDaysAgo: 45, decidedDaysAgo: 44 });
  addApproval(c, { title: 'October ad refresh', kind: 'ad_creative', status: 'pending', requestedDaysAgo: 1, description: 'Three new headlines for fall leak repairs.' });
  addAgreement(c, { title: 'Growth System service agreement', version: 3, status: 'signed', sentDaysAgo: 74, acceptedDaysAgo: 73 });
  addCountedCalls(c, 7, 36, 2);
  addCall(c, { bookedDaysAgo: 10, qualified: false, reason: 'fake', notes: 'Number not in service.' });
  addCall(c, { bookedDaysAgo: 0.5, qualified: null });
  setCrm(c, 'bYtOwNrOoF3jK8sL1qWe', [], 1, 50);
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 50 });
  setBilling(c, planSubscription(c, { periodEndsInDays: 21 }), setupOrder(c, { daysAgo: 74 }));
  standardHistory(c, { liveDaysAgo: 38, extra: [{ daysAgo: 4, event: 'note', summary: 'Behind pace. Raised the budget on leak repair ads and added Kanata.', staff: true }] });
}

function seedEscarpment() {
  const c = addClient(seedOf('cl_escarpdent'), { legalName: 'Escarpment Family Dental Professional Corporation', serviceArea: 'Hamilton Mountain' });
  liveSince(c, 120);
  seedRun(c, { startedDaysAgo: 151, stage: 'complete', completedDaysAgo: 100 });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 150, submittedDaysAgo: 148, reviewedDaysAgo: 147 });
  for (const p of ['google_business_profile', 'domain_registrar', 'dns', 'google_search_console'] as const) addGrant(c, p, 'verified', { requestedDaysAgo: 145 });
  addAgreement(c, { title: 'Growth System service agreement', version: 2, status: 'signed', sentDaysAgo: 151, acceptedDaysAgo: 150 });
  addCountedCalls(c, 5, 20, 1);
  setCrm(c, 'eScArPdEnT5mN2bV7cXz', ['calEsc1NewPt4Hq8Jw2v']);
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 120, title: 'Dentist and owner' });
  addMember(c, { email: 'frontdesk@escarpmentdental.test', name: 'Jenna Moore', title: 'Front desk', role: 'member', status: 'active', invitedDaysAgo: 140, joinedDaysAgo: 139, lastSeenHoursAgo: 3 });
  setBilling(c, planSubscription(c, { periodEndsInDays: 9 }), setupOrder(c, { daysAgo: 151 }));
  standardHistory(c, { liveDaysAgo: 120 });
}

function seedRideau() {
  // The stored stage was never moved past Kickoff, but everything there is done: derived stage is Build. 3 days late.
  const c = addClient(seedOf('cl_rideaulawn'), { serviceArea: 'Ottawa South, Manotick, Riverside South' });
  const run = seedRun(c, {
    startedDaysAgo: 33,
    stage: 'kickoff',
    targetLiveDate: torontoDate(-3),
    kickoffAt: daysAgo(26, -1),
    progress: {
      'upload-photos': 'skipped',
      'kickoff-call': 'done',
      'access-gbp': 'done',
      'access-domain': 'done',
      'access-dns': 'done',
      'access-ads': 'done',
      'build-funnel': 'in_progress',
      'crm-setup': 'done',
      'ai-receptionist': 'in_progress',
    },
  });
  addHandTask(run, c, { title: 'Confirm spring cleanup pricing', stage: 'build', owner: 'client', status: 'waiting_client', required: true, dueInDays: -2, createdDaysAgo: 6 });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 31, submittedDaysAgo: 28, reviewedDaysAgo: 27, answers: intakeAnswers(c, { services_emergency: 'no', leads_sources: ['referrals', 'flyers', 'facebook'] }) });
  for (const p of ['google_business_profile', 'google_ads', 'domain_registrar', 'dns'] as const) addGrant(c, p, 'granted', { requestedDaysAgo: 25 });
  addAsset(c, 'rideau-logo.png', 'logo', { uploadedDaysAgo: 29, sizeBytes: 64_220, mime: 'image/png', image: { seed: 'rideau-logo', width: 600, height: 600 } });
  addAgreement(c, { title: 'Growth System service agreement', version: 3, status: 'signed', sentDaysAgo: 33, acceptedDaysAgo: 32 });
  setCrm(c, 'rIdEaUlAwN6pQ1wE4rTy', []);
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 72 });
  setBilling(c, planSubscription(c, { periodEndsInDays: 27 }), setupOrder(c, { daysAgo: 33 }));
  standardHistory(c, { extra: [{ daysAgo: 2, event: 'note', summary: 'Tom is slow to reply in peak season. Call, do not email.', staff: true }] });
}

function seedSteeltown() {
  // Webline with no care plan: going live answers care_required.
  const c = addClient(seedOf('cl_steeltownph'), { serviceArea: 'Hamilton (Westdale, Kirkendall)' });
  seedRun(c, {
    startedDaysAgo: 9,
    stage: 'review',
    targetLiveDate: torontoDate(5),
    progress: { 'approve-site': 'waiting_client', 'qa-pass': 'in_progress', 'access-hosting': 'skipped' },
  });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 8, submittedDaysAgo: 7, reviewedDaysAgo: 7, answers: intakeAnswers(c, { services_emergency: 'no', goals_primary: 'more_calls', goals_target: null }) });
  addGrant(c, 'domain_registrar', 'verified', { requestedDaysAgo: 7, account: 'steeltownphysio.test' });
  addGrant(c, 'dns', 'verified', { requestedDaysAgo: 7 });
  addGrant(c, 'google_business_profile', 'client_says_done', { requestedDaysAgo: 7, clientDoneDaysAgo: 1 });
  addAsset(c, 'clinic-front.jpg', 'photo', { uploadedDaysAgo: 7, sizeBytes: 1_402_555, mime: 'image/jpeg', image: { seed: 'steeltown-front', width: 1800, height: 1200 } });
  addApproval(c, { title: 'Webline site', kind: 'website', status: 'pending', requestedDaysAgo: 1, description: 'Five pages: home, services, team, booking and contact.' });
  addAgreement(c, { title: 'Webline agreement', version: 1, status: 'signed', sentDaysAgo: 9, acceptedDaysAgo: 9 });
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 8, title: 'Clinic director' });
  setBilling(c, null, setupOrder(c, { daysAgo: 9, card: 4 }));
  standardHistory(c);
}

function seedGlebe() {
  // Let's Talk, guarantee met long ago (34 of 30), window over.
  const c = addClient(seedOf('cl_glebelaw'), { legalName: 'Glebe Legal LLP', serviceArea: 'Ottawa', guaranteeCountRule: 'showed' });
  liveSince(c, 150, 'met');
  seedRun(c, { startedDaysAgo: 212, stage: 'complete', completedDaysAgo: 140 });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 210, submittedDaysAgo: 205, reviewedDaysAgo: 204 });
  for (const p of ['google_business_profile', 'google_ads', 'domain_registrar', 'dns', 'google_analytics', 'email_provider'] as const) addGrant(c, p, 'verified', { requestedDaysAgo: 200 });
  addAgreement(c, { title: 'Growth System service agreement', version: 2, status: 'signed', sentDaysAgo: 212, acceptedDaysAgo: 210 });
  addAgreement(c, { title: 'Growth System service agreement', version: 1, status: 'voided', sentDaysAgo: 214 });
  for (let i = 0; i < 34; i++) addCall(c, { bookedDaysAgo: 148 - i * 1.6, qualified: true, status: 'showed' });
  addCall(c, { bookedDaysAgo: 120, qualified: true, status: 'no_show' });
  setCrm(c, 'gLeBeLeGaL2xC5vB8nMq', ['calGlb1Consult6Yt3Ue']);
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 300, title: 'Managing partner' });
  setBilling(c, planSubscription(c, { periodEndsInDays: 6 }), setupOrder(c, { daysAgo: 212, card: 2 }));
  standardHistory(c, { liveDaysAgo: 150, extra: [{ daysAgo: 100, event: 'note', summary: 'Guarantee met on day 50.', staff: true }] });
}

function seedDundas() {
  // Pending: paid two days ago, run just started.
  const c = addClient(seedOf('cl_dundaselec'), { serviceArea: 'Dundas, Hamilton, Flamborough' });
  seedRun(c, { startedDaysAgo: 2, stage: 'welcome', targetLiveDate: torontoDate(26), kickoffAt: isoMicros(new Date(Date.now() + 2 * DAY_MS + 3 * 3_600_000)), progress: { 'welcome-call': 'done' } });
  addAgreement(c, { title: 'Growth System service agreement', version: 3, status: 'sent', sentDaysAgo: 2 });
  ownerMember(c, { status: 'invited' });
  setBilling(c, planSubscription(c, { periodEndsInDays: 28 }), setupOrder(c, { daysAgo: 2, card: 3 }));
  standardHistory(c);
}

function seedKanata() {
  const c = addClient(seedOf('cl_kanatapest'), { internalNotes: 'Paused for the winter at their request. Restart in March.' });
  liveSince(c, 100);
  seedRun(c, { startedDaysAgo: 128, stage: 'complete', completedDaysAgo: 90 });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 126, submittedDaysAgo: 124, reviewedDaysAgo: 123 });
  addGrant(c, 'google_business_profile', 'verified', { requestedDaysAgo: 120 });
  addAgreement(c, { title: 'Growth System service agreement', version: 2, status: 'signed', sentDaysAgo: 128, acceptedDaysAgo: 127 });
  addCountedCalls(c, 2, 40, 30);
  setCrm(c, 'kAnAtApEsT9hG3fD6sAz', []);
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 900 });
  setBilling(c, planSubscription(c, { status: 'paused', periodEndsInDays: 150 }), setupOrder(c, { daysAgo: 128 }));
  standardHistory(c, { liveDaysAgo: 100, extra: [{ daysAgo: 8, event: 'client.status', summary: 'Status changed to Paused.', staff: true }] });
}

function seedLakeshore() {
  const c = addClient(seedOf('cl_lakeshorecl'), { serviceArea: 'Stoney Creek, Grimsby, Hamilton East' });
  seedRun(c, {
    startedDaysAgo: 41,
    stage: 'review',
    blockedReason: 'Sofia is away until next week. Approvals are on hold.',
    targetLiveDate: torontoDate(-1),
    progress: { 'approve-site': 'waiting_client', 'approve-ads': 'waiting_client', 'qa-pass': 'done' },
  });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 39, submittedDaysAgo: 36, reviewedDaysAgo: 35 });
  for (const p of ['google_business_profile', 'google_ads', 'domain_registrar', 'dns'] as const) addGrant(c, p, 'verified', { requestedDaysAgo: 33 });
  addApproval(c, { title: 'Website', kind: 'website', status: 'pending', requestedDaysAgo: 6 });
  addApproval(c, { title: 'Google Ads copy', kind: 'ad_creative', status: 'pending', requestedDaysAgo: 6 });
  addAgreement(c, { title: 'Growth System service agreement', version: 3, status: 'signed', sentDaysAgo: 41, acceptedDaysAgo: 40 });
  // Logged by hand before launch: qualified, but before the clock starts.
  addCall(c, { bookedDaysAgo: 4, qualified: true, source: 'referral', notes: 'Office cleaning for a dental clinic, referred by Escarpment Family Dental.' });
  setCrm(c, 'lAkEsHoReCl4nE7aN9iG', []);
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 160 });
  setBilling(c, planSubscription(c, { periodEndsInDays: 19 }), setupOrder(c, { daysAgo: 41 }));
  standardHistory(c, { extra: [{ daysAgo: 6, event: 'onboarding.blocked', summary: 'Blocked: Sofia is away until next week. Approvals are on hold.', staff: true }] });
}

function seedByward() {
  // Webline, live, with an active Webline Care plan ($77.50 a month).
  const c = addClient(seedOf('cl_byward_cafe'), { serviceArea: 'Ottawa (ByWard Market, Centretown)' });
  liveSince(c, 40);
  seedRun(c, { startedDaysAgo: 63, stage: 'complete', completedDaysAgo: 38 });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 62, submittedDaysAgo: 60, reviewedDaysAgo: 60 });
  addGrant(c, 'domain_registrar', 'verified', { requestedDaysAgo: 58 });
  addGrant(c, 'dns', 'verified', { requestedDaysAgo: 58 });
  addGrant(c, 'instagram', 'not_applicable', { requestedDaysAgo: 58 });
  addAsset(c, 'menu-fall-2026.pdf', 'document', { uploadedDaysAgo: 3, sizeBytes: 1_220_400, mime: 'application/pdf' });
  addAsset(c, 'charcuterie-board.jpg', 'photo', { uploadedDaysAgo: 55, sizeBytes: 2_650_011, mime: 'image/jpeg', image: { seed: 'byward-board', width: 2000, height: 1500 } });
  addApproval(c, { title: 'Webline site', kind: 'website', status: 'approved', requestedDaysAgo: 45, decidedDaysAgo: 44, feedback: 'Perfect. Ship it.' });
  addAgreement(c, { title: 'Webline agreement', version: 1, status: 'signed', sentDaysAgo: 63, acceptedDaysAgo: 63 });
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 70 });
  setBilling(c, careSubscription(c), setupOrder(c, { daysAgo: 63, card: 1 }));
  standardHistory(c, { liveDaysAgo: 40, extra: [{ daysAgo: 41, event: 'billing.care_started', summary: 'Webline Care started ($77.50 a month).' }] });
}

function seedAncaster() {
  // Grow, met early: 30 of 30 by day 52.
  const c = addClient(seedOf('cl_ancastermov'), { serviceArea: 'Ancaster, Hamilton, Brantford', assignedStrategist: STRATEGISTS[0] });
  liveSince(c, 52, 'met');
  seedRun(c, { startedDaysAgo: 88, stage: 'optimizing', progress: { 'first-report': 'done', 'ads-tune': 'done' } });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 86, submittedDaysAgo: 84, reviewedDaysAgo: 83 });
  for (const p of ['google_business_profile', 'google_ads', 'domain_registrar', 'dns'] as const) addGrant(c, p, 'verified', { requestedDaysAgo: 80 });
  addAgreement(c, { title: 'Growth System service agreement', version: 3, status: 'signed', sentDaysAgo: 88, acceptedDaysAgo: 88 });
  addCountedCalls(c, 30, 51, 3);
  addCall(c, { bookedDaysAgo: 1, qualified: false, reason: 'wrong_service', notes: 'Wanted a storage unit, not a move.' });
  setCrm(c, 'aNcAsTeRmOvErS1tUv2W', ['calAnc1Quote8Hj5Kl3z']);
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 12 });
  setBilling(c, planSubscription(c, { periodEndsInDays: 14 }), setupOrder(c, { daysAgo: 88 }));
  standardHistory(c, { liveDaysAgo: 52, extra: [{ daysAgo: 3, event: 'note', summary: 'Guarantee met with 8 days to spare. Jordan wants to talk about adding Brantford.', staff: true }] });
}

function seedOrleans() {
  // A lead: signed up in the portal, never paid. Everything else is empty.
  const c = addClient(seedOf('cl_orleansauto'), { assignedStrategist: null, serviceArea: null });
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 20 });
  standardHistory(c);
}

function seedWestdale() {
  const c = addClient(seedOf('cl_westdalevet'), { internalNotes: 'Sold the practice. New owners did not continue.' });
  liveSince(c, 230);
  seedRun(c, { startedDaysAgo: 260, stage: 'complete', completedDaysAgo: 220 });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 258, submittedDaysAgo: 255, reviewedDaysAgo: 254 });
  addAgreement(c, { title: 'Growth System service agreement', version: 1, status: 'signed', sentDaysAgo: 260, acceptedDaysAgo: 259 });
  ownerMember(c, { status: 'disabled' });
  setBilling(c, planSubscription(c, { status: 'canceled', periodEndsInDays: -30 }), setupOrder(c, { daysAgo: 260 }));
  standardHistory(c, { liveDaysAgo: 230, extra: [{ daysAgo: 31, event: 'client.status', summary: 'Status changed to Churned.', staff: true }] });
}

function seedBarrhaven() {
  // Grow, 9 days in: 6 of 30 with 4 expected. Cancelling at period end ("Ending").
  const c = addClient(seedOf('cl_barrhavenhm'), { serviceArea: 'Barrhaven, Nepean, Manotick', internalNotes: 'Asked to cancel at the end of the period (cash flow). Try to save before the period ends.' });
  liveSince(c, 9);
  seedRun(c, { startedDaysAgo: 57, stage: 'optimizing', progress: { 'first-report': 'todo', 'ads-tune': 'todo' } });
  addIntake(c, { status: 'reviewed', startedDaysAgo: 55, submittedDaysAgo: 50, reviewedDaysAgo: 49 });
  for (const p of ['google_business_profile', 'google_ads', 'domain_registrar', 'dns'] as const) addGrant(c, p, 'verified', { requestedDaysAgo: 48 });
  addAgreement(c, { title: 'Growth System service agreement', version: 3, status: 'signed', sentDaysAgo: 57, acceptedDaysAgo: 56 });
  addCountedCalls(c, 6, 8.5, 0.5);
  setCrm(c, 'bArRhAvEnHoMe5rEnO7v', ['calBhv1Reno2Lk9Pq4Ws']);
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 40 });
  setBilling(c, planSubscription(c, { cancelAtPeriodEnd: true, periodEndsInDays: 21 }), setupOrder(c, { daysAgo: 57 }));
  standardHistory(c, { liveDaysAgo: 9 });
}

function seedWaterdown() {
  // A lead with an abandoned checkout.
  const c = addClient(seedOf('cl_waterdown_d'), { assignedStrategist: null, serviceArea: null });
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 90 });
  setBilling(c, null, { id: 'ord_waterdown_d', productName: 'Build & Install: Grow', status: 'pending', amount: cad(SETUP.grow), paymentMethod: null, paidAt: null, createdAt: daysAgo(4, 1) });
  standardHistory(c);
}

function seedNepean() {
  // Let's Talk, intake still a draft, 8 days to the target.
  const c = addClient(seedOf('cl_nepeanortho'), { legalName: 'Nepean Orthodontics Professional Corporation', serviceArea: 'Nepean, Barrhaven, Kanata' });
  seedRun(c, { startedDaysAgo: 14, stage: 'intake', targetLiveDate: torontoDate(8), kickoffAt: daysAgo(10), progress: { 'complete-intake': 'in_progress', 'upload-logo': 'done' } });
  addIntake(c, {
    status: 'draft',
    startedDaysAgo: 12,
    answers: {
      business_legal_name: 'Nepean Orthodontics Professional Corporation',
      business_years: 6,
      business_locations: '101 Greenbank Rd, Nepean',
      business_team_size: '6_15',
      services_list: 'Braces, clear aligners, early treatment for kids',
      services_top: null,
      leads_sources: ['google_search', 'referrals'],
    },
  });
  addGrant(c, 'google_business_profile', 'pending_client', { requestedDaysAgo: 10, note: 'Add owner@tekmadev.test as a manager.' });
  addGrant(c, 'squarespace', 'requested', { requestedDaysAgo: 10 });
  addAsset(c, 'nepean-ortho-logo.png', 'logo', { uploadedDaysAgo: 11, sizeBytes: 120_400, mime: 'image/png', image: { seed: 'nepean-logo', width: 1000, height: 1000 } });
  addAgreement(c, { title: 'Growth System service agreement', version: 3, status: 'signed', sentDaysAgo: 14, acceptedDaysAgo: 13 });
  addAgreement(c, { title: 'Guarantee terms', version: 1, status: 'signed', sentDaysAgo: 14, acceptedDaysAgo: 13 });
  ownerMember(c, { status: 'active', lastSeenHoursAgo: 30, title: 'Orthodontist' });
  addMember(c, { email: 'clinic@nepeanortho.test', name: 'Paula Reyes', title: 'Clinic manager', role: 'admin', status: 'invited', invitedDaysAgo: 3 });
  setBilling(c, planSubscription(c, { periodEndsInDays: 16 }), setupOrder(c, { daysAgo: 14, card: 2 }));
  standardHistory(c);
}

function seedTestClient() {
  // Test mode purchase: pending, nothing started. Every list is empty.
  const c = addClient(seedOf('cl_testco_0001'), { assignedStrategist: STRATEGISTS[0], internalNotes: 'Created by a test mode checkout.' });
  addMember(c, { email: c.primaryEmail, name: c.contactName, title: null, role: 'owner', status: 'invited', invitedDaysAgo: 3 });
  setBilling(c, null, setupOrder(c, { daysAgo: 3, card: 0 }));
  addActivity(c, { event: 'client.created', summary: 'Client created from a test mode checkout.', actor: SYSTEM, at: daysAgo(3, 1) });
}

/* ---------- lighter accounts so the list pages ---------- */

type Extra = [id: string, name: string, contact: string, city: string, industry: string, planId: PlanId | null, status: SeedClient['status'], ageDays: number, liveDaysAgo: number | null];

const EXTRAS: Extra[] = [
  ['cl_grimsbydoor', 'Grimsby Garage Doors', 'Alan Petrie', 'Grimsby', 'Garage doors', 'convert', 'live', 140, 110],
  ['cl_kingstonwin', 'Kingston Window Cleaning', 'Meera Shah', 'Kingston', 'Window cleaning', 'webline', 'live', 120, 95],
  ['cl_stoneychiro', 'Stoney Creek Chiropractic', 'Dr. Paul Novak', 'Stoney Creek', 'Chiropractic', 'convert', 'live', 200, 170],
  ['cl_burlbooks', 'Burlington Bookkeeping Co.', 'Linda Chau', 'Burlington', 'Bookkeeping', 'webline', 'live', 90, 70],
  ['cl_carpseptic', 'Carp Valley Septic', 'Rob McIntyre', 'Carp', 'Septic services', 'convert', 'live', 160, 130],
  ['cl_orilliainsp', 'Orillia Home Inspections', 'Dana Whitfield', 'Orillia', 'Home inspection', 'webline', 'live', 75, 50],
  ['cl_guelphtree', 'Guelph Tree Care', 'Ian Forsyth', 'Guelph', 'Tree care', 'grow', 'live', 150, 115],
  ['cl_brantappl', 'Brantford Appliance Repair', 'Victor Silva', 'Brantford', 'Appliance repair', 'convert', 'live', 110, 85],
  ['cl_miltonmass', 'Milton Massage Therapy', 'Rachel Kim', 'Milton', 'Massage therapy', 'webline', 'live', 66, 44],
  ['cl_oakvillepool', 'Oakville Pool & Spa', 'Greg Sutherland', 'Oakville', 'Pools', 'lets-talk', 'live', 230, 190],
  ['cl_kemptfence', 'Kemptville Fencing', 'Shane Doyle', 'Kemptville', 'Fencing', 'convert', 'live', 100, 72],
  ['cl_peterlock', 'Peterborough Locksmiths', 'Ana Costa', 'Peterborough', 'Locksmith', 'webline', 'live', 58, 35],
  ['cl_arnpriorsno', 'Arnprior Snow & Lawn', 'Kurt Hoffman', 'Arnprior', 'Landscaping', 'convert', 'paused', 180, 150],
  ['cl_mountdent', 'Hamilton Mountain Dentistry', 'Dr. Sana Ali', 'Hamilton', 'Dental clinic', 'convert', 'live', 260, 230],
  ['cl_manotickpav', 'Manotick Paving', 'Frank Russo', 'Manotick', 'Paving', 'convert', 'live', 130, 100],
  ['cl_cambfloor', 'Cambridge Flooring Studio', 'Joanne Burke', 'Cambridge', 'Flooring', 'webline', 'onboarding', 12, null],
  ['cl_smithsplumb', 'Smiths Falls Plumbing & Heating', 'Wayne Gallant', 'Smiths Falls', 'Plumbing', 'grow', 'live', 170, 140],
  ['cl_niagarawash', 'St. Catharines & Niagara Region Commercial Window Cleaning and Pressure Washing Ltd.', 'Marco DiNardo', 'St. Catharines', 'Window cleaning', 'convert', 'live', 95, 66],
  ['cl_stittsfoam', 'Stittsville Spray Foam', 'Becky Laurin', 'Stittsville', 'Insulation', 'convert', 'onboarding', 20, null],
  ['cl_bellbasement', 'Belleville Basement Waterproofing', 'Doug Tate', 'Belleville', 'Waterproofing', 'convert', 'churned', 300, 270],
  ['cl_waterlootut', 'Waterloo Tutoring Centre', 'Priyanka Bose', 'Waterloo', 'Tutoring', 'webline', 'churned', 240, 220],
  ['cl_barriejunk', 'Barrie Junk Removal', 'Tyler Grant', 'Barrie', 'Junk removal', 'convert', 'live', 80, 55],
  ['cl_perthcab', 'Perth Custom Cabinets', 'Helen Wright', 'Perth', 'Cabinetry', 'webline', 'live', 45, 20],
  ['cl_gloucgarage', 'Gloucester Garage Builders', 'Mike Bergeron', 'Gloucester', 'Construction', 'convert', 'churned', 330, 300],
];

const OTTAWA_AREA = new Set(['Carp', 'Kemptville', 'Arnprior', 'Manotick', 'Stittsville', 'Gloucester', 'Perth', 'Smiths Falls', 'Kingston', 'Belleville']);

function seedExtras() {
  EXTRAS.forEach(([id, businessName, contact, city, industry, planId, status, ageDays, liveDaysAgo], i) => {
    const domain = id.slice(3).replace(/_/g, '');
    const first = contact.replace(/^Dr\. /, '').split(' ')[0].toLowerCase();
    const seed: SeedClient = {
      id,
      businessName,
      contactName: contact,
      email: `${first}@${domain}.test`,
      phone: `+1${OTTAWA_AREA.has(city) ? '613' : '905'}55503${(10 + i).toString().padStart(2, '0')}`,
      city,
      industry,
      website: `https://${domain}.test`,
      planId,
      status,
      isTest: false,
      ageDays,
    };
    const c = addClient(seed, { updatedAt: daysAgo(3 + (i % 20), i % 7) });
    if (liveDaysAgo !== null) liveSince(c, liveDaysAgo, 'running');

    if (status === 'onboarding') {
      seedRun(c, { startedDaysAgo: ageDays, stage: 'build', targetLiveDate: torontoDate(10 + i), progress: { 'build-funnel': 'in_progress', 'build-site': 'in_progress' } });
      addIntake(c, { status: 'reviewed', startedDaysAgo: ageDays - 1, submittedDaysAgo: ageDays - 3, reviewedDaysAgo: ageDays - 4 });
    }

    // Guarantee history for the guarantee plans: two met, one missed.
    const live = liveDaysAgo ?? 0;
    if (id === 'cl_guelphtree') {
      c.guaranteeStatus = 'met';
      addCountedCalls(c, 31, live - 1, live - 58);
    } else if (id === 'cl_oakvillepool') {
      c.guaranteeStatus = 'met';
      addCountedCalls(c, 35, live - 1, live - 50);
    } else if (id === 'cl_smithsplumb') {
      c.guaranteeStatus = 'missed';
      c.internalNotes = 'Guarantee missed (22 of 30). First month refunded as agreed.';
      addCountedCalls(c, 22, live - 2, live - 59);
    }

    addAgreement(c, { title: planId === 'webline' ? 'Webline agreement' : 'Growth System service agreement', version: ageDays > 200 ? 2 : 3, status: 'signed', sentDaysAgo: ageDays, acceptedDaysAgo: Math.max(ageDays - 1, 0) });
    ownerMember(c, { status: status === 'churned' ? 'disabled' : 'active', lastSeenHoursAgo: 24 * (2 + (i % 30)) });

    const card = i % CARDS.length;
    if (planId === 'webline') {
      const care = status === 'churned' ? careSubscription(c, { status: 'canceled', periodEndsInDays: -40 }) : status === 'onboarding' ? null : careSubscription(c, { periodEndsInDays: 3 + (i % 25) });
      setBilling(c, care, setupOrder(c, { daysAgo: ageDays, card }));
    } else {
      const subStatus: BillingSubscription['status'] = status === 'churned' ? 'canceled' : status === 'paused' ? 'paused' : id === 'cl_barriejunk' ? 'past_due' : 'active';
      setBilling(c, planSubscription(c, { status: subStatus, periodEndsInDays: status === 'churned' ? -20 : 2 + (i % 27) }), setupOrder(c, { daysAgo: ageDays, card }));
    }
    standardHistory(c, { liveDaysAgo });
  });
}

/* ---------- build the database ---------- */

seedAcme();
seedHarbour();
seedBytown();
seedEscarpment();
seedRideau();
seedSteeltown();
seedGlebe();
seedDundas();
seedKanata();
seedLakeshore();
seedByward();
seedAncaster();
seedOrleans();
seedWestdale();
seedBarrhaven();
seedWaterdown();
seedNepean();
seedTestClient();
seedExtras();

/** Every client id, name and email (search and other domains can link to these). */
export function clientDirectory() {
  return clientsDb.clients
    .filter((c) => !c.deletedAt)
    .map((c) => ({ id: c.id, businessName: c.businessName, email: c.primaryEmail, status: c.status, planId: c.planId, isTest: c.isTest }));
}
