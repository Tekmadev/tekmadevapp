import { can, capabilitiesOf, CAPABILITIES, ROLES, type Capability, type CapabilityHolder } from '@/auth/capabilities';

/**
 * Web admin path (an `action_url`, always starting with /admin) to app route.
 *
 * The table is extensible: future automation modules add rules with
 * `registerDeepLinks()`. Anything unknown falls back to the Inbox and never
 * throws. Each destination names the capability it needs; someone without it
 * lands in the Inbox, so nothing they may not open is ever opened for them.
 */

export type AppLink = {
  pathname: string;
  params?: Record<string, string>;
};

export type DeepLinkRule = {
  /** Path pattern below /admin, e.g. "/clients/:id". "" is /admin itself. */
  pattern: string;
  /** Only people who hold this capability get the route; anyone else lands in the Inbox. None: everyone. */
  capability?: Capability;
  /** `allowed` tells whether the viewer holds a capability (to drop a part they may not see, such as a section). */
  to: (params: Record<string, string>, hash: string | null, search: URLSearchParams, allowed: (cap: Capability) => boolean) => AppLink;
};

/**
 * Who follows the link: their GET /me profile or capability list (a bare role
 * still works and uses the role's fallback row). null: not known yet (signed
 * out, or the profile has not loaded), which opens only what every role may.
 */
export type LinkViewer = CapabilityHolder;

/** What every role may open: used while nobody is known. */
const EVERY_ROLE: readonly Capability[] = CAPABILITIES.filter((c) => ROLES.every((r) => can(r, c)));

export const INBOX: AppLink = { pathname: '/inbox' };

export const CLIENT_SECTIONS = [
  'onboarding',
  'intake',
  'access',
  'files',
  'approvals',
  'agreements',
  'calls',
  'crm',
  'team',
  'account',
  'activity',
] as const;
export type ClientSection = (typeof CLIENT_SECTIONS)[number];

/** Client sections only some people see (the rest are visible to anyone who may open the client). */
const SECTION_CAPABILITY: Partial<Record<ClientSection, Capability>> = { crm: 'clients.crm' };

/** Mirrors zAnalyticsRange in src/api/schemas/analytics.ts (kept local so this file stays dependency free). */
const ANALYTICS_RANGE_VALUES: readonly string[] = ['24h', '7d', '30d', '3m', '6m', '1y', 'all'];

const tab = (pathname: string, segment?: string): AppLink => (segment ? { pathname, params: { segment } } : { pathname });

const CORE_RULES: DeepLinkRule[] = [
  { pattern: '', capability: 'overview.view', to: () => ({ pathname: '/' }) },
  {
    pattern: '/notifications',
    capability: 'notifications.view',
    to: (_p, _h, search) => {
      const filter = search.get('filter');
      return filter === 'action' || filter === 'unread' || filter === 'all' ? { ...INBOX, params: { filter } } : INBOX;
    },
  },
  { pattern: '/leads', capability: 'leads.view', to: () => tab('/customers', 'leads') },
  { pattern: '/leads/:id', capability: 'leads.view', to: ({ id }) => ({ pathname: '/leads/[id]', params: { id } }) },
  { pattern: '/tools', capability: 'tools.view', to: () => tab('/customers', 'tools') },
  { pattern: '/tools/:id', capability: 'tools.view', to: ({ id }) => ({ pathname: '/tools/[id]', params: { id } }) },
  { pattern: '/subscriptions', capability: 'billing.view', to: () => tab('/customers', 'subscriptions') },
  { pattern: '/clients', capability: 'clients.view', to: () => tab('/customers', 'clients') },
  { pattern: '/clients/new', capability: 'clients.create', to: () => ({ pathname: '/clients/new' }) },
  // Before /clients/:id, or "templates" would open as a client id.
  { pattern: '/clients/templates', capability: 'clients.templates', to: () => ({ pathname: '/clients/templates' }) },
  {
    pattern: '/clients/:id',
    capability: 'clients.view',
    to: ({ id }, hash, _search, allowed) => {
      const params: Record<string, string> = { id };
      const section = hash && (CLIENT_SECTIONS as readonly string[]).includes(hash) ? (hash as ClientSection) : null;
      const needs = section ? SECTION_CAPABILITY[section] : undefined;
      // A section this person cannot see opens the client at the top.
      if (section && (!needs || allowed(needs))) params.section = section;
      return { pathname: '/clients/[id]', params };
    },
  },
  {
    pattern: '/analytics',
    capability: 'analytics.view',
    to: (_p, _h, search) => {
      const range = search.get('range');
      return range && ANALYTICS_RANGE_VALUES.includes(range) ? { pathname: '/analytics', params: { range } } : { pathname: '/analytics' };
    },
  },
  { pattern: '/ads', capability: 'ads.view', to: () => ({ pathname: '/ads' }) },
  { pattern: '/email', capability: 'email.view', to: () => tab('/marketing', 'email') },
  { pattern: '/email/templates', capability: 'email.view', to: () => ({ pathname: '/email/templates' }) },
  {
    pattern: '/email/subscribers/:id',
    capability: 'email.subscribers.view',
    to: ({ id }) => ({ pathname: '/email/subscriber/[id]', params: { id } }),
  },
  { pattern: '/crm', capability: 'crm.view', to: () => tab('/marketing', 'crm') },
  { pattern: '/blog', capability: 'blog.view', to: () => tab('/marketing', 'blog') },
  // Before /blog/:id: a new post needs blog.write, where reading one needs only blog.view.
  { pattern: '/blog/new', capability: 'blog.write', to: () => ({ pathname: '/blog/[id]', params: { id: 'new' } }) },
  { pattern: '/blog/:id', capability: 'blog.view', to: ({ id }) => ({ pathname: '/blog/[id]', params: { id } }) },
  // The web's preview page: the app's post screen shows the preview (read only without blog.write).
  { pattern: '/blog/:id/preview', capability: 'blog.view', to: ({ id }) => ({ pathname: '/blog/[id]', params: { id } }) },
  { pattern: '/links', capability: 'links.view', to: () => tab('/marketing', 'links') },
  { pattern: '/links/:id', capability: 'links.view', to: ({ id }) => ({ pathname: '/links/[id]', params: { id } }) },
  { pattern: '/pricing', capability: 'pricing.view', to: () => ({ pathname: '/pricing' }) },
  { pattern: '/coupons', capability: 'coupons.view', to: () => ({ pathname: '/coupons' }) },
  { pattern: '/loader', capability: 'loader.view', to: () => ({ pathname: '/loader' }) },
  { pattern: '/test-mode', capability: 'testmode.view', to: () => ({ pathname: '/test-mode' }) },
  { pattern: '/team', capability: 'team.view', to: () => ({ pathname: '/team' }) },
  { pattern: '/profile', to: () => ({ pathname: '/profile' }) },
];

const extraRules: DeepLinkRule[] = [];

/** Modules contribute their own web paths (checked before the core table). */
export function registerDeepLinks(rules: DeepLinkRule[]) {
  extraRules.push(...rules);
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) {
      try {
        params[a[i].slice(1)] = decodeURIComponent(b[i]);
      } catch {
        return null;
      }
    } else if (a[i] !== b[i]) return null;
  }
  return params;
}

/**
 * Split a URL or path into the part below /admin, the hash and the query.
 * Accepts "/admin/...", "https://www.tekmadev.com/admin/...", and
 * "tekmadev-admin://admin/..." (the scheme's host is "admin").
 */
export function parseAdminUrl(input: string): { path: string; hash: string | null; search: URLSearchParams } | null {
  if (typeof input !== 'string') return null;
  let rest = input.trim();
  if (!rest) return null;
  rest = rest.replace(/^tekmadev-admin:\/\//i, '/');
  rest = rest.replace(/^https?:\/\/(www\.)?tekmadev\.com/i, '');
  if (!rest.startsWith('/')) rest = `/${rest}`;

  let hash: string | null = null;
  const hashAt = rest.indexOf('#');
  if (hashAt >= 0) {
    hash = rest.slice(hashAt + 1) || null;
    rest = rest.slice(0, hashAt);
  }
  let query = '';
  const queryAt = rest.indexOf('?');
  if (queryAt >= 0) {
    query = rest.slice(queryAt + 1);
    rest = rest.slice(0, queryAt);
  }
  const trimmed = rest.replace(/\/+$/, '');
  if (trimmed !== '/admin' && !trimmed.startsWith('/admin/')) return null;
  return { path: trimmed.slice('/admin'.length), hash, search: new URLSearchParams(query) };
}

/**
 * Map a web admin URL to an app route for this viewer (their GET /me profile
 * or capability list). Unknown, malformed or not allowed: the Inbox.
 */
export function mapAdminUrl(input: string, viewer: LinkViewer): AppLink {
  try {
    const parsed = parseAdminUrl(input);
    if (!parsed) return INBOX;
    const held = viewer === null || viewer === undefined ? EVERY_ROLE : capabilitiesOf(viewer);
    const allowed = (cap: Capability) => can(held, cap);
    for (const rule of [...extraRules, ...CORE_RULES]) {
      const params = matchPattern(rule.pattern, parsed.path);
      if (!params) continue;
      if (rule.capability && !allowed(rule.capability)) return INBOX;
      return rule.to(params, parsed.hash, parsed.search, allowed);
    }
    return INBOX;
  } catch {
    return INBOX;
  }
}

/** Serialize an AppLink to a string href (for router.push / expo-router redirects). */
export function toHref(link: AppLink): string {
  let path = link.pathname;
  const params = { ...(link.params ?? {}) };
  path = path.replace(/\[(\w+)\]/g, (_, key: string) => {
    const value = params[key] ?? '';
    delete params[key];
    return encodeURIComponent(value);
  });
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return query ? `${path}?${query}` : path;
}
