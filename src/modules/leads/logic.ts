import type { Lead, LeadNeed, LeadRevenue, LeadSource, LeadStatus, LeadsMeta } from '@/api/schemas/leads';
import type { Capability } from '@/auth/capabilities';
import { formatFieldDateTime } from '@/components/form/dateTime';
import { contactUrl } from '@/components/parts/logic';
import type { Tone } from '@/design/tokens';
import { daysBetween, relativeTime, toDate, todayToronto, torontoDateOf } from '@/lib/dates';
import { countLabel, formatPhone } from '@/lib/format';

/**
 * Pure helpers for the Leads list and the lead detail (brief 8.6): labels (GET
 * /meta first, the brief's tables as the fallback before meta has loaded), the
 * filters and Home's quick filter, row text, and the contact actions. No React
 * Native here, so it is unit tested.
 */

/* ---------- labels (meta first, the brief's words second) ---------- */

export type ToneLabel = { label: string; tone: Tone };
type Option<V extends string> = { value: V; label: string };

/** Brief 8.6, exact; "Outreach" is a lead added by hand in the app (outreach.md). */
export const SOURCE_LABELS: Record<LeadSource, string> = {
  cal_booking: 'Booked call',
  grow: 'Lead form',
  lead_magnet: 'Free tool',
  portal_signup: 'Portal sign-up',
  outreach: 'Outreach',
};

/** Brief 8.6, exact. */
export const NEED_LABELS: Record<LeadNeed, string> = {
  customers: 'More customers and booked jobs',
  website: 'A new or better website',
  custom: 'A custom build: AI, app or software',
  content: 'Content and motion graphics',
  unsure: 'Not sure yet, I want to talk it through',
};

/** Brief 8.6, exact. */
export const REVENUE_LABELS: Record<LeadRevenue, string> = {
  pre: 'Just starting, no revenue yet',
  under_10k: 'Under $10K a month',
  '10k_20k': '$10K to $20K a month',
  '20k_50k': '$20K to $50K a month',
  '50k_100k': '$50K to $100K a month',
  '100k_plus': '$100K+ a month',
};

/** Status badges: new gold, booked ok, everything else muted (brief 8.6). */
export const STATUS_BADGES: Record<LeadStatus, ToneLabel> = {
  new: { label: 'New', tone: 'gold' },
  booked: { label: 'Booked', tone: 'ok' },
  contacted: { label: 'Contacted', tone: 'muted' },
  qualified: { label: 'Qualified', tone: 'muted' },
  won: { label: 'Won', tone: 'muted' },
  lost: { label: 'Lost', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

const find = <V extends string>(list: readonly Option<V>[] | undefined, value: V) => list?.find((o) => o.value === value);

export function statusBadge(meta: LeadsMeta | undefined, status: LeadStatus): ToneLabel {
  const found = meta?.leadStatuses.find((s) => s.value === status);
  return found ? { label: found.label, tone: found.tone } : STATUS_BADGES[status];
}

export const sourceLabel = (meta: LeadsMeta | undefined, source: LeadSource) => find(meta?.leadSources, source)?.label ?? SOURCE_LABELS[source];
export const needLabel = (meta: LeadsMeta | undefined, need: LeadNeed) => find(meta?.leadNeeds, need)?.label ?? NEED_LABELS[need];
export const revenueLabel = (meta: LeadsMeta | undefined, revenue: LeadRevenue) =>
  find(meta?.leadRevenueBands, revenue)?.label ?? REVENUE_LABELS[revenue];

const fallbackOptions = <V extends string>(labels: Record<V, string>): Option<V>[] =>
  (Object.keys(labels) as V[]).map((value) => ({ value, label: labels[value] }));

/**
 * Filter choices in the server's order (meta), or the brief's order before meta
 * loads. A source the app knows but meta does not list yet (the server lists
 * "Outreach" only once this release ships) is added at the end, so leads added
 * by hand can always be filtered.
 */
export function sourceOptions(meta: LeadsMeta | undefined): Option<LeadSource>[] {
  if (!meta) return fallbackOptions(SOURCE_LABELS);
  const listed = new Set<LeadSource>(meta.leadSources.map((o) => o.value));
  const missing = fallbackOptions(SOURCE_LABELS).filter((o) => !listed.has(o.value));
  return [...meta.leadSources, ...missing];
}
export const needOptions = (meta: LeadsMeta | undefined): Option<LeadNeed>[] => meta?.leadNeeds ?? fallbackOptions(NEED_LABELS);
export const statusOptions = (meta: LeadsMeta | undefined): Option<LeadStatus>[] =>
  meta?.leadStatuses.map(({ value, label }) => ({ value, label })) ??
  (Object.keys(STATUS_BADGES) as LeadStatus[]).map((value) => ({ value, label: STATUS_BADGES[value].label }));

/* ---------- filters ---------- */

export type LeadFilters = {
  source: LeadSource | null;
  status: LeadStatus | null;
  need: LeadNeed | null;
  /** Server-side search (trimmed, debounced). */
  q: string;
  /** "Follow-ups due": only leads with a follow-up today or earlier (optional: off when left out). */
  followUpsDue?: boolean;
};

export const NO_FILTERS: LeadFilters = { source: null, status: null, need: null, q: '', followUpsDue: false };

export const hasFilters = (f: LeadFilters) =>
  f.source !== null || f.status !== null || f.need !== null || f.q !== '' || f.followUpsDue === true;

/**
 * The "Lead forms" section sits on top while the source filter can include
 * lead forms. With source "Lead form" chosen the list itself is the lead forms,
 * and with another source it has none, so the section is hidden in both cases.
 * The follow-up queue is a different list (soonest follow-up first): no section.
 */
export const showsLeadForms = (source: LeadSource | null, followUpsDue = false) => source === null && !followUpsDue;

/* ---------- Home's quick filter ---------- */

/** `/customers?segment=leads&view=booked`: Home's "Booked calls" card. */
export const LEAD_VIEWS = ['booked'] as const;
export type LeadsView = (typeof LEAD_VIEWS)[number];

export type LeadsViewInfo = {
  status: LeadStatus;
  /** The removable chip above the rows. */
  label: string;
  /** What TalkBack says the list is showing. */
  spoken: string;
};

export const VIEW_INFO: Record<LeadsView, LeadsViewInfo> = {
  // The same rule as Home's count: status booked.
  booked: { status: 'booked', label: 'Booked calls', spoken: 'leads with a booked call' },
};

/** The route param as a known view, or null (unknown values are ignored, never an error). */
export function toLeadsView(value: unknown): LeadsView | null {
  return (LEAD_VIEWS as readonly unknown[]).includes(value) ? (value as LeadsView) : null;
}

/* ---------- list rows ---------- */

/** Rows of every loaded page, once each (a lead can shift pages between loads). */
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

/**
 * A lead's title: the name, else the email (free tools and portal sign-ups may
 * not ask for a name), else the business or the phone number (a lead added by
 * hand needs only a name or a business, and an email or a phone).
 */
export function leadTitle(lead: Pick<Lead, 'name' | 'email' | 'business' | 'phone'>): string {
  return lead.name?.trim() || lead.email.trim() || lead.business?.trim() || formatPhone(lead.phone) || 'Lead';
}

/** The row's second line: the business, else the email, else the phone number; never what the title already says. */
export function rowSubtitle(lead: Pick<Lead, 'name' | 'email' | 'business' | 'phone'>): string | undefined {
  const title = leadTitle(lead);
  const candidates = [lead.business?.trim(), lead.email.trim(), formatPhone(lead.phone)];
  return candidates.find((c) => !!c && c !== title) || undefined;
}

/** "Lead form · 3 h ago" */
export function rowMeta(lead: Pick<Lead, 'source' | 'createdAt'>, meta: LeadsMeta | undefined, now: Date): string {
  return [sourceLabel(meta, lead.source), relativeTime(lead.createdAt, now)].filter(Boolean).join(' · ');
}

/* ---------- detail ---------- */

/** Booked calls and lead forms ask for the need and the revenue band; free tools and portal sign-ups do not. */
const ASKS_QUALIFIERS: readonly LeadSource[] = ['cal_booking', 'grow'];

/** Show Need and Revenue rows: the form asked for them, or the server sent a value anyway. */
export const asksQualifiers = (lead: Pick<Lead, 'source' | 'need' | 'revenue'>) =>
  ASKS_QUALIFIERS.includes(lead.source) || lead.need !== null || lead.revenue !== null;

/** "Thu, Oct 8, 10:00 AM" in Toronto, whatever the phone's zone. */
export const formatWhen = (instant: string, now: Date) => formatFieldDateTime(instant, now);

/** Whether a booked call is still ahead. */
export function isUpcoming(instant: string, now: Date): boolean {
  const at = toDate(instant);
  return at !== null && at.getTime() > now.getTime();
}

/**
 * How far the booked call is, by Toronto calendar day: "in 25 min", "today",
 * "tomorrow", "in 3 days", "yesterday", "4 days ago". The date and time are
 * shown next to it, so this never repeats them.
 */
export function bookingDistance(instant: string, now: Date): string {
  const at = toDate(instant);
  if (!at) return '';
  const ahead = at.getTime() - now.getTime();
  if (ahead > 0 && ahead < 60 * 60_000) return `in ${Math.min(59, Math.max(1, Math.round(ahead / 60_000)))} min`;
  const days = daysBetween(todayToronto(now), torontoDateOf(at));
  if (days === 0) return ahead > 0 ? 'today' : 'earlier today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${countLabel(days, 'day', 'days')}` : `${countLabel(-days, 'day', 'days')} ago`;
}

/** The referrer as received; null means the first visit was direct (typed or bookmarked). */
export const referrerText = (referrer: string | null) => referrer?.trim() || 'Direct visit';

export type ContactLinks = { call: string | null; text: string | null; email: string | null };

/** tel:, sms: and mailto: links, or null when the lead has no usable phone or email. */
export function contactLinks(lead: Pick<Lead, 'phone' | 'email'>): ContactLinks {
  const tel = lead.phone ? contactUrl('phone', lead.phone) : null;
  return {
    call: tel,
    text: tel ? `sms:${tel.slice('tel:'.length)}` : null,
    email: contactUrl('email', lead.email),
  };
}

export type CopyTarget = { kind: 'email' | 'phone'; value: string; shown: string };

/** What Copy can put on the clipboard: the email, then the phone number. */
export function copyTargets(lead: Pick<Lead, 'phone' | 'email'>): CopyTarget[] {
  const out: CopyTarget[] = [];
  const email = lead.email.trim();
  if (email) out.push({ kind: 'email', value: email, shown: email });
  const phone = lead.phone?.trim();
  if (phone) out.push({ kind: 'phone', value: phone, shown: formatPhone(phone) });
  return out;
}

/**
 * The lead's main button (owner decision 2026-10-03 on roles): "Open client"
 * once it became a client (needs `clients.view`), else "Create client from
 * this lead", which opens New client and so needs `clients.create` as well as
 * `leads.convert` (staff hold only the second: no button). Null: no button.
 */
export function leadClientAction(convertedClientId: string | null, can: (cap: Capability) => boolean): 'open' | 'create' | null {
  if (convertedClientId) return can('clients.view') ? 'open' : null;
  return can('leads.convert') && can('clients.create') ? 'create' : null;
}

export type NewClientPrefill = { businessName?: string; email?: string; name?: string; phone?: string; leadId?: string };

/**
 * New client's route params from a lead (the fields New client reads). Empty
 * values are left out. `leadId` links the client to the lead, which copies the
 * lead's finder and booker to the client's credits (commission credit).
 */
export function newClientParams(lead: Pick<Lead, 'id' | 'business' | 'email' | 'name' | 'phone'>): NewClientPrefill {
  const out: NewClientPrefill = {};
  if (lead.id) out.leadId = lead.id;
  const set = (key: keyof NewClientPrefill, value: string | null) => {
    const v = value?.trim();
    if (v) out[key] = v;
  };
  set('businessName', lead.business);
  set('email', lead.email);
  set('name', lead.name);
  set('phone', lead.phone);
  return out;
}
