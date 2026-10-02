import { ONBOARDING_STAGES, type ClientsMeta, type OnboardingStage, type OnboardingTemplate } from '@/api/schemas/clients';
import { finalizeSlug } from '@/lib/text';

import { kindLabel, ownerLabel, plansSummary, stageLabel } from '../list/labels';

/**
 * Pure helpers for the owner's Checklist templates screen (brief 8.5): list
 * grouping, the edit sheet's checks and the cache update after a save.
 */

export type TemplatePayload = OnboardingTemplate['payload'];

/** The server's rule for a template key (also the URL segment of PUT /onboarding-templates/:key). */
export const TEMPLATE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TEMPLATE_KEY_MAX = 60;

export const PAYLOAD_ERROR = 'Payload must be valid JSON.';

const stageIndex = (stage: OnboardingStage) => ONBOARDING_STAGES.indexOf(stage);

/** Stage order, then sort order, then key: the order new runs create the tasks in. */
export function sortTemplates(templates: readonly OnboardingTemplate[]): OnboardingTemplate[] {
  return [...templates].sort(
    (a, b) => stageIndex(a.stage) - stageIndex(b.stage) || a.sortOrder - b.sortOrder || a.key.localeCompare(b.key),
  );
}

/** Replace the template with the same key (or add it), keeping the list in order. */
export function upsertTemplate(templates: readonly OnboardingTemplate[], saved: OnboardingTemplate): OnboardingTemplate[] {
  return sortTemplates([...templates.filter((t) => t.key !== saved.key), saved]);
}

export function removeTemplate(templates: readonly OnboardingTemplate[], key: string): OnboardingTemplate[] {
  return templates.filter((t) => t.key !== key);
}

export type TemplateListItem =
  | { type: 'stage'; id: string; stage: OnboardingStage; count: number }
  | { type: 'template'; id: string; template: OnboardingTemplate };

/** Flat rows for the list: a header for each stage that has templates, then its templates in order. */
export function groupTemplates(templates: readonly OnboardingTemplate[]): TemplateListItem[] {
  const out: TemplateListItem[] = [];
  const sorted = sortTemplates(templates);
  for (const stage of ONBOARDING_STAGES) {
    const inStage = sorted.filter((t) => t.stage === stage);
    if (inStage.length === 0) continue;
    out.push({ type: 'stage', id: `stage:${stage}`, stage, count: inStage.length });
    for (const template of inStage) out.push({ type: 'template', id: `template:${template.key}`, template });
  }
  return out;
}

/** A key suggested from the title while creating: "Share your logo" becomes "share-your-logo". */
export function keyFromTitle(title: string): string {
  return finalizeSlug(title).slice(0, TEMPLATE_KEY_MAX).replace(/-+$/, '');
}

/** What is wrong with a new template's key, or null. Existing keys are refused: PUT would overwrite them. */
export function keyError(key: string, existingKeys: readonly string[]): string | null {
  if (key === '') return 'Enter a key.';
  if (key.length > TEMPLATE_KEY_MAX) return `Keep the key to ${TEMPLATE_KEY_MAX} characters or fewer.`;
  if (!TEMPLATE_KEY_PATTERN.test(key)) return 'Use lowercase letters, numbers and dashes for the key.';
  if (existingKeys.includes(key)) return 'A template with this key already exists.';
  return null;
}

/** The JSON editor's text: blank is "no payload" (null); anything else must parse. */
export function parsePayloadText(text: string): { ok: true; value: TemplatePayload } | { ok: false } {
  if (text.trim() === '') return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) as TemplatePayload };
  } catch {
    return { ok: false };
  }
}

/** The stored payload as editor text: pretty printed, empty for none. */
export function payloadToText(payload: TemplatePayload): string {
  return payload === null ? '' : JSON.stringify(payload, null, 2);
}

/** A new template goes after the last one in its stage (steps of 10 leave room to slot one in between). */
export function suggestedSortOrder(templates: readonly OnboardingTemplate[], stage: OnboardingStage): number {
  const orders = templates.filter((t) => t.stage === stage).map((t) => t.sortOrder);
  if (orders.length === 0) return 10;
  return Math.floor(Math.max(...orders) / 10) * 10 + 10;
}

function detailParts(meta: ClientsMeta | undefined, t: OnboardingTemplate): string[] {
  const parts = [kindLabel(meta, t.kind), plansSummary(meta, t.plans)];
  if (!t.required) parts.push('optional');
  return parts;
}

/** The second line of a template card: kind, plans and "optional". */
export function templateDetails(meta: ClientsMeta | undefined, t: OnboardingTemplate): string {
  return detailParts(meta, t).join(' · ');
}

/** One sentence for TalkBack, in the order the card shows things. */
export function templateSpokenLabel(meta: ClientsMeta | undefined, t: OnboardingTemplate): string {
  return [
    t.title,
    t.active ? null : 'inactive',
    `owner ${ownerLabel(meta, t.owner)}`,
    `stage ${stageLabel(meta, t.stage)}`,
    ...detailParts(meta, t),
    `key ${t.key}`,
  ]
    .filter(Boolean)
    .join(', ');
}
