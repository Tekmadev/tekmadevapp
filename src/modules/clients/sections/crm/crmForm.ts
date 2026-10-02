import type { CrmLocationInput } from '@/api/endpoints/clients';
import type { CrmLocation } from '@/api/schemas/clients';
import { plural } from '@/lib/format';

/** What the CRM account form holds: the raw text as typed. */
export type CrmDraft = { locationId: string; calendars: string };

/** The server's mapping as form text: one calendar id per line. */
export function crmDraftFrom(crm: Pick<CrmLocation, 'locationId' | 'calendarIds'>): CrmDraft {
  return { locationId: crm.locationId ?? '', calendars: crm.calendarIds.join('\n') };
}

/** Calendar ids typed one per line (commas and spaces also split), trimmed, blanks and repeats dropped. */
export function parseCalendarIds(text: string): string[] {
  const ids = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

/**
 * The PUT body, as typed. A blank sub-account id is null; calendars typed
 * without one are still sent, so the server can say the id is missing.
 */
export function crmInput(draft: CrmDraft): CrmLocationInput {
  return { locationId: draft.locationId.trim() || null, calendarIds: parseCalendarIds(draft.calendars) };
}

/** Clearing the id of an existing mapping removes it (with its calendars). */
export function isRemoval(crm: Pick<CrmLocation, 'locationId'>, input: CrmLocationInput): boolean {
  return crm.locationId !== null && input.locationId === null;
}

export const REMOVE_INPUT: CrmLocationInput = { locationId: null, calendarIds: [] };

export function crmChanged(crm: Pick<CrmLocation, 'locationId' | 'calendarIds'>, input: CrmLocationInput): boolean {
  if ((crm.locationId ?? null) !== input.locationId) return true;
  if (crm.calendarIds.length !== input.calendarIds.length) return true;
  return crm.calendarIds.some((id, i) => id !== input.calendarIds[i]);
}

/** "3 appointments waiting to be applied" */
export function pendingLine(count: number): string {
  return `${count} ${plural(count, 'appointment', 'appointments')} waiting to be applied`;
}
