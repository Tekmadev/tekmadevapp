import type { Intake, IntakeAnswer, IntakeField, IntakeSection, IntakeStatus } from '@/api/schemas/clients';
import type { Tone } from '@/design/tokens';
import { formatDateTime } from '@/lib/dates';
import { formatCount } from '@/lib/format';

/**
 * Pure helpers for the Intake section: the status badge, the version line,
 * and each answer rendered from the intake schema in GET /meta (option values
 * shown as their labels, never as raw values).
 */

/** Draft is still being filled in, submitted waits for us, reviewed is done. */
export const INTAKE_STATUS: Record<IntakeStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'muted' },
  submitted: { label: 'Submitted', tone: 'gold' },
  reviewed: { label: 'Reviewed', tone: 'ok' },
};

/** "Started Sep 2, 9:14 AM", "Submitted ...", "Reviewed ... by Shajeed I.": only the steps that happened. */
export function intakeTimeline(intake: Intake, now: Date = new Date()): string[] {
  const lines = [`Started ${formatDateTime(intake.startedAt, now)}`];
  if (intake.submittedAt) lines.push(`Submitted ${formatDateTime(intake.submittedAt, now)}`);
  if (intake.reviewedAt) {
    lines.push(`Reviewed ${formatDateTime(intake.reviewedAt, now)}${intake.reviewedBy ? ` by ${intake.reviewedBy}` : ''}`);
  }
  return lines;
}

const optionLabel = (field: IntakeField, value: string) => field.options?.find((o) => o.value === value)?.label ?? value;

/**
 * One answer as display text, or null when it was not answered (missing,
 * null, blank or an empty list). Select and multiselect values show their
 * option labels; an unknown value shows as sent rather than being dropped.
 */
export function formatIntakeAnswer(field: IntakeField, answer: IntakeAnswer | undefined): string | null {
  if (answer === undefined || answer === null) return null;
  if (Array.isArray(answer)) {
    const labels = answer.map((v) => optionLabel(field, v).trim()).filter(Boolean);
    return labels.length > 0 ? labels.join(', ') : null;
  }
  if (typeof answer === 'number') return Number.isFinite(answer) ? formatCount(answer) : null;
  const text = answer.trim();
  if (!text) return null;
  return field.type === 'select' || field.type === 'multiselect' ? optionLabel(field, text) : text;
}

export type IntakeAnswerRow = { key: string; label: string; value: string | null; type: IntakeField['type'] };
export type IntakeAnswerGroup = { key: IntakeSection['key']; title: string; rows: IntakeAnswerRow[]; answered: number };

/** The schema's sections in order, each field with its formatted answer, and how many were answered. */
export function intakeAnswerGroups(schema: readonly IntakeSection[], answers: Intake['answers']): IntakeAnswerGroup[] {
  return schema.map((section) => {
    const rows = section.fields.map((field) => ({
      key: field.key,
      label: field.label,
      value: formatIntakeAnswer(field, answers[field.key]),
      type: field.type,
    }));
    return { key: section.key, title: section.title, rows, answered: rows.filter((r) => r.value !== null).length };
  });
}
