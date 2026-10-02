import type {
  Campaign,
  ConsentEvent,
  ConsentEventType,
  EmailMeta,
  EmailTemplate,
  EngagementEvent,
  EngagementType,
  Subscriber,
  SubscriberStatus,
  UnsubscribeReason,
  UnsubscribeSource,
} from '@/api/schemas/email';
import type { Tone } from '@/design/tokens';
import { finalizeSlug, slugifyLive } from '@/lib/text';

/**
 * Pure helpers for the Email screens (brief 8.11): the brief's exact copy,
 * labels and tones from GET /meta with the brief's words as the fallback, the
 * campaign key rules, template suggestions and the row text. No React here.
 */

/* ---------- copy (brief 8.11, exact) ---------- */

export const EMAIL_COPY = {
  campaignsEmpty: "No campaigns yet. Add one, then use its key in the template's tracking links.",
  engagementEmpty: 'No opens or clicks yet. They appear here as soon as a sent email is opened or a link is clicked.',
  pauseNote: 'Pausing is a label only. Opens and clicks are still counted.',
  deleteCampaign: 'Counters reset if you add this key again. Past opens and clicks stay on record.',
  keyHelp: "This is the c= value in the template's pixel and links.",
  templateHint: 'Paste as a Custom HTML block in the CRM.',
  unsubscribed: 'Subscriber unsubscribed.',
  deleted: 'Subscriber deleted. Their CRM contact is queued to be suppressed and tagged erased.',
  /** The server's messages for the `key` and `name` codes (contract section 11). */
  keyInvalid: 'Enter a campaign key using letters, numbers and dashes.',
  nameRequired: 'Enter a campaign name.',
} as const;

/** The full consequence of a permanent erasure, in the brief's words. */
export function eraseMessage(email: string): string {
  return `Erase ${email}? Their consent history is deleted and the CRM contact is suppressed and tagged erased. This address will never be pushed to the CRM again. This cannot be undone.`;
}

/** Our words (the brief gives only the toast): what an unsubscribe does. */
export function unsubscribeMessage(email: string): string {
  return `Unsubscribe ${email}? They stop getting marketing email, and the CRM gets the change as email DND.`;
}

/* ---------- labels and tones (GET /meta, brief as fallback) ---------- */

type Labelled<V extends string = string> = { value: V; label: string; tone?: Tone };

const FALLBACK: EmailMeta = {
  subscriberStatuses: [
    { value: 'active', label: 'Active', tone: 'gold' },
    { value: 'unsubscribed', label: 'Unsubscribed', tone: 'muted' },
    { value: 'bounced', label: 'Bounced', tone: 'muted' },
    { value: 'complained', label: 'Complained', tone: 'muted' },
  ],
  unsubscribeReasons: [
    { value: 'too_many', label: 'Too many emails' },
    { value: 'not_relevant', label: 'Not relevant to me' },
    { value: 'never_signed_up', label: 'I never signed up' },
    { value: 'other', label: 'Something else' },
  ],
  unsubscribeSources: [
    { value: 'unsubscribe_page', label: 'via the unsubscribe page' },
    { value: 'crm', label: 'via the CRM' },
    { value: 'crm_permanent', label: 'via the CRM, as permanent' },
    { value: 'admin', label: 'via the admin' },
  ],
  subscriberSources: [],
  consentEvents: [
    { value: 'subscribed', label: 'Subscribed' },
    { value: 'resubscribed', label: 'Resubscribed' },
    { value: 'unsubscribed', label: 'Unsubscribed' },
    { value: 'bounced', label: 'Bounced' },
    { value: 'complained', label: 'Marked as spam' },
    { value: 'reason', label: 'Said why they left' },
  ],
  campaignStatuses: [
    { value: 'active', label: 'Active', tone: 'gold' },
    { value: 'paused', label: 'Paused', tone: 'muted' },
  ],
  engagementTypes: [
    { value: 'open', label: 'Open', tone: 'muted' },
    { value: 'click', label: 'Click', tone: 'gold' },
  ],
};

/** "free_tool" -> "Free tool": only for a value meta does not know yet. */
export function humanize(value: string): string {
  const text = value.replace(/[._-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

function find<V extends string>(list: readonly Labelled<V>[] | undefined, value: string): Labelled<V> | undefined {
  return list?.find((o) => o.value === value);
}

/** Meta's entry, else the brief's, else the value made readable. */
function pick<K extends keyof EmailMeta>(meta: EmailMeta | undefined, key: K, value: string): Labelled | undefined {
  return find(meta?.[key] as readonly Labelled[] | undefined, value) ?? find(FALLBACK[key] as readonly Labelled[], value);
}

export type BadgeSpec = { label: string; tone: Tone };

export function subscriberStatusBadge(meta: EmailMeta | undefined, status: SubscriberStatus): BadgeSpec {
  const hit = pick(meta, 'subscriberStatuses', status);
  return { label: hit?.label ?? humanize(status), tone: hit?.tone ?? (status === 'active' ? 'gold' : 'muted') };
}

export function campaignStatusBadge(meta: EmailMeta | undefined, active: boolean): BadgeSpec {
  const value = active ? 'active' : 'paused';
  const hit = pick(meta, 'campaignStatuses', value);
  return { label: hit?.label ?? humanize(value), tone: hit?.tone ?? (active ? 'gold' : 'muted') };
}

export function engagementBadge(meta: EmailMeta | undefined, type: EngagementType): BadgeSpec {
  const hit = pick(meta, 'engagementTypes', type);
  return { label: hit?.label ?? humanize(type), tone: hit?.tone ?? (type === 'click' ? 'gold' : 'muted') };
}

/** The "CRM / No CRM" badge. */
export function crmBadge(inCrm: boolean): BadgeSpec {
  return inCrm ? { label: 'CRM', tone: 'neutral' } : { label: 'No CRM', tone: 'muted' };
}

export function reasonLabel(meta: EmailMeta | undefined, reason: UnsubscribeReason): string {
  return pick(meta, 'unsubscribeReasons', reason)?.label ?? humanize(reason);
}

/** "via the unsubscribe page", "via the CRM, as permanent"... */
export function unsubscribeSourceLabel(meta: EmailMeta | undefined, source: UnsubscribeSource | string): string {
  return pick(meta, 'unsubscribeSources', source)?.label ?? humanize(source);
}

/** Where they signed up ("Website footer"); the key itself when meta does not know it. */
export function signupSourceLabel(meta: EmailMeta | undefined, source: string): string {
  return pick(meta, 'subscriberSources', source)?.label ?? humanize(source);
}

export function consentEventLabel(meta: EmailMeta | undefined, event: ConsentEventType): string {
  return pick(meta, 'consentEvents', event)?.label ?? humanize(event);
}

/**
 * Where a consent event happened: leaving events read "via the unsubscribe
 * page"; signups read their source ("Website footer").
 */
export function consentSourceLabel(meta: EmailMeta | undefined, event: ConsentEvent): string {
  const leaving = event.event === 'unsubscribed' || event.event === 'reason';
  if (leaving) {
    const via = pick(meta, 'unsubscribeSources', event.source);
    if (via) return via.label;
  }
  const signup = pick(meta, 'subscriberSources', event.source);
  if (signup) return signup.label;
  return pick(meta, 'unsubscribeSources', event.source)?.label ?? humanize(event.source);
}

/** "Website footer · Policy 2026-04" under a timeline entry. */
export function consentEventDetail(meta: EmailMeta | undefined, event: ConsentEvent): string {
  return [consentSourceLabel(meta, event), event.policyVersion ? `Policy ${event.policyVersion}` : null].filter(Boolean).join(' · ');
}

/**
 * The leaving line of a subscriber row: "Unsubscribed via the unsubscribe page
 * · Too many emails". Null for active, bounced and complained rows (their
 * badge says it all).
 */
export function leftLine(meta: EmailMeta | undefined, s: Pick<Subscriber, 'status' | 'reason' | 'unsubscribeSource'>): string | null {
  if (s.status !== 'unsubscribed') return null;
  const how = s.unsubscribeSource ? `${subscriberStatusBadge(meta, 'unsubscribed').label} ${unsubscribeSourceLabel(meta, s.unsubscribeSource)}` : null;
  const why = s.reason ? reasonLabel(meta, s.reason) : null;
  const line = [how, why].filter(Boolean).join(' · ');
  return line || null;
}

/* ---------- campaign key ---------- */

export const CAMPAIGN_KEY_MAX = 64;
const CAMPAIGN_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** While typing: lowercased and dashed live ("Newsletter 2026 07" -> "newsletter-2026-07"). */
export function campaignKeyLive(input: string): string {
  return slugifyLive(input).slice(0, CAMPAIGN_KEY_MAX);
}

/** The key to send: no trailing dash. */
export function finalCampaignKey(input: string): string {
  return finalizeSlug(input).slice(0, CAMPAIGN_KEY_MAX);
}

export function isValidCampaignKey(key: string): boolean {
  return key.length > 0 && key.length <= CAMPAIGN_KEY_MAX && CAMPAIGN_KEY.test(key);
}

/* ---------- new campaign form ---------- */

export type CampaignForm = { key: string; name: string; subject: string; template: string; note: string };

export const EMPTY_CAMPAIGN_FORM: CampaignForm = { key: '', name: '', subject: '', template: '', note: '' };

/** Inline checks before sending (the server checks again with the same words). */
export function campaignFormErrors(form: CampaignForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isValidCampaignKey(finalCampaignKey(form.key))) errors.key = EMAIL_COPY.keyInvalid;
  if (!form.name.trim()) errors.name = EMAIL_COPY.nameRequired;
  return errors;
}

const orNull = (value: string) => {
  const t = value.trim();
  return t ? t : null;
};

/** POST /email/campaigns body. */
export function campaignBody(form: CampaignForm) {
  return {
    key: finalCampaignKey(form.key),
    name: form.name.trim(),
    subject: orNull(form.subject),
    template: orNull(form.template),
    description: orNull(form.note),
  };
}

/** Up to `max` templates whose key or name contains what was typed (all of them when empty). */
export function templateSuggestions(templates: readonly EmailTemplate[] | undefined, typed: string, max = 6): EmailTemplate[] {
  if (!templates) return [];
  const needle = typed.trim().toLowerCase();
  const hits = needle ? templates.filter((t) => t.key.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle)) : templates;
  return hits.slice(0, max);
}

/**
 * Picking a template fills the template field, and also the key, name and
 * subject while they are still empty (a template's key is its campaign key).
 * Nothing already typed is overwritten.
 */
export function applyTemplatePick(form: CampaignForm, template: EmailTemplate): CampaignForm {
  return {
    ...form,
    template: template.key,
    key: form.key.trim() ? form.key : campaignKeyLive(template.key),
    name: form.name.trim() ? form.name : template.name,
    subject: form.subject.trim() ? form.subject : template.subject,
  };
}

/* ---------- campaigns and engagement ---------- */

/** Newest first, the returned campaign replacing any copy of itself. */
export function withCampaign(list: readonly Campaign[], campaign: Campaign): Campaign[] {
  const index = list.findIndex((c) => c.id === campaign.id);
  if (index < 0) return [campaign, ...list];
  const next = list.slice();
  next[index] = campaign;
  return next;
}

/** "https://www.tekmadev.com/start?x=1" -> "tekmadev.com/start?x=1". */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
}

/** "Mobile · Canada" (either may be missing). */
export function eventWhere(event: Pick<EngagementEvent, 'device' | 'country'>): string {
  return [event.device ? humanize(event.device) : null, event.country].filter(Boolean).join(' · ');
}

/** The campaign's name when it is still registered, else its key (deleted campaigns keep their events). */
export function campaignTitle(campaigns: readonly Campaign[] | undefined, key: string): string {
  return campaigns?.find((c) => c.key === key)?.name ?? key;
}

/* ---------- template preview ---------- */

/** The only page the preview WebView may load: the HTML string itself. */
export function isPreviewDocument(url: string): boolean {
  return url === 'about:blank';
}

/**
 * Where a tapped link in the preview should open. Template links go through
 * the click tracker (`/api/email/click?c=<key>&u=<destination>`); the preview
 * opens the destination itself, so previewing never counts a click. Only
 * http(s) and mailto destinations open; anything else gives null.
 */
export function previewLinkTarget(url: string): string | null {
  let target = url.trim();
  const tracked = /^https?:\/\/[^/?#]+\/api\/email\/click\?/i.test(target) ? /[?&]u=([^&#]+)/.exec(target) : null;
  if (tracked) {
    try {
      target = decodeURIComponent(tracked[1].replace(/\+/g, ' '));
    } catch {
      return null;
    }
  }
  return /^(https?:\/\/|mailto:)/i.test(target) ? target : null;
}

/* ---------- lists ---------- */

/** Rows from every loaded page, each id once (a signup between pages can shift the cursor). */
export function uniqueById<T extends { id: string }>(pages: readonly { items: readonly T[] }[] | undefined): T[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
