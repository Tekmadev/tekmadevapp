import {
  ONBOARDING_STAGES,
  type ClientBundle,
  type OnboardingRun,
  type OnboardingStage,
  type OnboardingTask,
  type TaskKind,
  type TaskOwner,
  type TaskResult,
  type TaskStatus,
} from '@/api/schemas/clients';
import type { Tone } from '@/design/tokens';
import { daysBetween, formatShortDate, parseCalendarDate, todayToronto, torontoDateOf, torontoWallTimeToInstant } from '@/lib/dates';

/**
 * Pure helpers for the Onboarding section: task groups, the line under each
 * task, the optimistic status change (and its undo), and cache updates from
 * the `{ task, run }` the server returns.
 */

export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'waiting_client', 'done', 'skipped', 'blocked'];

export const TASK_STATUS_FALLBACK: Record<TaskStatus, { label: string; tone: Tone }> = {
  todo: { label: 'To do', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'gold' },
  waiting_client: { label: 'Waiting on client', tone: 'warn' },
  done: { label: 'Done', tone: 'ok' },
  skipped: { label: 'Skipped', tone: 'muted' },
  blocked: { label: 'Blocked', tone: 'signal' },
};

export const TASK_OWNER_FALLBACK: Record<TaskOwner, string> = { client: 'Client', tekmadev: 'Tekmadev' };

export const TASK_KIND_FALLBACK: Record<TaskKind, string> = {
  general: 'General',
  form: 'Form',
  upload: 'Upload',
  access: 'Access',
  meeting: 'Meeting',
  agreement: 'Agreement',
  build: 'Build',
  approval: 'Approval',
  review: 'Review',
  launch: 'Launch',
  billing: 'Billing',
};

/** Done and skipped tasks are closed: struck through, and they count as done. */
export const isClosedStatus = (status: TaskStatus) => status === 'done' || status === 'skipped';

/** A run that is complete is read only (the server answers 409 `run_complete` to every write). */
export const isRunComplete = (run: Pick<OnboardingRun, 'completedAt'>) => run.completedAt !== null;

/** Stages a hand-added task can go in (the server refuses Complete). */
export const TASK_STAGES: readonly OnboardingStage[] = ONBOARDING_STAGES.filter((s) => s !== 'complete');

export type TaskGroup = { stage: OnboardingStage; tasks: OnboardingTask[]; closed: number };

/** Tasks grouped by stage in tracker order, keeping the server's order inside each stage. Empty stages are left out. */
export function groupTasks(tasks: readonly OnboardingTask[]): TaskGroup[] {
  return ONBOARDING_STAGES.map((stage) => {
    const inStage = tasks.filter((t) => t.stage === stage);
    return { stage, tasks: inStage, closed: inStage.filter((t) => isClosedStatus(t.status)).length };
  }).filter((g) => g.tasks.length > 0);
}

export type MetaPart = { text: string; tone?: Tone };

/** "due Sep 12", plus "3d late" once the Toronto day has passed. */
export function dueParts(dueAt: string, now: Date = new Date()): MetaPart[] {
  const due = `due ${formatShortDate(dueAt, now)}`;
  const late = daysBetween(torontoDateOf(dueAt), todayToronto(now));
  return late > 0 ? [{ text: due, tone: 'signal' }, { text: `${late}d late`, tone: 'signal' }] : [{ text: due }];
}

/**
 * The line under a task: "optional", the owner, the kind, then "due <date>"
 * for open tasks or "done <date> by <who>" for closed ones.
 */
export function taskMetaParts(
  task: OnboardingTask,
  labels: { owner: string; kind: string },
  now: Date = new Date(),
): MetaPart[] {
  const parts: MetaPart[] = [];
  if (!task.required) parts.push({ text: 'optional' });
  parts.push({ text: labels.owner }, { text: labels.kind });
  if (isClosedStatus(task.status)) {
    if (task.doneAt) {
      const verb = task.status === 'skipped' ? 'skipped' : 'done';
      parts.push({ text: `${verb} ${formatShortDate(task.doneAt, now)}${task.doneBy ? ` by ${task.doneBy}` : ''}` });
    }
  } else if (task.dueAt) {
    parts.push(...dueParts(task.dueAt, now));
  }
  return parts;
}

/** What the server will store for a status change, applied before it answers (the outcome is certain). */
export function optimisticTask(task: OnboardingTask, status: TaskStatus, who: string | null, nowIso: string): OnboardingTask {
  const closing = isClosedStatus(status);
  const wasClosed = isClosedStatus(task.status);
  return {
    ...task,
    status,
    doneAt: closing ? (wasClosed ? task.doneAt : nowIso) : null,
    doneBy: closing ? (wasClosed ? task.doneBy : who) : null,
    updatedAt: nowIso,
  };
}

/** Replace one task in the bundle (the run's numbers wait for the server). */
export function withTask(bundle: ClientBundle, task: OnboardingTask): ClientBundle {
  if (!bundle.onboarding) return bundle;
  return { ...bundle, onboarding: { ...bundle.onboarding, tasks: bundle.onboarding.tasks.map((t) => (t.id === task.id ? task : t)) } };
}

/** The server's `{ task, run }`: the task (added or replaced, in checklist order) and the recomputed run. */
export function withTaskResult(bundle: ClientBundle, result: TaskResult): ClientBundle {
  if (!bundle.onboarding || bundle.onboarding.run.id !== result.run.id) return bundle;
  const exists = bundle.onboarding.tasks.some((t) => t.id === result.task.id);
  const tasks = exists ? bundle.onboarding.tasks.map((t) => (t.id === result.task.id ? result.task : t)) : [...bundle.onboarding.tasks, result.task];
  const order = (s: OnboardingStage) => ONBOARDING_STAGES.indexOf(s);
  const sorted = exists ? tasks : [...tasks].sort((a, b) => order(a.stage) - order(b.stage) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return { ...bundle, onboarding: { run: result.run, tasks: sorted } };
}

/** The run the server returned (PATCH, complete). */
export function withRun(bundle: ClientBundle, run: OnboardingRun): ClientBundle {
  if (!bundle.onboarding || bundle.onboarding.run.id !== run.id) return bundle;
  return { ...bundle, onboarding: { ...bundle.onboarding, run } };
}

/** Due time for a picked due date: 5:00 PM Toronto, the end of that business day. */
export function dueDateToInstant(date: string): string | null {
  const p = parseCalendarDate(date);
  if (!p) return null;
  return torontoWallTimeToInstant({ ...p, hour: 17, minute: 0 });
}

/** "Marked done." / "Marked waiting on client." */
export function statusToast(label: string): string {
  return `Marked ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
}
