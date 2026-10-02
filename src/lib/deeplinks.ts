import type { Role } from '@/api/types';

/**
 * Web admin path (an `action_url`, always starting with /admin) to app route.
 *
 * The table is extensible: future automation modules add rules with
 * `registerDeepLinks()`. Anything unknown falls back to the Inbox and never
 * throws. Owner-only destinations map to the Inbox for managers, so nothing
 * owner-only is ever opened for them.
 */

export type AppLink = {
  pathname: string;
  params?: Record<string, string>;
};

export type DeepLinkRule = {
  /** Path pattern below /admin, e.g. "/clients/:id". "" is /admin itself. */
  pattern: string;
  ownerOnly?: boolean;
  to: (params: Record<string, string>, hash: string | null, search: URLSearchParams) => AppLink;
};

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

const tab = (pathname: string, segment?: string): AppLink => (segment ? { pathname, params: { segment } } : { pathname });

const CORE_RULES: DeepLinkRule[] = [
  { pattern: '', to: () => ({ pathname: '/' }) },
  {
    pattern: '/notifications',
    to: (_p, _h, search) => {
      const filter = search.get('filter');
      return filter === 'action' || filter === 'unread' || filter === 'all' ? { ...INBOX, params: { filter } } : INBOX;
    },
  },
  { pattern: '/leads', to: () => tab('/customers', 'leads') },
  { pattern: '/leads/:id', to: ({ id }) => ({ pathname: '/leads/[id]', params: { id } }) },
  { pattern: '/tools', to: () => tab('/customers', 'tools') },
  { pattern: '/tools/:id', to: ({ id }) => ({ pathname: '/tools/[id]', params: { id } }) },
  { pattern: '/subscriptions', to: () => tab('/customers', 'subscriptions') },
  { pattern: '/clients', to: () => tab('/customers', 'clients') },
  { pattern: '/clients/new', to: () => ({ pathname: '/clients/new' }) },
  {
    pattern: '/clients/:id',
    to: ({ id }, hash) => {
      const params: Record<string, string> = { id };
      if (hash && (CLIENT_SECTIONS as readonly string[]).includes(hash)) params.section = hash;
      return { pathname: '/clients/[id]', params };
    },
  },
  { pattern: '/analytics', to: () => ({ pathname: '/analytics' }) },
  { pattern: '/ads', ownerOnly: true, to: () => ({ pathname: '/ads' }) },
  { pattern: '/email', ownerOnly: true, to: () => tab('/marketing', 'email') },
  { pattern: '/email/subscribers/:id', ownerOnly: true, to: ({ id }) => ({ pathname: '/email/subscriber/[id]', params: { id } }) },
  { pattern: '/crm', ownerOnly: true, to: () => tab('/marketing', 'crm') },
  { pattern: '/blog', ownerOnly: true, to: () => tab('/marketing', 'blog') },
  { pattern: '/blog/:id', ownerOnly: true, to: ({ id }) => ({ pathname: '/blog/[id]', params: { id } }) },
  { pattern: '/links', ownerOnly: true, to: () => tab('/marketing', 'links') },
  { pattern: '/links/:id', ownerOnly: true, to: ({ id }) => ({ pathname: '/links/[id]', params: { id } }) },
  { pattern: '/pricing', ownerOnly: true, to: () => ({ pathname: '/pricing' }) },
  { pattern: '/coupons', ownerOnly: true, to: () => ({ pathname: '/coupons' }) },
  { pattern: '/loader', ownerOnly: true, to: () => ({ pathname: '/loader' }) },
  { pattern: '/test-mode', ownerOnly: true, to: () => ({ pathname: '/test-mode' }) },
  { pattern: '/team', ownerOnly: true, to: () => ({ pathname: '/team' }) },
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

/** Map a web admin URL to an app route. Unknown, malformed or forbidden: the Inbox. */
export function mapAdminUrl(input: string, role: Role | null): AppLink {
  try {
    const parsed = parseAdminUrl(input);
    if (!parsed) return INBOX;
    for (const rule of [...extraRules, ...CORE_RULES]) {
      const params = matchPattern(rule.pattern, parsed.path);
      if (!params) continue;
      if (rule.ownerOnly && role !== 'owner') return INBOX;
      return rule.to(params, parsed.hash, parsed.search);
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
