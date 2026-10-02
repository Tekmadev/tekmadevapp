import type {
  ClientListStatus,
  ClientsMeta,
  ClientStatus,
  GuaranteePace,
  OnboardingStage,
  PlanId,
  PlanOption,
  TaskKind,
  TaskOwner,
} from '@/api/schemas/clients';
import type { SelectOption } from '@/components/form/Select';
import type { Tone } from '@/design/tokens';

/**
 * Labels and tones for the clients screens. GET /meta is the source of truth;
 * the fallbacks here only cover the first launch before meta has loaded, and
 * use the brief's own words.
 */

/** Status badge tones (brief 8.5): lead muted, pending neutral, onboarding gold, live ok, paused warn, churned muted. */
export const STATUS_TONES: Record<ClientStatus, Tone> = {
  lead: 'muted',
  pending: 'neutral',
  onboarding: 'gold',
  live: 'ok',
  paused: 'warn',
  churned: 'muted',
};

const STATUS_FALLBACK: Record<ClientStatus, string> = {
  lead: 'Lead',
  pending: 'Pending',
  onboarding: 'Onboarding',
  live: 'Live',
  paused: 'Paused',
  churned: 'Churned',
};

const STAGE_FALLBACK: Record<OnboardingStage, string> = {
  welcome: 'Welcome',
  intake: 'Intake',
  kickoff: 'Kickoff',
  build: 'Build',
  review: 'Review',
  go_live: 'Go live',
  optimizing: 'Optimizing',
  complete: 'Complete',
};

const OWNER_FALLBACK: Record<TaskOwner, string> = { client: 'Client', tekmadev: 'Tekmadev' };

/** The list's filter chips, in the brief's order (Active is the default). */
export const LIST_STATUS_CHIPS: readonly { value: ClientListStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'lead', label: 'Lead' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'live', label: 'Live' },
  { value: 'pending', label: 'Pending' },
  { value: 'paused', label: 'Paused' },
  { value: 'churned', label: 'Churned' },
  { value: 'all', label: 'All' },
];

/** The row's guarantee badge (brief 8.5: "Met / On pace / Behind"). */
export const PACE_BADGES: Partial<Record<GuaranteePace, { label: string; tone: Tone }>> = {
  met: { label: 'Met', tone: 'ok' },
  on_pace: { label: 'On pace', tone: 'ok' },
  behind: { label: 'Behind', tone: 'warn' },
};

const find = <V extends string>(options: readonly { value: V; label: string }[] | undefined, value: V) =>
  options?.find((o) => o.value === value)?.label;

export const statusLabel = (meta: ClientsMeta | undefined, status: ClientStatus) => find(meta?.clientStatuses, status) ?? STATUS_FALLBACK[status];
export const stageLabel = (meta: ClientsMeta | undefined, stage: OnboardingStage) => find(meta?.onboardingStages, stage) ?? STAGE_FALLBACK[stage];
export const ownerLabel = (meta: ClientsMeta | undefined, owner: TaskOwner) => find(meta?.taskOwners, owner) ?? OWNER_FALLBACK[owner];
export const kindLabel = (meta: ClientsMeta | undefined, kind: TaskKind) =>
  find(meta?.taskKinds, kind) ?? kind.charAt(0).toUpperCase() + kind.slice(1);

/** The plans and products in the brief's words, for the first launch before meta loads. */
export const PLAN_FALLBACK: readonly PlanOption[] = [
  { id: 'convert', name: 'Convert', kind: 'growth', guarantee: false, needsCarePlan: false },
  { id: 'grow', name: 'Grow', kind: 'growth', guarantee: true, needsCarePlan: false },
  { id: 'lets-talk', name: "Let's Talk", kind: 'growth', guarantee: true, needsCarePlan: false },
  { id: 'webline', name: 'Webline', kind: 'product', guarantee: false, needsCarePlan: true },
];

export const plansOf = (meta: ClientsMeta | undefined): readonly PlanOption[] => meta?.planOptions ?? PLAN_FALLBACK;

export function planName(meta: ClientsMeta | undefined, id: PlanId): string {
  return plansOf(meta).find((p) => p.id === id)?.name ?? id;
}

/** "Grow (guarantee)", like the brief's plan list. */
export const planOptionLabel = (plan: PlanOption) => (plan.guarantee ? `${plan.name} (guarantee)` : plan.name);

/** Growth plans first, then one-time products; the group is the second line of each option. */
export function planSelectOptions(meta: ClientsMeta | undefined): SelectOption<PlanId>[] {
  const plans = plansOf(meta);
  return [...plans.filter((p) => p.kind === 'growth'), ...plans.filter((p) => p.kind !== 'growth')].map((p) => ({
    value: p.id,
    label: planOptionLabel(p),
    hint: p.kind === 'growth' ? 'Growth plan' : 'One-time product',
  }));
}

/** "All plans", or the plan names in plan order. */
export function plansSummary(meta: ClientsMeta | undefined, ids: readonly PlanId[]): string {
  if (ids.length === 0) return 'All plans';
  return plansOf(meta)
    .filter((p) => ids.includes(p.id))
    .map((p) => p.name)
    .join(', ');
}
