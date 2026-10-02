import type { LinkClick, LinkClickPage, LinkCreate, LinksMeta, ShortLink } from '@/api/schemas/links';
import type { Tone } from '@/design/tokens';
import { countLabel } from '@/lib/format';
import { finalizeSlug, isBareDomain, isValidDestination } from '@/lib/text';

/**
 * Pure logic for Marketing > Links (brief 8.11): copy, New link validation,
 * the live destination preview, labels and cache updates. No React here, so
 * all of it is unit tested.
 */

export const SITE_ORIGIN = 'https://www.tekmadev.com';
/** The fixed prefix of the slug field and of every link card. */
export const SLUG_PREFIX = 'tekmadev.com/';
/** The server's limit (docs/api-requests/links.md). */
export const SLUG_MAX = 60;

/** The brief's strings, exact. */
export const LINK_COPY = {
  emptyLinks: 'No links yet. Create one above.',
  emptyClicks: 'No clicks yet. They appear here as soon as a link is visited.',
  slug: 'Enter a slug using letters, numbers and dashes.',
  reserved: 'That slug is reserved by an existing page. Pick another.',
  dupe: 'A link with that slug already exists. Pick a different slug.',
  destination: 'Enter a valid destination: a path like /start or a full https:// URL.',
  bareDomain: 'Add https:// for another website.',
  deleteMessage: 'Clicks stay on record, but the counter is gone and the slug can be reused.',
  noEdit: 'Links cannot be edited after creation. Check the slug and destination before you create it.',
  disableMessage: 'It returns 404 at once, for everyone who opens it or scans its QR code. You can enable it again later.',
  disabledNote: 'Disabled: this link returns 404 until you enable it.',
  notFound: 'That link no longer exists.',
} as const;

/** Brief 8.11 suggestions, used until GET /meta has loaded. */
export const FALLBACK_UTM_SOURCES = ['instagram', 'facebook', 'linkedin', 'business_card', 'google', 'youtube', 'email'] as const;
export const FALLBACK_UTM_MEDIUMS = ['social', 'qr', 'email', 'cpc', 'organic', 'offline'] as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "tekmadev.com/insta" */
export function shortLinkText(slug: string): string {
  return `${SLUG_PREFIX}${slug}`;
}

/** What the QR code encodes and what Copy and Share send: always https://www.tekmadev.com/<slug>. */
export function shareUrlOf(link: Pick<ShortLink, 'slug' | 'shareUrl'>): string {
  return link.shareUrl || `${SITE_ORIGIN}/${link.slug}`;
}

/* ---------- New link form ---------- */

export type NewLinkForm = {
  slug: string;
  destination: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  label: string;
};

export const EMPTY_FORM: NewLinkForm = { slug: '', destination: '', utmSource: '', utmMedium: '', utmCampaign: '', label: '' };

/**
 * The inline slug error while typing (the slug as it will be sent). Blank is
 * not an error until the form is sent. Reserved and taken slugs are caught
 * here; the server stays the judge.
 */
export function slugError(slug: string, reserved: readonly string[], existing: readonly string[]): string | null {
  const value = finalizeSlug(slug);
  if (!value) return null;
  if (!SLUG.test(value) || value.length > SLUG_MAX) return LINK_COPY.slug;
  if (reserved.some((r) => r.toLowerCase() === value)) return LINK_COPY.reserved;
  if (existing.includes(value)) return LINK_COPY.dupe;
  return null;
}

/**
 * The destination error. Blank means the home page. A bare domain is caught
 * while typing; anything else that is not a path or an https:// URL only once
 * the field is left or the form is sent (`complete`), so half-typed URLs stay quiet.
 */
export function destinationError(input: string, complete: boolean): string | null {
  const text = input.trim();
  if (!text) return null;
  if (isBareDomain(text)) return LINK_COPY.bareDomain;
  if (!complete) return null;
  return isValidDestination(text) ? null : LINK_COPY.destination;
}

/** Every error the form can know before sending, by API field name. */
export function validateNewLink(form: NewLinkForm, reserved: readonly string[], existing: readonly string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const slug = finalizeSlug(form.slug);
  const slugProblem = slug ? slugError(slug, reserved, existing) : LINK_COPY.slug;
  if (slugProblem) errors.slug = slugProblem;
  const destinationProblem = destinationError(form.destination, true);
  if (destinationProblem) errors.destination = destinationProblem;
  return errors;
}

const optional = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

/** The POST /links body. Blank optional fields are left out (a blank destination is the home page). */
export function toLinkCreate(form: NewLinkForm): LinkCreate {
  const body: LinkCreate = { slug: finalizeSlug(form.slug) };
  const destination = optional(form.destination);
  const utmSource = optional(form.utmSource);
  const utmMedium = optional(form.utmMedium);
  const utmCampaign = optional(form.utmCampaign);
  const label = optional(form.label);
  if (destination) body.destination = destination;
  if (utmSource) body.utmSource = utmSource;
  if (utmMedium) body.utmMedium = utmMedium;
  if (utmCampaign) body.utmCampaign = utmCampaign;
  if (label) body.label = label;
  return body;
}

export type Utm = { source?: string | null; medium?: string | null; campaign?: string | null };

/**
 * Where a visitor lands: the destination (a site path becomes a full
 * tekmadev.com URL; blank is the home page) with the UTM values appended to
 * its query, before the #fragment.
 */
export function finalDestinationUrl(destination: string, utm: Utm): string {
  const dest = destination.trim() || '/';
  const base = dest.startsWith('/') ? `${SITE_ORIGIN}${dest}` : dest;
  const hashAt = base.indexOf('#');
  const head = hashAt >= 0 ? base.slice(0, hashAt) : base;
  const hash = hashAt >= 0 ? base.slice(hashAt) : '';
  const pairs: [string, string][] = [];
  for (const [key, value] of [
    ['utm_source', utm.source],
    ['utm_medium', utm.medium],
    ['utm_campaign', utm.campaign],
  ] as const) {
    const v = value?.trim();
    if (v) pairs.push([key, v]);
  }
  if (pairs.length === 0) return base;
  const query = pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const joiner = !head.includes('?') ? '?' : head.endsWith('?') || head.endsWith('&') ? '' : '&';
  return `${head}${joiner}${query}${hash}`;
}

/** The final URL of a saved link. */
export function linkFinalUrl(link: Pick<ShortLink, 'destination' | 'utmSource' | 'utmMedium' | 'utmCampaign'>): string {
  return finalDestinationUrl(link.destination, { source: link.utmSource, medium: link.utmMedium, campaign: link.utmCampaign });
}

/** UTM suggestions from GET /meta, with the brief's lists as the fallback. */
export function utmSuggestions(meta: LinksMeta | undefined): { sources: readonly string[]; mediums: readonly string[] } {
  const sources = meta?.utmSuggestions.sources;
  const mediums = meta?.utmSuggestions.mediums;
  return {
    sources: sources && sources.length > 0 ? sources : FALLBACK_UTM_SOURCES,
    mediums: mediums && mediums.length > 0 ? mediums : FALLBACK_UTM_MEDIUMS,
  };
}

export function reservedSlugs(meta: LinksMeta | undefined): readonly string[] {
  return meta?.linkReservedSlugs ?? [];
}

/* ---------- labels ---------- */

/** Active gold, disabled muted (labels and tones from GET /meta when loaded). */
export function statusBadge(meta: LinksMeta | undefined, active: boolean): { label: string; tone: Tone } {
  const value = active ? 'active' : 'disabled';
  const found = meta?.linkStatuses.find((s) => s.value === value);
  if (found) return { label: found.label, tone: found.tone };
  return active ? { label: 'Active', tone: 'gold' } : { label: 'Disabled', tone: 'muted' };
}

export type UtmChip = { key: 'source' | 'medium' | 'campaign'; name: string; value: string };

/** The UTM values a link sets, in source, medium, campaign order. */
export function utmChips(link: Pick<ShortLink, 'utmSource' | 'utmMedium' | 'utmCampaign'>): UtmChip[] {
  const chips: UtmChip[] = [];
  if (link.utmSource) chips.push({ key: 'source', name: 'source', value: link.utmSource });
  if (link.utmMedium) chips.push({ key: 'medium', name: 'medium', value: link.utmMedium });
  if (link.utmCampaign) chips.push({ key: 'campaign', name: 'campaign', value: link.utmCampaign });
  return chips;
}

const DEVICES: Record<string, string> = { mobile: 'Mobile', desktop: 'Desktop', tablet: 'Tablet' };

export function deviceLabel(device: string | null): string {
  if (!device) return 'Unknown device';
  return DEVICES[device.toLowerCase()] ?? device.charAt(0).toUpperCase() + device.slice(1);
}

export function countryLabel(country: string | null): string {
  return country?.trim() || 'Unknown country';
}

/** No referrer means a direct visit or a QR scan (the server cannot tell them apart). */
export function referrerLabel(referrer: string | null): string {
  return referrer?.trim() || 'Direct or QR scan';
}

/** "Mobile · Canada" */
export function clickWhere(click: Pick<LinkClick, 'device' | 'country'>): string {
  return `${deviceLabel(click.device)} · ${countryLabel(click.country)}`;
}

/** "64 clicks", "1 click" */
export function clicksText(n: number): string {
  return countLabel(n, 'click', 'clicks');
}

/** What TalkBack reads for a link card. */
export function linkSpoken(link: ShortLink, statusLabel: string): string {
  const parts = [shortLinkText(link.slug), statusLabel, `goes to ${link.destination}`];
  for (const chip of utmChips(link)) parts.push(`UTM ${chip.name} ${chip.value}`);
  if (link.label) parts.push(link.label);
  parts.push(clicksText(link.clicks));
  return parts.join(', ');
}

/* ---------- cache ---------- */

/** Replace the link with the same id, or add it first (newest first, like GET /links). */
export function upsertLink(list: readonly ShortLink[] | undefined, link: ShortLink): ShortLink[] | undefined {
  if (!list) return list;
  const index = list.findIndex((l) => l.id === link.id);
  if (index < 0) return [link, ...list];
  const next = list.slice();
  next[index] = link;
  return next;
}

export function removeLink(list: readonly ShortLink[] | undefined, id: string): ShortLink[] | undefined {
  if (!list) return list;
  return list.filter((l) => l.id !== id);
}

/** Click pages flattened, without the duplicates a shifting cursor can bring. */
export function flattenClicks(pages: readonly LinkClickPage[] | undefined): LinkClick[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: LinkClick[] = [];
  for (const page of pages) {
    for (const click of page.items) {
      if (seen.has(click.id)) continue;
      seen.add(click.id);
      out.push(click);
    }
  }
  return out;
}
