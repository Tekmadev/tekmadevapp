import { queryOptions } from '@tanstack/react-query';
import type { Href } from 'expo-router';
import { BadgePercent, Building2, FileText, Link2, Mail, UserRound, type LucideIcon } from 'lucide-react-native';

import { search, sessionKeys } from '@/api/endpoints/session';
import type { SearchResultType } from '@/api/schemas/session';
import { mapAdminUrl, toHref, type LinkViewer } from '@/lib/deeplinks';

import { MORE_SECTIONS, moduleById, searchableScreens } from '../registry';
import type { ModuleGroup, ModuleManifest, Visibility } from '../types';

/* ---------- screens ---------- */

export type SearchScreen = {
  key: string;
  title: string;
  /** The screen's own keywords plus its module's title ("Blog categories" also matches "blog"). */
  keywords: readonly string[];
  /** Where it lives ("More · Sales"), or what it is when that would repeat the title. */
  subtitle: string;
  href: Href;
  icon: LucideIcon;
};

const AREA: Record<ModuleGroup, string> = {
  home: 'Home',
  inbox: 'Notifications',
  customers: 'Customers',
  analytics: 'Analytics',
  marketing: 'Marketing',
  more: 'More',
};

function screenSubtitle(m: ModuleManifest, title: string): string {
  const section = m.group === 'more' ? MORE_SECTIONS.find((s) => s.id === m.moreSection)?.title : undefined;
  const crumb = section ? `More · ${section}` : AREA[m.group];
  if (crumb.toLowerCase() !== title.toLowerCase()) return crumb;
  return m.summary ?? 'Tab';
}

/**
 * Screens this person can open, from the registry (already filtered by
 * capability and feature flags). Hidden modules (Kit, Assistant) never appear.
 */
export function searchScreensFor(v: Visibility): SearchScreen[] {
  const seen = new Set<string>();
  const out: SearchScreen[] = [];
  for (const entry of searchableScreens(v)) {
    const m = moduleById(entry.moduleId);
    if (!m || m.hidden) continue;
    const dedupe = entry.title.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      key: `${m.id}:${entry.title}`,
      title: entry.title,
      keywords: [...(entry.keywords ?? []), m.title],
      subtitle: screenSubtitle(m, entry.title),
      href: entry.href,
      icon: m.icon,
    });
  }
  return out;
}

/** Shown before anything is typed: the screens people most often jump to, if this person can see them. */
const SUGGESTED = ['Inbox', 'New client', 'Pricing', 'Coupons', 'Leads', 'App settings'] as const;
const SUGGESTED_MAX = 4;

export function suggestedScreens(screens: readonly SearchScreen[]): SearchScreen[] {
  const picked = SUGGESTED.map((title) => screens.find((s) => s.title === title)).filter(
    (s): s is SearchScreen => s !== undefined,
  );
  return (picked.length > 0 ? picked : screens).slice(0, SUGGESTED_MAX);
}

/* ---------- records ---------- */

export const RESULT_TYPES: Record<SearchResultType, { label: string; icon: LucideIcon }> = {
  client: { label: 'Client', icon: Building2 },
  lead: { label: 'Lead', icon: UserRound },
  subscriber: { label: 'Subscriber', icon: Mail },
  post: { label: 'Post', icon: FileText },
  coupon: { label: 'Coupon', icon: BadgePercent },
  link: { label: 'Link', icon: Link2 },
};

/**
 * GET /search for one query. Results are short-lived lookups: kept a few
 * minutes in memory for going back and forth, never persisted to disk.
 */
export function searchQuery(q: string) {
  return queryOptions({
    queryKey: sessionKeys.search(q),
    queryFn: ({ signal }) => search(q, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    meta: { persist: false },
  });
}

/**
 * A record's web admin path as an app route, for this viewer (their profile or
 * capability list). The mapper's table only produces routes that exist under
 * app/ (a deep link test checks every one), and sends anything unknown or not
 * allowed to the Inbox.
 */
export function adminHref(url: string, viewer: LinkViewer): Href {
  return toHref(mapAdminUrl(url, viewer)) as Href;
}
