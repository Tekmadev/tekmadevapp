import type { NewActivityInput } from '@/api/endpoints/clients';
import type { Activity, ActivityPage } from '@/api/schemas/clients';
import { formatDateTime } from '@/lib/dates';

import { textOrNull } from '../formText';
import { labelOf, type ClientLabels } from '../labels';

/** Copy and paging for the Activity timeline (brief 8.5, section 11). */

export const CLIENT_SEES = 'client sees';
export const UPDATE_HINT = "Appears in the client's portal. No email is sent.";
export const NOTE_HINT = 'Only Tekmadev staff see internal notes.';
export const TEXT_REQUIRED = 'Write something first.';

/** Who did it: a person's name or email, or "System". */
export function activityActor(actor: Activity['actor']): string {
  if (actor.kind === 'system') return 'System';
  return actor.name?.trim() || actor.email?.trim() || (actor.kind === 'client' ? 'Client' : 'Staff');
}

/** "Sep 30, 2:41 PM · Maya Chen · Call logged" */
export function activityMeta(entry: Pick<Activity, 'createdAt' | 'actor' | 'event'>, labels: ClientLabels, now: Date = new Date()): string {
  return [formatDateTime(entry.createdAt, now), activityActor(entry.actor), labelOf(labels.activityEvents, entry.event)].join(' · ');
}

/**
 * What an entry says. Notes and updates show their full text (the summary may
 * be shortened), updates lead with their subject; events show the summary.
 */
export function activityContent(entry: Pick<Activity, 'kind' | 'summary' | 'subject' | 'text'>): { heading: string | null; body: string } {
  if (entry.kind === 'event') return { heading: null, body: entry.summary };
  const body = entry.text?.trim() || entry.summary;
  const heading = entry.kind === 'update' ? entry.subject?.trim() || null : null;
  return { heading, body };
}

/** Long text folds behind "Show more". */
export function isLongText(text: string): boolean {
  return text.length > 280 || text.split('\n').length > 6;
}

/**
 * The timeline: the bundle's first page (always the freshest) followed by the
 * older pages loaded with "Load more". Older pages were fetched from an
 * earlier first page, so anything newer is already in the bundle's page and
 * the rest follows in order; repeats are dropped by id.
 */
export function mergeActivity(first: readonly Activity[], older: readonly ActivityPage[]): Activity[] {
  const seen = new Set<string>();
  const out: Activity[] = [];
  for (const entry of [...first, ...older.flatMap((p) => p.items)]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

export type ComposerKind = 'note' | 'update';

/** The POST body for what is typed (subject and link belong to updates only). */
export function activityInput(kind: ComposerKind, form: { subject: string; text: string; link: string }): NewActivityInput {
  const text = form.text.trim();
  if (kind === 'note') return { kind, text };
  return { kind, text, subject: textOrNull(form.subject), actionUrl: textOrNull(form.link) };
}
