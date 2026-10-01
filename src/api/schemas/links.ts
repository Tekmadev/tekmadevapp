import { z } from 'zod';

import { zInstant, zPage, zTone } from '../types';

/**
 * Schemas for the "links" domain (contract section 11, Marketing > Links; brief 8.11).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * Branded short links on the root domain (QR codes, bios, business cards).
 * Links cannot be edited after creation (server rule): only `active` changes.
 */

export const zShortLink = z.object({
  id: z.string(),
  /** Lowercase letters, digits and dashes. */
  slug: z.string(),
  /** A site path like "/start" or a full https:// URL. */
  destination: z.string(),
  /** Always https://www.tekmadev.com/<slug> (also what the QR code encodes). */
  shareUrl: z.string(),
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  /** Internal label, never shown to visitors. */
  label: z.string().nullable(),
  /** Disabled links answer 404 at once. */
  active: z.boolean(),
  /** Visits since the link was created. */
  clicks: z.number().int(),
  createdAt: zInstant,
});
export type ShortLink = z.infer<typeof zShortLink>;

/** GET /links: every link, newest first. */
export const zShortLinks = z.array(zShortLink);

/** Body of POST /links. Destination defaults to "/" (the home page) when omitted. */
export type LinkCreate = {
  slug: string;
  destination?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  label?: string | null;
};

export const zLinkClick = z.object({
  id: z.string(),
  at: zInstant,
  linkId: z.string(),
  /** The slug at the time of the click (kept after the link is deleted). */
  slug: z.string(),
  /** "mobile", "desktop" or "tablet". */
  device: z.string().nullable(),
  /** Country name, e.g. "Canada". */
  country: z.string().nullable(),
  /** Referring site host, e.g. "instagram.com". Null for direct visits and QR scans. */
  referrer: z.string().nullable(),
});
export type LinkClick = z.infer<typeof zLinkClick>;

export const zLinkClickPage = zPage(zLinkClick);
export type LinkClickPage = z.infer<typeof zLinkClickPage>;

/* ------------------------------------------------------------------ */
/* GET /meta fragment                                                  */
/* ------------------------------------------------------------------ */

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  /** Slugs taken by real top-level pages of the site: rejected inline in the New link form. */
  linkReservedSlugs: z.array(z.string()),
  utmSuggestions: z.object({
    sources: z.array(z.string()),
    mediums: z.array(z.string()),
  }),
  /** Active gold, disabled muted. */
  linkStatuses: z.array(z.object({ value: z.enum(['active', 'disabled']), label: z.string(), tone: zTone })),
});
export type LinksMeta = z.infer<typeof metaFragment>;
