import type { DemoListParams } from '@/api/endpoints/demos';
import { OPEN_DEMO_STATUSES, type DemoCounts, type DemoEvent, type DemoRequest, type DemoStatus } from '@/api/schemas/demos';
import type { Tone } from '@/design/tokens';
import { daysFromToday, formatCalendarDate, formatDateTime, relativeTime } from '@/lib/dates';

/**
 * Demo request copy and small rules for the screens (pure, no React). The
 * status words are the contract's ("Building", "Ready to show", "Shown",
 * "Cancelled"). What someone may do is never decided here: the server's `can`
 * says it, these helpers only turn it into buttons and lines.
 */

export const DEMO_STATUS: Readonly<Record<DemoStatus, { label: string; tone: Tone }>> = {
  requested: { label: 'Requested', tone: 'gold' },
  building: { label: 'Building', tone: 'neutral' },
  ready: { label: 'Ready to show', tone: 'ok' },
  shown: { label: 'Shown', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

/** The badge for a status (a status this build does not know reads as itself, neutral). */
export function demoStatusBadge(status: string): { label: string; tone: Tone } {
  return Object.prototype.hasOwnProperty.call(DEMO_STATUS, status) ? DEMO_STATUS[status as DemoStatus] : { label: status, tone: 'neutral' };
}

export const isOpenDemo = (status: DemoStatus) => OPEN_DEMO_STATUSES.includes(status);

/* ---------- the Demos segment's filters ---------- */

export const DEMO_FILTERS = ['open', 'ready', 'mine', 'all'] as const;
export type DemoFilter = (typeof DEMO_FILTERS)[number];

export const DEMO_FILTER_LABELS: Readonly<Record<DemoFilter, string>> = { open: 'Open', ready: 'Ready', mine: 'Mine', all: 'All' };

/** A route param (`view`) as a filter, or null. */
export function toDemoFilter(value: unknown): DemoFilter | null {
  return (DEMO_FILTERS as readonly unknown[]).includes(value) ? (value as DemoFilter) : null;
}

/** What each filter asks GET /demos for. Mine: your open requests (what still needs you). */
export function demoFilterParams(filter: DemoFilter): DemoListParams {
  switch (filter) {
    case 'ready':
      return { status: 'ready' };
    case 'mine':
      return { status: 'open', mine: true };
    case 'all':
      return { status: 'all' };
    default:
      return { status: 'open' };
  }
}

/** The chip's count from the response (All has none: the server does not count it). */
export function demoFilterCount(filter: DemoFilter, counts: DemoCounts | undefined): number | null {
  if (!counts) return null;
  if (filter === 'open') return counts.open;
  if (filter === 'ready') return counts.ready;
  if (filter === 'mine') return counts.mine;
  return null;
}

export const DEMO_EMPTY: Readonly<Record<DemoFilter, string>> = {
  open: 'No open demo requests. Ask for one from a client or a lead.',
  ready: 'Nothing is ready to show yet.',
  mine: 'You have no open demo requests. Ask for one from a client or a lead.',
  all: 'No demo requests yet. Ask for one from a client or a lead.',
};

/* ---------- lines ---------- */

/** Who it is for: the client's name, else the lead's. */
export function demoTargetName(d: Pick<DemoRequest, 'clientName' | 'leadName'>): string | null {
  return d.clientName?.trim() || d.leadName?.trim() || null;
}

/** A team member as shown: their name, else the email. */
export const personName = (email: string, name: string | null | undefined) => name?.trim() || email;

/** "Plumber · Hamilton" */
export function demoRowSubtitle(d: Pick<DemoRequest, 'business'>): string {
  return [d.business.type.trim(), d.business.area.trim()].filter(Boolean).join(' · ');
}

/** "For Acme Plumbing · Noah Lavoie · 2 h ago" (the client or lead only when its name differs from the business). */
export function demoRowMeta(d: Pick<DemoRequest, 'business' | 'clientName' | 'leadName' | 'requestedBy' | 'requestedByName' | 'createdAt'>, now: Date): string {
  const target = demoTargetName(d);
  const forWhom = target && target.toLowerCase() !== d.business.name.trim().toLowerCase() ? `For ${target}` : null;
  return [forWhom, personName(d.requestedBy, d.requestedByName), relativeTime(d.createdAt, now)].filter(Boolean).join(' · ');
}

/**
 * When it is needed, as a badge: late in signal and today in warn while the
 * request is open; quiet once it is closed. Null without a date.
 */
export function neededByBadge(neededBy: string | null, status: DemoStatus, now: Date): { label: string; tone: Tone } | null {
  if (!neededBy) return null;
  const date = formatCalendarDate(neededBy, now);
  if (!isOpenDemo(status)) return { label: `Needed by ${date}`, tone: 'muted' };
  const days = daysFromToday(neededBy, now);
  if (days < 0) return { label: `Late: needed by ${date}`, tone: 'signal' };
  if (days === 0) return { label: 'Needed today', tone: 'warn' };
  if (days === 1) return { label: 'Needed tomorrow', tone: 'gold' };
  return { label: `Needed by ${date}`, tone: 'neutral' };
}

/* ---------- actions ---------- */

export type DemoStep = { status: DemoStatus; label: string; hint: string };

/**
 * The builder's next status buttons (`can.manage` only): Start building,
 * Mark ready to show, or Back to building on a ready demo. "Mark as shown"
 * follows `can.markShown` on its own; cancelling is its own action.
 */
export function demoSteps(d: Pick<DemoRequest, 'status' | 'can'>): DemoStep[] {
  if (!d.can.manage) return [];
  switch (d.status) {
    case 'requested':
      return [{ status: 'building', label: 'Start building', hint: 'Moves it to Building, with you as the builder when nobody is' }];
    case 'building':
      return [{ status: 'ready', label: 'Mark ready to show', hint: 'Tells the salesperson the demo is ready' }];
    case 'ready':
      return [{ status: 'building', label: 'Back to building', hint: 'Moves it back to Building for more work' }];
    default:
      return [];
  }
}

/** Only https links open (the server only accepts those for a demo). */
export function isDemoLink(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https:\/\/\S+\.\S+/i.test(url.trim());
}

/** "demos.tekmadev.com/acme" for display, without the scheme. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
}

/* ---------- history ---------- */

/** One line of the history: what happened, in plain words. `nameFor` turns a builder email into a name. */
export function demoEventText(e: Pick<DemoEvent, 'type' | 'from' | 'to'>, nameFor: (email: string) => string): string {
  switch (e.type) {
    case 'created':
      return 'Asked for a demo';
    case 'edited':
      return 'Edited the request';
    case 'builder':
      return e.to ? `Builder: ${nameFor(e.to)}` : 'Removed the builder';
    case 'link':
      if (!e.to) return 'Removed the demo link';
      return e.from ? 'Changed the demo link' : 'Added the demo link';
    case 'status':
      switch (e.to) {
        case 'building':
          return e.from === 'ready' ? 'Moved back to building' : 'Started building';
        case 'ready':
          return 'Marked it ready to show';
        case 'shown':
          return 'Marked it as shown';
        case 'cancelled':
          return 'Cancelled the request';
        default:
          return e.to ? `Moved to ${demoStatusBadge(e.to).label}` : 'Changed the status';
      }
    default:
      return 'Updated the request';
  }
}

/** "Noah Lavoie · Oct 3, 2:41 PM" (Toronto time). */
export function demoEventByline(e: Pick<DemoEvent, 'by' | 'byName' | 'at'>, now: Date): string {
  return `${personName(e.by, e.byName)} · ${formatDateTime(e.at, now)}`;
}
