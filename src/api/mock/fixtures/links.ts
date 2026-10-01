import type { LinkClick, ShortLink } from '../../schemas/links';
import { daysAgo, minutesAgo, pick } from '../router';

/**
 * Fixtures for the "links" domain. Realistic data, same shapes as the live API.
 * Mutable in-memory state: the links routes change it. The click log never
 * shrinks: deleting a link keeps its clicks on record (the counter is gone and
 * the slug can be reused).
 */

export const SHARE_BASE = 'https://www.tekmadev.com';
export const shareUrlFor = (slug: string) => `${SHARE_BASE}/${slug}`;

export type LinkRecord = Omit<ShortLink, 'clicks' | 'shareUrl'>;

export const links: LinkRecord[] = [
  { id: 'lnk_insta0001', slug: 'insta', destination: '/start', utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'bio', label: 'Instagram bio', active: true, createdAt: daysAgo(120) },
  { id: 'lnk_card00001', slug: 'card', destination: '/start', utmSource: 'business_card', utmMedium: 'qr', utmCampaign: 'cards-2026', label: 'Business card QR', active: true, createdAt: daysAgo(98) },
  { id: 'lnk_linkedin1', slug: 'li', destination: '/growth-system', utmSource: 'linkedin', utmMedium: 'social', utmCampaign: 'profile', label: 'LinkedIn profile', active: true, createdAt: daysAgo(90) },
  { id: 'lnk_fbwebln01', slug: 'site', destination: '/webline', utmSource: 'facebook', utmMedium: 'social', utmCampaign: 'webline-fall-2026', label: 'Facebook post: Webline', active: true, createdAt: daysAgo(31) },
  { id: 'lnk_ythvac001', slug: 'hvac', destination: '/blog/ai-follow-up-for-hvac-companies', utmSource: 'youtube', utmMedium: 'social', utmCampaign: 'hvac-short', label: 'YouTube Short description', active: true, createdAt: daysAgo(18) },
  // Disabled: answers 404 at once.
  { id: 'lnk_homeshow1', slug: 'hamilton-home-show', destination: '/start', utmSource: 'business_card', utmMedium: 'offline', utmCampaign: 'home-show-2026', label: 'Hamilton home show flyer', active: false, createdAt: daysAgo(160) },
  // An external destination, no UTMs, no label.
  { id: 'lnk_youtube01', slug: 'youtube', destination: 'https://www.youtube.com/@tekmadev', utmSource: null, utmMedium: null, utmCampaign: null, label: null, active: true, createdAt: daysAgo(70) },
  // Brand new: no clicks yet.
  { id: 'lnk_emailsig1', slug: 'email-sig', destination: '/book', utmSource: 'email', utmMedium: 'email', utmCampaign: 'signature', label: 'Email signature', active: true, createdAt: daysAgo(1, 2) },
];

/** Ids of deleted links: their click history can still be read. */
export const deletedLinkIds = new Set<string>(['lnk_oldpromo1']);

/** Deterministic PRNG so fixtures are stable across reloads. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The full click log, newest first. */
export const linkClicks: LinkClick[] = (() => {
  const rand = seeded(9071);
  const plan: { id: string; slug: string; count: number; days: number; referrers: (string | null)[]; qr?: boolean }[] = [
    { id: 'lnk_insta0001', slug: 'insta', count: 64, days: 60, referrers: ['instagram.com', 'l.instagram.com', null] },
    { id: 'lnk_card00001', slug: 'card', count: 38, days: 60, referrers: [null], qr: true },
    { id: 'lnk_linkedin1', slug: 'li', count: 27, days: 60, referrers: ['linkedin.com', 'lnkd.in', null] },
    { id: 'lnk_fbwebln01', slug: 'site', count: 41, days: 30, referrers: ['l.facebook.com', 'm.facebook.com', 'facebook.com'] },
    { id: 'lnk_ythvac001', slug: 'hvac', count: 22, days: 17, referrers: ['youtube.com', 'm.youtube.com'] },
    { id: 'lnk_homeshow1', slug: 'hamilton-home-show', count: 9, days: 140, referrers: [null], qr: true },
    { id: 'lnk_youtube01', slug: 'youtube', count: 6, days: 60, referrers: ['tekmadev.com', null] },
    // Deleted link: its clicks stay on record.
    { id: 'lnk_oldpromo1', slug: 'spring-promo', count: 12, days: 200, referrers: ['l.facebook.com', null] },
  ];
  const out: LinkClick[] = [];
  let n = 0;
  for (const { id, slug, count, days, referrers, qr } of plan) {
    const created = links.find((l) => l.id === id)?.createdAt;
    for (let i = 0; i < count; i++) {
      n += 1;
      const roll = rand();
      let at = minutesAgo(Math.floor(rand() * days * 1440) + 5);
      // Never before the link existed.
      if (created && at < created) at = created;
      out.push({
        id: `clk_${n.toString(36).padStart(5, '0')}`,
        at,
        linkId: id,
        slug,
        device: qr || roll < 0.7 ? 'mobile' : roll < 0.95 ? 'desktop' : 'tablet',
        country: roll < 0.9 ? 'Canada' : roll < 0.97 ? 'United States' : null,
        referrer: pick(referrers, Math.floor(rand() * 12)),
      });
    }
  }
  out.push({ id: 'clk_live0001', at: minutesAgo(2), linkId: 'lnk_card00001', slug: 'card', device: 'mobile', country: 'Canada', referrer: null });
  return out.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
})();

export function toLink(record: LinkRecord): ShortLink {
  // Counted per link id: a recreated slug starts again from 0.
  const clicks = linkClicks.filter((c) => c.linkId === record.id).length;
  return { ...record, shareUrl: shareUrlFor(record.slug), clicks };
}

/** Top-level pages of the site. A short link can never shadow one of them. */
export const RESERVED_SLUGS = [
  'about', 'account', 'admin', 'api', 'assets', 'auth', 'blog', 'book', 'callback', 'careers', 'case-studies', 'checkout',
  'contact', 'cookies', 'dashboard', 'deal', 'deals', 'faq', 'favicon', 'feed', 'free-tools', 'growth-system', 'guarantee',
  'images', 'login', 'logout', 'portal', 'pricing', 'privacy', 'robots', 'rss', 'services', 'sign-in', 'sign-up', 'signup',
  'sitemap', 'start', 'static', 'success', 'terms', 'thank-you', 'tools', 'unsubscribe', 'webline', 'webline-care', 'www',
];

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture = {
  linkReservedSlugs: RESERVED_SLUGS,
  utmSuggestions: {
    sources: ['instagram', 'facebook', 'linkedin', 'business_card', 'google', 'youtube', 'email'],
    mediums: ['social', 'qr', 'email', 'cpc', 'organic', 'offline'],
  },
  linkStatuses: [
    { value: 'active' as const, label: 'Active', tone: 'gold' as const },
    { value: 'disabled' as const, label: 'Disabled', tone: 'muted' as const },
  ],
};
