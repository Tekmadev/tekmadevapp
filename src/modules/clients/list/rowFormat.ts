import type { ClientRow, ClientsMeta, GuaranteeSummary } from '@/api/schemas/clients';
import type { Tone } from '@/design/tokens';
import { daysFromToday, formatCalendarDate } from '@/lib/dates';
import { countLabel } from '@/lib/format';

import { PACE_BADGES, stageLabel, statusLabel } from './labels';

/**
 * Text for a Clients list row card (brief 8.5). Pure, so it is unit tested and
 * the card stays a layout. Every value the server computed (stage, pace,
 * counts) is shown as sent; only calendar distances are worked out here.
 */

export type CellText = {
  text: string;
  /** Signal for "3d late"; ink4 for a missing value. */
  tone?: 'signal' | 'faint';
  /** What TalkBack reads (no abbreviations). */
  spoken: string;
};

/** "live Sep 12", or "8d to live" / "3d late" (signal) from the target date. */
export function goLiveCell(goLive: ClientRow['goLive'], now: Date = new Date()): CellText {
  if (goLive.liveDate) {
    const date = formatCalendarDate(goLive.liveDate, now);
    return { text: `live ${date}`, spoken: `live since ${date}` };
  }
  if (goLive.targetDate) {
    const days = daysFromToday(goLive.targetDate, now);
    if (days > 0) return { text: `${days}d to live`, spoken: `${countLabel(days, 'day', 'days')} to go-live` };
    if (days === 0) return { text: 'live today', spoken: 'go-live is today' };
    return { text: `${-days}d late`, tone: 'signal', spoken: `go-live ${countLabel(-days, 'day', 'days')} late` };
  }
  return { text: 'No target', tone: 'faint', spoken: 'no go-live target' };
}

/** "N client · M us" while a run is open; "None" without one. */
export function tasksCell(row: Pick<ClientRow, 'stage' | 'openTasks'>): CellText {
  const { client, us } = row.openTasks;
  if (row.stage === null && client === 0 && us === 0) return { text: 'None', tone: 'faint', spoken: 'no open tasks' };
  return {
    text: `${client} client · ${us} us`,
    spoken: `${countLabel(client, 'open task', 'open tasks')} for the client, ${us} for us`,
  };
}

export type GuaranteeCell = CellText & { badge: { label: string; tone: Tone } | null };

/** "12/30 · 41d" with Met / On pace / Behind, "Not started", or "n/a". */
export function guaranteeCell(g: GuaranteeSummary): GuaranteeCell {
  if (g.status === 'n/a' || !g.eligible) return { text: 'n/a', tone: 'faint', spoken: 'no guarantee', badge: null };
  if (g.status === 'not_started') return { text: 'Not started', tone: 'faint', spoken: 'guarantee not started', badge: null };
  const badge = PACE_BADGES[g.status] ?? null;
  return {
    text: `${g.counted}/${g.target} · ${g.daysLeft}d`,
    spoken: `guarantee ${g.counted} of ${g.target}, ${countLabel(g.daysLeft, 'day', 'days')} left${badge ? `, ${badge.label}` : ''}`,
    badge,
  };
}

/** The stage cell: the derived stage, or a quiet "No onboarding". */
export function stageCell(meta: ClientsMeta | undefined, row: Pick<ClientRow, 'stage' | 'blocked'>): CellText {
  if (!row.stage) return { text: 'No onboarding', tone: 'faint', spoken: 'no onboarding' };
  const label = stageLabel(meta, row.stage);
  return { text: label, spoken: `stage ${label}${row.blocked ? ', blocked' : ''}` };
}

/** Badges for what needs staff on this client (shown only when there is something). */
export function attentionBadges(row: Pick<ClientRow, 'callsToReview' | 'intakeToReview'>): string[] {
  const out: string[] = [];
  // Read defensively: older servers may not send these yet.
  const calls = row.callsToReview ?? 0;
  if (calls > 0) out.push(`${countLabel(calls, 'call', 'calls')} to review`);
  if (row.intakeToReview === true) out.push('Intake to review');
  return out;
}

/** One sentence for TalkBack, in the order the card shows things. */
export function rowSpokenLabel(meta: ClientsMeta | undefined, row: ClientRow, now: Date = new Date()): string {
  const parts = [
    row.businessName,
    row.isTest ? 'test client' : null,
    statusLabel(meta, row.status),
    row.planName ? `${row.planName} plan` : 'no plan yet',
    stageCell(meta, row).spoken,
    tasksCell(row).spoken,
    goLiveCell(row.goLive, now).spoken,
    guaranteeCell(row.guarantee).spoken,
    ...attentionBadges(row),
    row.strategist ? `strategist ${row.strategist}` : null,
  ];
  return parts.filter(Boolean).join(', ');
}
