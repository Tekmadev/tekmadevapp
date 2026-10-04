import { addDays, todayToronto, torontoDateOf } from '@/lib/dates';
import { formatCents } from '@/lib/money';

import type { AttentionClients, Overview, OverviewMeta, TopLink } from '../../schemas/overview';
import type { SearchResult, SearchResultType } from '../../schemas/session';
import type { Role } from '../../types';
import { analyticsFor } from './analytics';
import { activeSubscriptionCount, recentSubscriptions } from './billing';
import { findCategory, livePosts, metaFixture as blogMeta } from './blog';
import {
  clientsAttention,
  clientView,
  guaranteeFor,
  latestIntake,
  metaFixture as clientsMeta,
  rowFor,
  visibleClients,
} from './clients';
import { couponsState, metaFixture as couponsMeta } from './coupons';
import { subscribers, metaFixture as emailMeta } from './email';
import { leadCounts, leadsDb, metaFixture as leadsMeta, recentLeads } from './leads';
import { linkClicks, links } from './links';
import { notificationSummaryFor } from './notifications';

/**
 * The cross-domain read models: GET /overview (Home) and GET /search. Nothing is
 * stored here. Every value is computed on each call from the other domains' live
 * fixture state, so Home's numbers always match the lists they open, and a
 * mutation anywhere (a call reviewed, a link deleted, a post created) shows up on
 * the next read.
 */

/** Home rows: "Recent leads" and "Recent subscriptions" show 8 each. */
export const RECENT_ROWS = 8;
/** "Top tracking links (30d)" shows at most 10 bars. */
export const TOP_LINKS_MAX = 10;
/** GET /search answers at most this many results. */
export const SEARCH_MAX = 20;
/** Longer queries are cut here (nobody types more; it keeps the scoring cheap). */
const QUERY_MAX = 100;

/* ---------- GET /overview ---------- */

const clientUrl = (id: string, section: string) => `/admin/clients/${encodeURIComponent(id)}#${section}`;

/**
 * The clients behind each client card of "Needs you", with the same rules as the
 * clients domain uses for its stats (real clients only), most urgent first.
 */
export function attentionClientsNow(): AttentionClients {
  const real = visibleClients(false);
  const out: AttentionClients = { blockedOnboardings: [], callsToReview: [], intakesToReview: [], behindPace: [] };
  for (const c of real) {
    const row = rowFor(c);
    const g = guaranteeFor(c);
    if (row.blocked && row.status !== 'churned') {
      out.blockedOnboardings.push({
        clientId: c.id,
        businessName: c.businessName,
        url: clientUrl(c.id, 'onboarding'),
        stage: row.stage,
        blockedReason: row.blockedReason,
      });
    }
    if (g.needsReview > 0) {
      out.callsToReview.push({ clientId: c.id, businessName: c.businessName, url: clientUrl(c.id, 'calls'), count: g.needsReview });
    }
    const intake = latestIntake(c.id);
    if (intake?.status === 'submitted') {
      out.intakesToReview.push({
        clientId: c.id,
        businessName: c.businessName,
        url: clientUrl(c.id, 'intake'),
        version: intake.version,
        submittedAt: intake.submittedAt,
      });
    }
    if (row.status === 'live' && row.guarantee.status === 'behind' && row.guarantee.daysLeft > 0) {
      out.behindPace.push({
        clientId: c.id,
        businessName: c.businessName,
        url: clientUrl(c.id, 'calls'),
        counted: g.counted,
        target: g.target,
        expectedByNow: g.expectedByNow,
        daysLeft: g.daysLeft,
      });
    }
  }
  const byName = (a: { businessName: string }, b: { businessName: string }) => a.businessName.localeCompare(b.businessName);
  out.blockedOnboardings.sort(byName);
  // Most appointments waiting first.
  out.callsToReview.sort((a, b) => b.count - a.count || byName(a, b));
  // Waiting longest first.
  out.intakesToReview.sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '') || byName(a, b));
  // Furthest behind first, then the least time left.
  out.behindPace.sort((a, b) => b.expectedByNow - b.counted - (a.expectedByNow - a.counted) || a.daysLeft - b.daysLeft || byName(a, b));
  return out;
}

/**
 * Visits per short link over the same window as the 30 day traffic block (today
 * and the 29 Toronto days before). Deleted links are left out: their clicks stay
 * on record, but there is nothing to open.
 */
export function topLinksNow(nowMs: number = Date.now()): TopLink[] {
  const since = addDays(todayToronto(new Date(nowMs)), -29);
  const counts = new Map<string, number>();
  for (const click of linkClicks) {
    if (torontoDateOf(click.at) < since) continue;
    counts.set(click.linkId, (counts.get(click.linkId) ?? 0) + 1);
  }
  return links
    .map((l) => ({ id: l.id, slug: l.slug, label: l.label, count: counts.get(l.id) ?? 0 }))
    .filter((l) => l.count > 0)
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
    .slice(0, TOP_LINKS_MAX);
}

/** GET /overview with the caller's own inbox block; routes/overview.ts trims what their capabilities leave out. */
export function overviewFor(user: { id: string; role: Role }): Overview {
  const leads = leadCounts();
  const traffic = analyticsFor('30d');
  const inbox = notificationSummaryFor(user.id, user.role);
  const clients = clientsAttention();
  return {
    kpis: {
      totalLeads: leads.total,
      bookedCalls: leads.booked,
      activeSubs: activeSubscriptionCount(),
      pageviews30d: traffic.total,
    },
    attention: {
      needsAction: inbox.needsAction,
      blockedOnboardings: clients.blockedOnboardings,
      callsToReview: clients.callsToReview,
      intakesToReview: clients.intakesToReview,
      behindPace: clients.behindPace,
    },
    attentionClients: attentionClientsNow(),
    traffic: { series: traffic.series, topSources: traffic.topSources, topPages: traffic.topPages.slice(0, 10) },
    // Everything, as an owner sees it: routes/overview.ts trims revenue and links per caller.
    topLinks: topLinksNow(),
    recentLeads: recentLeads(RECENT_ROWS),
    recentSubscriptions: recentSubscriptions(RECENT_ROWS),
    inbox,
  };
}

/* ---------- GET /search ---------- */

/**
 * Text folded for matching: lowercase, accents and apostrophes dropped, every
 * other run of punctuation a single space. "Let's Talk" reads "lets talk",
 * "dan@acmeplumbing.test" reads "dan acmeplumbing test", "hamilton-home-show"
 * reads "hamilton home show".
 */
export function foldSearchText(input: string): string {
  let s = input;
  try {
    s = s.normalize('NFD');
  } catch {
    // An engine without normalize: matching still works for unaccented text.
  }
  return s
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const digitsOf = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

type Candidate = SearchResult & {
  /** What the row is called (name, title, code, slug). */
  primary: (string | null | undefined)[];
  /** Other things people search by (emails, business, slug, label). */
  secondary: (string | null | undefined)[];
  phones?: (string | null | undefined)[];
  /** Newer first when two results score the same. */
  recency: string;
};

/** Below this length a query only matches at the start of a word ("ai" finds "Aisha", not "Detailing"). */
const MIN_INSIDE_WORD = 3;

/** How well one field matches: exact, starts with, a word starts with, contains. */
function fieldScore(field: string, q: string): number {
  if (!field) return 0;
  if (field === q) return 100;
  if (field.startsWith(q)) return 80;
  if (` ${field}`.includes(` ${q}`)) return 60;
  if (q.length >= MIN_INSIDE_WORD && field.includes(q)) return 30;
  return 0;
}

function scoreOf(c: Candidate, q: string, tokens: string[], qDigits: string): number {
  const primary = c.primary.map((f) => foldSearchText(f ?? ''));
  const secondary = c.secondary.map((f) => foldSearchText(f ?? ''));
  let best = 0;
  for (const f of primary) best = Math.max(best, fieldScore(f, q));
  for (const f of secondary) {
    const s = fieldScore(f, q);
    // An exact email or code is as good as an exact name; anything weaker counts a bit less.
    best = Math.max(best, s === 100 ? 100 : s * 0.75);
  }
  if (best === 0 && tokens.length > 1) {
    // "acme dan": every word appears somewhere on the row, in any order.
    const all = ` ${[...primary, ...secondary].join(' ')}`;
    if (tokens.every((t) => all.includes(` ${t}`))) best = 20;
    else if (tokens.every((t) => t.length >= MIN_INSIDE_WORD && all.includes(t))) best = 10;
  }
  if (best < 50 && qDigits.length >= 4 && c.phones?.some((p) => digitsOf(p).includes(qDigits))) best = 50;
  return best;
}

const TYPE_ORDER: Record<SearchResultType, number> = { client: 0, lead: 1, subscriber: 2, post: 3, coupon: 4, link: 5 };

const labelOf = (options: readonly { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? value;
const joinParts = (parts: (string | null | undefined | false)[]) => parts.filter((p): p is string => !!p).join(' · ');

function clientCandidates(includeTest: boolean): Candidate[] {
  // People who may see test data find test clients too (marked "Test"); nobody else ever does.
  return visibleClients(includeTest).map((record) => {
    const c = clientView(record);
    return {
      type: 'client',
      id: c.id,
      title: c.businessName,
      subtitle: joinParts([c.isTest && 'Test', labelOf(clientsMeta.clientStatuses, c.status), c.planName ?? 'No plan', c.primaryEmail]),
      url: `/admin/clients/${encodeURIComponent(c.id)}`,
      primary: [c.businessName],
      secondary: [c.primaryEmail, c.contactName, c.legalName, c.website?.replace(/^https?:\/\/(www\.)?/, '')],
      phones: [c.phone],
      recency: c.updatedAt,
    };
  });
}

function leadCandidates(): Candidate[] {
  return leadsDb.map((l) => ({
    type: 'lead',
    id: l.id,
    title: l.name ?? l.email,
    subtitle: joinParts([labelOf(leadsMeta.leadStatuses, l.status), labelOf(leadsMeta.leadSources, l.source), l.name ? l.email : l.business]),
    url: `/admin/leads/${encodeURIComponent(l.id)}`,
    primary: [l.name],
    secondary: [l.email, l.business],
    phones: [l.phone],
    recency: l.createdAt,
  }));
}

function subscriberCandidates(): Candidate[] {
  return subscribers.map((s) => ({
    type: 'subscriber',
    id: s.id,
    title: s.email,
    subtitle: joinParts([labelOf(emailMeta.subscriberStatuses, s.status), labelOf(emailMeta.subscriberSources, s.source)]),
    url: `/admin/email/subscribers/${encodeURIComponent(s.id)}`,
    primary: [s.email],
    secondary: [],
    recency: s.signedUpAt,
  }));
}

function postCandidates(): Candidate[] {
  return livePosts().map((p) => {
    const category = p.categoryId ? findCategory(p.categoryId)?.name ?? null : null;
    return {
      type: 'post',
      id: p.id,
      title: p.title,
      subtitle: joinParts([labelOf(blogMeta.blogStatuses, p.status), category ?? 'No category']),
      url: `/admin/blog/${encodeURIComponent(p.id)}`,
      primary: [p.title],
      secondary: [p.slug, p.targetQuery, category],
      recency: p.updatedAt,
    };
  });
}

function couponCandidates(): Candidate[] {
  return couponsState.coupons.map((c) => {
    const off = c.discount.type === 'percent' ? `${c.discount.percent}% off` : `${formatCents(c.discount.amount, c.discount.currency)} off`;
    return {
      type: 'coupon',
      id: c.id,
      title: c.code,
      subtitle: joinParts([off, c.appliesTo.label, labelOf(couponsMeta.couponStatuses, c.status), c.label]),
      // Coupons have no detail screen: the list is the destination.
      url: '/admin/coupons',
      primary: [c.code],
      secondary: [c.label],
      recency: c.createdAt,
    };
  });
}

function linkCandidates(): Candidate[] {
  return links.map((l) => ({
    type: 'link',
    id: l.id,
    title: `tekmadev.com/${l.slug}`,
    subtitle: joinParts([l.label, l.destination, !l.active && 'Disabled']),
    url: `/admin/links/${encodeURIComponent(l.id)}`,
    primary: [l.slug, l.label],
    secondary: [l.destination, l.utmCampaign, l.utmSource],
    recency: l.createdAt,
  }));
}

/**
 * What one caller may find: the result types they may open (each needs its
 * `*.view` capability, decided by routes/session.ts) and whether test clients
 * are included (`testdata.view`).
 */
export type SearchScope = { types: ReadonlySet<SearchResultType>; includeTest: boolean };

/**
 * GET /search: clients, leads, subscribers, posts, coupons and links, only the
 * types in the caller's scope (never test clients without `includeTest`),
 * best matches first, at most 20. The scope applies before the cut, so a
 * narrower role still gets its own best 20. An empty query answers nothing.
 */
export function searchFixtures(rawQuery: string, scope: SearchScope): SearchResult[] {
  const q = foldSearchText(rawQuery.slice(0, QUERY_MAX));
  if (!q) return [];
  const tokens = q.split(' ');
  // Only a query that looks like a phone number is matched against phone digits.
  const qDigits = /^[\d\s()+.-]+$/.test(rawQuery.trim()) ? digitsOf(rawQuery) : '';

  const sources: Record<SearchResultType, () => Candidate[]> = {
    client: () => clientCandidates(scope.includeTest),
    lead: leadCandidates,
    subscriber: subscriberCandidates,
    post: postCandidates,
    coupon: couponCandidates,
    link: linkCandidates,
  };
  const pool: Candidate[] = (Object.keys(sources) as SearchResultType[]).filter((t) => scope.types.has(t)).flatMap((t) => sources[t]());

  return pool
    .map((c) => ({ c, score: scoreOf(c, q, tokens, qDigits) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        TYPE_ORDER[a.c.type] - TYPE_ORDER[b.c.type] ||
        b.c.recency.localeCompare(a.c.recency) ||
        a.c.title.localeCompare(b.c.title),
    )
    .slice(0, SEARCH_MAX)
    .map(({ c }) => ({ type: c.type, id: c.id, title: c.title, subtitle: c.subtitle, url: c.url }));
}

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture: OverviewMeta = {};
