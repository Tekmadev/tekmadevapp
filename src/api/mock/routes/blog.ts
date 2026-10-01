import { zPostStatus, CATEGORY_NAME_MAX, type Faq, type PostStatus } from '../../schemas/blog';
import {
  BLOG_AUTHORS,
  blogCategories,
  blogPosts,
  blogRevisions,
  findAuthor,
  findCategory,
  findLivePost,
  livePosts,
  toCategory,
  toPostDetail,
  toPostRow,
  type PostRecord,
} from '../fixtures/blog';
import { renderMarkdown, slugify } from '../markdown';
import { bool, fail, matches, mockId, notFound, nowIso, ok, paginate, str, type MockContext, type MockResult, type MockRoute } from '../router';

/**
 * Mock routes for the "blog" domain (contract section 11, Marketing > Blog).
 * Owner only. Saves slugify on the server, keep slugs unique across every post
 * (the trash included), record a revision, and return the full post.
 * Rules the contract does not spell out are written up in docs/api-requests/blog.md.
 */

const SLUG_TAKEN = 'That slug is already used by another post (including one in the trash).';
const CATEGORY_DUP = 'A category with that name already exists.';

const postMissing = () => notFound('That post');
const categoryMissing = () => notFound('That category');

/** Every post counts for uniqueness, trashed ones too. */
const slugOwner = (slug: string) => blogPosts.find((p) => p.slug === slug);

/** "my-post", then "my-post-2", "my-post-3"... for slugs the server generates itself. */
function uniqueSlug(base: string, selfId?: string): string {
  const root = base || 'post';
  let candidate = root;
  for (let n = 2; ; n++) {
    const owner = slugOwner(candidate);
    if (!owner || owner.id === selfId) return candidate;
    candidate = `${root}-${n}`;
  }
}

const isHttpsUrl = (value: string) => /^https:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i.test(value);

type Fields = Record<string, string>;

/** Optional text: string or null, trimmed, blank becomes null. Undefined means "not sent". */
function optionalText(body: Record<string, unknown>, key: string, fields: Fields): string | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== 'string') {
    fields[key] = 'Must be text.';
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** A list of short strings (keywords, tags, takeaways): trimmed, blanks dropped, duplicates removed. */
function stringList(body: Record<string, unknown>, key: string, fields: Fields): string[] | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    fields[key] = 'Must be a list of text.';
    return undefined;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value as string[]) {
    const item = raw.trim();
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push(item);
  }
  return out;
}

type Write = { patch: Partial<PostRecord>; slugRequest: string | null | undefined };

/**
 * Validates a create or partial update body. Returns the changes to apply, or
 * the 400 to send. Slug uniqueness is checked by the caller (it needs the title).
 */
function readWrite(body: Record<string, unknown>, creating: boolean): Write | MockResult {
  const fields: Fields = {};
  const patch: Partial<PostRecord> = {};

  if (creating || 'title' in body) {
    const title = str(body.title)?.trim();
    if (!title) return fail(400, 'title', 'Enter a title.', { title: 'Enter a title.' });
    patch.title = title;
  }

  let slugRequest: string | null | undefined;
  if ('slug' in body) {
    const slug = body.slug;
    if (slug !== null && typeof slug !== 'string') fields.slug = 'Must be text.';
    else slugRequest = slug === null ? null : slug;
  }

  if ('status' in body) {
    const status = zPostStatus.safeParse(body.status);
    if (!status.success) return fail(400, 'status', 'Pick a valid status.', { status: 'Pick a valid status.' });
    patch.status = status.data;
  }

  if ('authorId' in body) {
    const authorId = str(body.authorId);
    if (!authorId || !findAuthor(authorId)) return fail(400, 'author', 'That author no longer exists.', { authorId: 'That author no longer exists.' });
    patch.authorId = authorId;
  }

  if ('categoryId' in body) {
    const categoryId = body.categoryId;
    if (categoryId === null || categoryId === '') patch.categoryId = null;
    else if (typeof categoryId === 'string' && findCategory(categoryId)) patch.categoryId = categoryId;
    else return fail(400, 'category', 'That category no longer exists.', { categoryId: 'That category no longer exists.' });
  }

  for (const key of ['excerpt', 'targetQuery', 'metaTitle', 'metaDescription', 'coverImageAlt'] as const) {
    const value = optionalText(body, key, fields);
    if (value !== undefined) patch[key] = value;
  }

  for (const key of ['canonicalUrl', 'coverImageUrl', 'socialImageUrl'] as const) {
    const value = optionalText(body, key, fields);
    if (value === undefined) continue;
    if (value !== null && !isHttpsUrl(value)) {
      return key === 'canonicalUrl'
        ? fail(400, 'canonical', 'Enter a full https:// URL for the canonical link.', { canonicalUrl: 'Enter a full https:// URL.' })
        : fail(400, 'image_url', 'Enter a full https:// image URL.', { [key]: 'Enter a full https:// image URL.' });
    }
    patch[key] = value;
  }

  for (const key of ['featured', 'noindex'] as const) {
    if (!(key in body)) continue;
    const value = bool(body[key]);
    if (value === undefined) fields[key] = 'Must be true or false.';
    else patch[key] = value;
  }

  for (const key of ['keywords', 'tags', 'keyTakeaways'] as const) {
    const list = stringList(body, key, fields);
    if (list !== undefined) patch[key] = list;
  }

  if ('bodyMarkdown' in body) {
    const markdown = body.bodyMarkdown;
    if (markdown === null) patch.bodyMarkdown = '';
    else if (typeof markdown === 'string') patch.bodyMarkdown = markdown;
    else fields.bodyMarkdown = 'Must be text.';
  }

  if ('faqs' in body) {
    const faqs = body.faqs;
    if (faqs === null) patch.faqs = [];
    else if (!Array.isArray(faqs)) fields.faqs = 'Must be a list of questions and answers.';
    else {
      const out: Faq[] = [];
      for (const row of faqs as unknown[]) {
        const question = str((row as Record<string, unknown> | null)?.question)?.trim() ?? '';
        const answer = str((row as Record<string, unknown> | null)?.answer)?.trim() ?? '';
        if (!question && !answer) continue;
        if (!question || !answer) {
          return fail(400, 'faqs', 'Each FAQ needs a question and an answer.', { faqs: 'Each FAQ needs a question and an answer.' });
        }
        out.push({ question, answer });
      }
      patch.faqs = out;
    }
  }

  if (Object.keys(fields).length > 0) return fail(400, 'input', 'Check the highlighted fields.', fields);
  return { patch, slugRequest };
}

const isResult = (value: Write | MockResult): value is MockResult => 'status' in value && 'body' in value;

/** Resolves the slug to store. A slug the user typed must be free; a generated one is made unique. */
function resolveSlug(request: string | null | undefined, title: string, selfId?: string): { slug: string } | MockResult {
  const typed = typeof request === 'string' ? slugify(request) : '';
  if (typed) {
    const owner = slugOwner(typed);
    if (owner && owner.id !== selfId) return fail(409, 'slug_taken', SLUG_TAKEN, { slug: SLUG_TAKEN });
    return { slug: typed };
  }
  return { slug: uniqueSlug(slugify(title), selfId) };
}

function recordRevision(record: PostRecord, ctx: MockContext) {
  blogRevisions.push({
    id: mockId('rev'),
    postId: record.id,
    at: record.updatedAt,
    by: ctx.user.name ?? ctx.user.email,
    title: record.title,
    bodyMarkdown: record.bodyMarkdown,
  });
}

/** Moves a post to a status. Going live stamps `publishedAt`; leaving keeps it (the last time it was live). */
function applyStatus(record: PostRecord, status: PostStatus, at: string): MockResult | null {
  if (status === 'published' && !record.bodyMarkdown.trim()) {
    return fail(422, 'empty', 'Add some body text before publishing.');
  }
  if (status === 'published' && record.status !== 'published') record.publishedAt = at;
  record.status = status;
  return null;
}

const byUpdated = (a: PostRecord, b: PostRecord) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);

function readCategoryName(body: Record<string, unknown>): string | MockResult {
  const name = str(body.name)?.trim().replace(/\s+/g, ' ');
  if (!name) return fail(400, 'name', 'Enter a category name.', { name: 'Enter a category name.' });
  if (name.length > CATEGORY_NAME_MAX) {
    const message = `Keep the name to ${CATEGORY_NAME_MAX} characters or fewer.`;
    return fail(400, 'name', message, { name: message });
  }
  return name;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/blog/posts',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ query }) => {
      let status: PostStatus | undefined;
      if (query.status) {
        const parsed = zPostStatus.safeParse(query.status);
        if (!parsed.success) return fail(400, 'status', 'Pick a valid status.');
        status = parsed.data;
      }
      const rows = livePosts()
        .filter((p) => (!status || p.status === status) && matches(query.q, p.title))
        .sort(byUpdated)
        .map(toPostRow);
      return ok(paginate(rows, query));
    },
  },
  {
    method: 'POST',
    path: '/blog/posts',
    ownerOnly: true,
    latency: 'normal',
    handler: (ctx) => {
      const write = readWrite(ctx.body, true);
      if (isResult(write)) return write;
      const title = write.patch.title ?? '';
      const slug = resolveSlug(write.slugRequest, title);
      if ('status' in slug) return slug;
      const at = nowIso();
      const record: PostRecord = {
        id: mockId('post'),
        title,
        slug: slug.slug,
        status: 'draft',
        featured: false,
        authorId: BLOG_AUTHORS[0].id,
        categoryId: null,
        excerpt: null,
        targetQuery: null,
        metaTitle: null,
        metaDescription: null,
        keywords: [],
        tags: [],
        canonicalUrl: null,
        noindex: false,
        coverImageUrl: null,
        coverImageAlt: null,
        socialImageUrl: null,
        source: 'manual',
        provenance: null,
        bodyMarkdown: '',
        faqs: [],
        keyTakeaways: [],
        createdAt: at,
        updatedAt: at,
        publishedAt: null,
        trashedAt: null,
        ...write.patch,
      };
      // Status goes through the same rule as POST /status (publishing needs a body).
      record.status = 'draft';
      const statusError = applyStatus(record, write.patch.status ?? 'draft', at);
      if (statusError) return statusError;
      blogPosts.push(record);
      recordRevision(record, ctx);
      return ok(toPostDetail(record), 201);
    },
  },
  {
    method: 'GET',
    path: '/blog/posts/:id',
    ownerOnly: true,
    latency: 'fast',
    handler: ({ params }) => {
      const record = findLivePost(params.id);
      return record ? ok(toPostDetail(record)) : postMissing();
    },
  },
  {
    method: 'PATCH',
    path: '/blog/posts/:id',
    ownerOnly: true,
    latency: 'normal',
    handler: (ctx) => {
      const record = findLivePost(ctx.params.id);
      if (!record) return postMissing();
      const write = readWrite(ctx.body, false);
      if (isResult(write)) return write;
      const title = write.patch.title ?? record.title;
      // The slug only changes when it is sent: a new title keeps old links working.
      let slug = record.slug;
      if (write.slugRequest !== undefined) {
        const resolved = resolveSlug(write.slugRequest, title, record.id);
        if ('status' in resolved) return resolved;
        slug = resolved.slug;
      }
      const { status, ...rest } = write.patch;
      const next: PostRecord = { ...record, ...rest, slug, updatedAt: nowIso() };
      if (status) {
        const statusError = applyStatus(next, status, next.updatedAt);
        if (statusError) return statusError;
      }
      Object.assign(record, next);
      recordRevision(record, ctx);
      return ok(toPostDetail(record));
    },
  },
  {
    method: 'DELETE',
    path: '/blog/posts/:id',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ params }) => {
      const record = findLivePost(params.id);
      if (!record) return postMissing();
      record.trashedAt = nowIso();
      return ok(null);
    },
  },
  {
    method: 'POST',
    path: '/blog/posts/:id/publish',
    ownerOnly: true,
    // Publishing refreshes the public site.
    latency: 'slow',
    handler: ({ params }) => {
      const record = findLivePost(params.id);
      if (!record) return postMissing();
      const at = nowIso();
      const error = applyStatus(record, 'published', at);
      if (error) return error;
      record.updatedAt = at;
      return ok(toPostDetail(record));
    },
  },
  {
    method: 'POST',
    path: '/blog/posts/:id/status',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ params, body }) => {
      const record = findLivePost(params.id);
      if (!record) return postMissing();
      const status = zPostStatus.safeParse(body.status);
      if (!status.success) return fail(400, 'status', 'Pick a valid status.', { status: 'Pick a valid status.' });
      const at = nowIso();
      const error = applyStatus(record, status.data, at);
      if (error) return error;
      record.updatedAt = at;
      return ok(toPostDetail(record));
    },
  },
  {
    method: 'POST',
    path: '/blog/render',
    ownerOnly: true,
    latency: 'fast',
    handler: ({ body }) => {
      const markdown = body.markdown;
      if (typeof markdown !== 'string') return fail(400, 'markdown', 'Send the Markdown to render.', { markdown: 'Send the Markdown to render.' });
      return ok(renderMarkdown(markdown));
    },
  },
  {
    method: 'GET',
    path: '/blog/categories',
    ownerOnly: true,
    latency: 'fast',
    handler: () => ok([...blogCategories].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map(toCategory)),
  },
  {
    method: 'POST',
    path: '/blog/categories',
    ownerOnly: true,
    latency: 'fast',
    handler: ({ body }) => {
      const name = readCategoryName(body);
      if (typeof name !== 'string') return name;
      if (blogCategories.some((c) => sameName(c.name, name))) return fail(409, 'category_dup', CATEGORY_DUP, { name: CATEGORY_DUP });
      const base = slugify(name) || 'category';
      let slug = base;
      for (let n = 2; blogCategories.some((c) => c.slug === slug); n++) slug = `${base}-${n}`;
      const record = { id: mockId('bcat'), name, slug, createdAt: nowIso() };
      blogCategories.push(record);
      return ok(toCategory(record), 201);
    },
  },
  {
    method: 'PATCH',
    path: '/blog/categories/:id',
    ownerOnly: true,
    latency: 'fast',
    handler: ({ params, body }) => {
      const record = findCategory(params.id);
      if (!record) return categoryMissing();
      const name = readCategoryName(body);
      if (typeof name !== 'string') return name;
      if (blogCategories.some((c) => c.id !== record.id && sameName(c.name, name))) {
        return fail(409, 'category_dup', CATEGORY_DUP, { name: CATEGORY_DUP });
      }
      // Slugs never change on rename: category links stay valid.
      record.name = name;
      return ok(toCategory(record));
    },
  },
  {
    method: 'DELETE',
    path: '/blog/categories/:id',
    ownerOnly: true,
    latency: 'normal',
    handler: ({ params }) => {
      const index = blogCategories.findIndex((c) => c.id === params.id);
      if (index < 0) return categoryMissing();
      // Posts keep everything but lose the category (trashed ones too).
      for (const p of blogPosts) if (p.categoryId === params.id) p.categoryId = null;
      blogCategories.splice(index, 1);
      return ok(null);
    },
  },
  {
    method: 'GET',
    path: '/blog/authors',
    ownerOnly: true,
    latency: 'fast',
    handler: () => ok(BLOG_AUTHORS),
  },
];
