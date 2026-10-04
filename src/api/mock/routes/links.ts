import { deletedLinkIds, linkClicks, links, RESERVED_SLUGS, toLink, type LinkRecord } from '../fixtures/links';
import { requireCap } from '../permissions';
import { bool, fail, mockId, notFound, nowIso, ok, paginate, str, type MockRoute } from '../router';

/**
 * Mock routes for the "links" domain (contract section 11, Marketing > Links).
 * `links.view` reads, `links.write` creates, switches and deletes (requireCap
 * in each handler, like the server). Links cannot be edited after creation: PATCH only switches
 * `active`. Deleting keeps the click history and frees the slug.
 * Rules the contract does not spell out are in docs/api-requests/links.md.
 */

const SLUG_MESSAGE = 'Enter a slug using letters, numbers and dashes.';
const RESERVED_MESSAGE = 'That slug is reserved by an existing page. Pick another.';
const DESTINATION_MESSAGE = 'Enter a valid destination: a path like /start or a full https:// URL.';
const DUPE_MESSAGE = 'A link with that slug already exists. Pick a different slug.';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 60;
/** A site path ("/start", "/blog/x?y=1"), never protocol-relative ("//evil.test"). */
const PATH = /^\/(?!\/)\S*$/;
/** A full https URL with a dotted host ("example.com" alone is rejected). */
const HTTPS_URL = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;

const linkMissing = () => notFound('That link');

const text = (value: unknown) => {
  const s = str(value)?.trim();
  return s ? s : null;
};

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/links',
    latency: 'normal',
    handler: ({ user }) => requireCap(user, 'links.view') ?? ok([...links].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toLink)),
  },
  {
    method: 'POST',
    path: '/links',
    latency: 'normal',
    handler: ({ body, user }) => {
      const denied = requireCap(user, 'links.write');
      if (denied) return denied;
      // The form lowercases and dashes live; the server lowercases, then validates.
      const slug = str(body.slug)?.trim().toLowerCase() ?? '';
      const rawDestination = body.destination;
      const destination = rawDestination === undefined || rawDestination === null || rawDestination === '' ? '/' : str(rawDestination)?.trim() ?? '';

      const fields: Record<string, string> = {};
      let code: 'slug' | 'reserved' | 'destination' | null = null;
      if (!SLUG.test(slug) || slug.length > SLUG_MAX) {
        fields.slug = SLUG_MESSAGE;
        code = 'slug';
      } else if (RESERVED_SLUGS.includes(slug)) {
        fields.slug = RESERVED_MESSAGE;
        code = 'reserved';
      }
      if (!PATH.test(destination) && !HTTPS_URL.test(destination)) {
        fields.destination = DESTINATION_MESSAGE;
        code = code ?? 'destination';
      }
      // The code and message name the first problem; `fields` carries every inline error.
      if (code) return fail(400, code, code === 'destination' ? DESTINATION_MESSAGE : (fields.slug ?? SLUG_MESSAGE), fields);

      if (links.some((l) => l.slug === slug)) return fail(409, 'dupe', DUPE_MESSAGE, { slug: DUPE_MESSAGE });

      const record: LinkRecord = {
        id: mockId('lnk'),
        slug,
        destination,
        utmSource: text(body.utmSource),
        utmMedium: text(body.utmMedium),
        utmCampaign: text(body.utmCampaign),
        label: text(body.label),
        active: true,
        createdAt: nowIso(),
      };
      links.push(record);
      return ok(toLink(record), 201);
    },
  },
  {
    method: 'PATCH',
    path: '/links/:id',
    latency: 'fast',
    handler: ({ params, body, user }) => {
      const denied = requireCap(user, 'links.write');
      if (denied) return denied;
      const record = links.find((l) => l.id === params.id);
      if (!record) return linkMissing();
      const active = bool(body.active);
      if (active === undefined) return fail(400, 'active', 'Send active as true or false.', { active: 'Send active as true or false.' });
      // Disabling makes the link answer 404 at once.
      record.active = active;
      return ok(toLink(record));
    },
  },
  {
    method: 'DELETE',
    path: '/links/:id',
    latency: 'normal',
    handler: ({ params, user }) => {
      const denied = requireCap(user, 'links.write');
      if (denied) return denied;
      const index = links.findIndex((l) => l.id === params.id);
      if (index < 0) return linkMissing();
      links.splice(index, 1);
      deletedLinkIds.add(params.id);
      return ok(null);
    },
  },
  {
    method: 'GET',
    path: '/links/clicks',
    latency: 'normal',
    handler: ({ query, user }) => {
      const denied = requireCap(user, 'links.view');
      if (denied) return denied;
      const linkId = query.linkId;
      if (linkId && !links.some((l) => l.id === linkId) && !deletedLinkIds.has(linkId)) return linkMissing();
      const rows = linkId ? linkClicks.filter((c) => c.linkId === linkId) : linkClicks;
      return ok(paginate(rows, query));
    },
  },
];
