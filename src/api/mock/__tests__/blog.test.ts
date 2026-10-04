import { api, setAuthBridge } from '@/api/client';
import {
  createCategory,
  createPost,
  deleteCategory,
  getAuthors,
  getCategories,
  getPost,
  getPosts,
  postsInfiniteQuery,
  publishPost,
  renameCategory,
  renderPostMarkdown,
  requestMediaUpload,
  setPostStatus,
  trashPost,
  updatePost,
  type PostListParams,
} from '@/api/endpoints/blog';
import { ApiError } from '@/api/errors';
import { blogMediaSlots, blogRevisions, metaFixture } from '@/api/mock/fixtures/blog';
import {
  BLOG_MEDIA_MAX_BYTES,
  metaFragment,
  zAuthors,
  zBlogCategories,
  zBlogCategory,
  zMediaUpload,
  zPostDetail,
  zPostPage,
  zRenderResult,
  type PostPage,
} from '@/api/schemas/blog';

/**
 * The blog domain through the real mock transport: schemas, paging, filters,
 * capability 403s (staff read, owners and managers write), slug rules (server slugify, uniqueness including the trash),
 * revisions, publishing, the Markdown renderer and categories.
 */

let token = '';
const asOwner = () => {
  token = `mock.usr_owner01.${Date.now() + 3_600_000}`;
};
const asManager = () => {
  token = `mock.usr_mgr01.${Date.now() + 3_600_000}`;
};
const asStaff = () => {
  token = `mock.usr_staff01.${Date.now() + 3_600_000}`;
};

let keySeq = 0;
const key = () => `test-blog-${(keySeq += 1)}`;

beforeAll(() => {
  setAuthBridge({ getAccessToken: async () => token });
});
beforeEach(asOwner);

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

/** Walk every page like useInfiniteQuery does, the cursor passed back verbatim. */
async function allPages(params: PostListParams) {
  const options = postsInfiniteQuery(params);
  const pages: PostPage[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page = await getPosts({ ...params, cursor });
    expect(zPostPage.safeParse(page).success).toBe(true);
    pages.push(page);
    const next = options.getNextPageParam(page, pages, cursor, []);
    if (next === undefined) break;
    expect(next).toBe(page.nextCursor);
    cursor = next;
  }
  return pages;
}

describe('meta fragment', () => {
  it('matches its schema', () => {
    expect(metaFragment.safeParse(metaFixture).success).toBe(true);
  });
});

describe('capabilities', () => {
  it('lets staff read posts, categories, authors and the preview (blog.view)', async () => {
    asStaff();
    expect((await getPosts({})).items.length).toBeGreaterThan(0);
    expect((await getPost('post_aireceptn')).post.id).toBe('post_aireceptn');
    expect(zRenderResult.safeParse(await renderPostMarkdown('## Hi')).success).toBe(true);
    expect((await getCategories()).length).toBeGreaterThan(0);
    expect((await getAuthors()).length).toBeGreaterThan(0);
  });

  it('answers 403 forbidden to staff on every blog write (blog.write, blog.trash)', async () => {
    asStaff();
    const calls: Promise<unknown>[] = [
      createPost({ title: 'Nope' }, key()),
      updatePost('post_aireceptn', { title: 'Nope' }),
      publishPost('post_aireceptn'),
      setPostStatus('post_aireceptn', 'draft'),
      trashPost('post_aireceptn'),
      requestMediaUpload({ fileName: 'cover.webp', size: 1024, type: 'image/webp' }),
      createCategory('Nope', key()),
      renameCategory('bcat_aiauto01', 'Nope'),
      deleteCategory('bcat_aiauto01'),
    ];
    for (const call of calls) expect(await apiError(call)).toMatchObject({ status: 403, code: 'forbidden' });
    asOwner();
    expect((await getPost('post_aireceptn')).post.title).not.toBe('Nope');
  });

  it('lets a manager read and write', async () => {
    asManager();
    expect((await getPosts({})).items.length).toBeGreaterThan(0);
    const slot = await requestMediaUpload({ fileName: 'cover.webp', size: 1024, type: 'image/webp' });
    expect(slot.token).toBeTruthy();
  });
});

describe('GET /blog/posts', () => {
  it('pages newest change first with an opaque cursor, ending on a short page, trash excluded', async () => {
    const pages = await allPages({ limit: 5 });
    const rows = pages.flatMap((p) => p.items);
    expect(rows).toHaveLength(14);
    expect(pages.map((p) => p.items.length)).toEqual([5, 5, 4]);
    expect(pages[pages.length - 1].nextCursor).toBeNull();
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.some((r) => r.id === 'post_trashed1')).toBe(false);
    const times = rows.map((r) => r.updatedAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('has every status, two AI drafts and the edge cases', async () => {
    const { items } = await getPosts({ limit: 100 });
    for (const status of ['draft', 'in_review', 'published', 'archived'] as const) {
      expect(items.some((p) => p.status === status)).toBe(true);
    }
    expect(items.filter((p) => p.source === 'ai_draft')).toHaveLength(2);
    expect(items.some((p) => p.category === null)).toBe(true);
    expect(items.some((p) => p.excerpt === null)).toBe(true);
    expect(items.some((p) => p.title.length > 120)).toBe(true);
  });

  it('filters by status and searches by title', async () => {
    const published = await getPosts({ status: 'published' });
    expect(published.items.length).toBeGreaterThan(0);
    expect(published.items.every((p) => p.status === 'published' && p.publishedAt !== null)).toBe(true);
    const found = await getPosts({ q: 'HVAC' });
    expect(found.items.map((p) => p.id)).toEqual(['post_aihvac01']);
    expect((await getPosts({ q: 'zzz no match' })).items).toEqual([]);
  });

  it('rejects an unknown status filter', async () => {
    const error = await apiError(api.get('/blog/posts', { query: { status: 'scheduled' } }));
    expect(error.status).toBe(400);
    expect(error.code).toBe('status');
  });
});

describe('GET /blog/posts/:id', () => {
  it('returns the full post with body, FAQs, takeaways and provenance', async () => {
    const detail = await getPost('post_aihvac01');
    expect(zPostDetail.safeParse(detail).success).toBe(true);
    expect(detail.post.source).toBe('ai_draft');
    expect(detail.post.provenance?.model).toBeTruthy();
    expect(detail.post.author.name).toBe('Shajeed I.');
    expect(detail.post.author.photoUrl).toMatch(/^https:\/\//);
    expect(detail.bodyMarkdown).toContain('::: cta');
    expect(detail.faqs.length).toBeGreaterThan(0);
    expect(detail.keyTakeaways.length).toBeGreaterThan(0);
  });

  it('answers 404 for unknown and trashed posts', async () => {
    expect((await apiError(getPost('post_nope'))).status).toBe(404);
    expect((await apiError(getPost('post_trashed1'))).status).toBe(404);
  });
});

describe('creating and saving posts', () => {
  it('creates a draft with a slug from the title, made unique, and records a revision', async () => {
    const before = blogRevisions.length;
    const first = await createPost({ title: 'Booked Calls & You: A Primer!' }, key());
    expect(zPostDetail.safeParse(first).success).toBe(true);
    expect(first.post.slug).toBe('booked-calls-you-a-primer');
    expect(first.post.status).toBe('draft');
    expect(first.post.publishedAt).toBeNull();
    const second = await createPost({ title: 'Booked calls & you: a primer' }, key());
    expect(second.post.slug).toBe('booked-calls-you-a-primer-2');
    expect(blogRevisions.length).toBe(before + 2);

    const list = await getPosts({ q: 'primer' });
    expect(list.items.map((p) => p.id).sort()).toEqual([first.post.id, second.post.id].sort());
  });

  it('honours the idempotency key: a retry returns the same post', async () => {
    const k = key();
    const a = await createPost({ title: 'Retry safe' }, k);
    const b = await createPost({ title: 'Retry safe' }, k);
    expect(b.post.id).toBe(a.post.id);
    expect((await getPosts({ q: 'Retry safe' })).items).toHaveLength(1);
  });

  it('slugifies a typed slug and refuses one taken by any post, the trash included', async () => {
    const typed = await createPost({ title: 'Typed slug', slug: '  My Custom Slug ' }, key());
    expect(typed.post.slug).toBe('my-custom-slug');
    const taken = await apiError(createPost({ title: 'Clash', slug: 'google-ads-checklist' }, key()));
    expect(taken.status).toBe(409);
    expect(taken.code).toBe('slug_taken');
    expect(taken.message).toBe('That slug is already used by another post (including one in the trash).');
    expect(taken.fields?.slug).toBeTruthy();
  });

  it('needs a title', async () => {
    const error = await apiError(createPost({ title: '   ' }, key()));
    expect(error.status).toBe(400);
    expect(error.code).toBe('title');
    expect(error.fields?.title).toBeTruthy();
  });

  it('applies a partial PATCH, keeps the slug when the title changes, and records a revision', async () => {
    const created = await createPost({ title: 'Patch me', excerpt: 'Keep this excerpt' }, key());
    const revisions = blogRevisions.filter((r) => r.postId === created.post.id).length;
    const saved = await updatePost(created.post.id, {
      title: 'Patched title',
      bodyMarkdown: '## Hello\n\nBody.',
      categoryId: 'bcat_booked01',
      keywords: ['one', ' One ', 'two', ''],
      faqs: [{ question: 'Q?', answer: 'A.' }, { question: '', answer: '' }],
      keyTakeaways: ['First', '  '],
      noindex: true,
    });
    expect(zPostDetail.safeParse(saved).success).toBe(true);
    expect(saved.post.title).toBe('Patched title');
    expect(saved.post.slug).toBe('patch-me');
    expect(saved.post.excerpt).toBe('Keep this excerpt');
    expect(saved.post.category).toEqual({ id: 'bcat_booked01', name: 'Booked Appointments' });
    expect(saved.post.keywords).toEqual(['one', 'two']);
    expect(saved.faqs).toEqual([{ question: 'Q?', answer: 'A.' }]);
    expect(saved.keyTakeaways).toEqual(['First']);
    expect(saved.post.noindex).toBe(true);
    expect(blogRevisions.filter((r) => r.postId === created.post.id).length).toBe(revisions + 1);

    // null clears; a null slug regenerates from the title.
    const cleared = await updatePost(created.post.id, { excerpt: null, slug: null });
    expect(cleared.post.excerpt).toBeNull();
    expect(cleared.post.slug).toBe('patched-title');

    // Visible in a later read.
    const read = await getPost(created.post.id);
    expect(read.post.title).toBe('Patched title');
    expect(read.bodyMarkdown).toBe('## Hello\n\nBody.');
  });

  it('refuses a slug used by another post, a half-filled FAQ and a bad canonical URL', async () => {
    const created = await createPost({ title: 'Validation target' }, key());
    const slug = await apiError(updatePost(created.post.id, { slug: 'speed-to-lead-first-five-minutes' }));
    expect(slug.status).toBe(409);
    expect(slug.code).toBe('slug_taken');
    const faq = await apiError(updatePost(created.post.id, { faqs: [{ question: 'Only a question?', answer: '' }] }));
    expect(faq.code).toBe('faqs');
    expect(faq.fields?.faqs).toBeTruthy();
    const canonical = await apiError(updatePost(created.post.id, { canonicalUrl: 'example.com/page' }));
    expect(canonical.status).toBe(400);
    expect(canonical.fields?.canonicalUrl).toBeTruthy();
    const category = await apiError(updatePost(created.post.id, { categoryId: 'bcat_nope' }));
    expect(category.code).toBe('category');
    expect((await apiError(updatePost('post_nope', { title: 'x' }))).status).toBe(404);
  });
});

describe('publishing and status', () => {
  it('publishes, unpublishes (keeping the last live time) and archives', async () => {
    const created = await createPost({ title: 'Ready to go', bodyMarkdown: 'Some body.' }, key());
    const live = await publishPost(created.post.id);
    expect(zPostDetail.safeParse(live).success).toBe(true);
    expect(live.post.status).toBe('published');
    expect(live.post.publishedAt).not.toBeNull();

    const draft = await setPostStatus(created.post.id, 'draft');
    expect(draft.post.status).toBe('draft');
    expect(draft.post.publishedAt).toBe(live.post.publishedAt);

    const archived = await setPostStatus(created.post.id, 'archived');
    expect(archived.post.status).toBe('archived');
    expect((await getPosts({ status: 'archived' })).items.some((p) => p.id === created.post.id)).toBe(true);
  });

  it('refuses to publish an empty body and an unknown status', async () => {
    const empty = await apiError(publishPost('post_emptydr1'));
    expect(empty.status).toBe(422);
    expect(empty.code).toBe('empty');
    const bad = await apiError(api.post('/blog/posts/post_measure1/status', { status: 'scheduled' }));
    expect(bad.status).toBe(400);
    expect(bad.code).toBe('status');
  });
});

describe('DELETE /blog/posts/:id', () => {
  it('moves the post to the trash: gone from reads, slug still taken', async () => {
    const created = await createPost({ title: 'Short lived', slug: 'short-lived' }, key());
    expect(await trashPost(created.post.id)).toBeNull();
    expect((await apiError(getPost(created.post.id))).status).toBe(404);
    expect((await getPosts({ q: 'Short lived' })).items).toEqual([]);
    expect((await apiError(createPost({ title: 'Again', slug: 'short-lived' }, key()))).code).toBe('slug_taken');
    expect((await apiError(trashPost(created.post.id))).status).toBe(404);
  });
});

describe('POST /blog/render', () => {
  it('turns Markdown into blocks with a reading time', async () => {
    const result = await renderPostMarkdown('# Title\n\n> [!tip] Be quick.\n\n---');
    expect(zRenderResult.safeParse(result).success).toBe(true);
    expect(result.blocks.map((b) => b.type)).toEqual(['heading', 'callout', 'divider']);
    expect(result.readingTimeMinutes).toBe(1);
  });

  it('renders every fixture post body', async () => {
    const { items } = await getPosts({ limit: 100 });
    for (const row of items) {
      const detail = await getPost(row.id);
      expect(zRenderResult.safeParse(await renderPostMarkdown(detail.bodyMarkdown)).success).toBe(true);
    }
  });

  it('needs the Markdown as text', async () => {
    const error = await apiError(api.post('/blog/render', { markdown: 42 }));
    expect(error.status).toBe(400);
    expect(error.code).toBe('markdown');
  });
});

describe('categories', () => {
  it('lists A to Z with post counts, including an empty category', async () => {
    const categories = await getCategories();
    expect(zBlogCategories.safeParse(categories).success).toBe(true);
    const names = categories.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))).toEqual(names);
    expect(categories.find((c) => c.id === 'bcat_reviews1')?.postCount).toBe(0);
    expect(categories.find((c) => c.id === 'bcat_aiauto01')?.postCount).toBeGreaterThan(0);
  });

  it('creates, refuses duplicates and long names, renames without changing the slug', async () => {
    const created = await createCategory('  Home   Services ', key());
    expect(zBlogCategory.safeParse(created).success).toBe(true);
    expect(created).toMatchObject({ name: 'Home Services', slug: 'home-services', postCount: 0 });

    const dup = await apiError(createCategory('home services', key()));
    expect(dup.status).toBe(409);
    expect(dup.code).toBe('category_dup');
    expect(dup.message).toBe('A category with that name already exists.');

    const long = await apiError(createCategory('x'.repeat(61), key()));
    expect(long.status).toBe(400);
    expect(long.code).toBe('name');
    expect((await apiError(createCategory('  ', key()))).code).toBe('name');
    expect((await createCategory('y'.repeat(60), key())).name).toHaveLength(60);

    const renamed = await renameCategory(created.id, 'Trades & Home Services');
    expect(renamed.name).toBe('Trades & Home Services');
    expect(renamed.slug).toBe('home-services');
    expect((await apiError(renameCategory(created.id, 'local seo'))).code).toBe('category_dup');
    // Renaming to its own name in another case is fine.
    expect((await renameCategory(created.id, 'trades & home services')).name).toBe('trades & home services');
    expect((await apiError(renameCategory('bcat_nope', 'x'))).status).toBe(404);
  });

  it('deletes a category: its posts keep everything but lose the category', async () => {
    const category = await createCategory('Temporary', key());
    const post = await createPost({ title: 'In a temporary category', categoryId: category.id }, key());
    expect((await getCategories()).find((c) => c.id === category.id)?.postCount).toBe(1);
    expect(await deleteCategory(category.id)).toBeNull();
    expect((await getCategories()).some((c) => c.id === category.id)).toBe(false);
    const after = await getPost(post.post.id);
    expect(after.post.category).toBeNull();
    expect(after.post.title).toBe('In a temporary category');
    expect(metaFixture.blogCategories.some((c) => c.id === category.id)).toBe(false);
    expect((await apiError(deleteCategory(category.id))).status).toBe(404);
  });
});

describe('GET /blog/authors', () => {
  it('lists Shajeed I. with a photo and one more author', async () => {
    const authors = await getAuthors();
    expect(zAuthors.safeParse(authors).success).toBe(true);
    expect(authors).toHaveLength(2);
    expect(authors[0]).toMatchObject({ name: 'Shajeed I.' });
    expect(authors[0].photoUrl).toBeTruthy();
  });
});

describe('POST /blog/media', () => {
  it('hands out a signed upload slot in the blog-media bucket and never takes the bytes', async () => {
    const before = blogMediaSlots.length;
    const slot = await requestMediaUpload({ fileName: 'Cover Photo.HEIC', size: 524_288, type: 'image/webp' });
    expect(zMediaUpload.safeParse(slot).success).toBe(true);
    expect(slot.bucket).toBe('blog-media');
    expect(slot.path).toMatch(/^posts\/\d{4}\/\d{2}\/[0-9a-f]{8}-cover-photo\.webp$/);
    expect(slot.token).toBeTruthy();
    expect(slot.publicUrl).toBe(`https://mock-project.supabase.co/storage/v1/object/public/blog-media/${slot.path}`);
    expect(blogMediaSlots).toHaveLength(before + 1);
    expect(blogMediaSlots[before]).toMatchObject({ path: slot.path, size: 524_288, type: 'image/webp', fileName: 'Cover Photo.HEIC' });
  });

  it('takes PNG, JPG, WebP, AVIF and GIF, with the extension from the type', async () => {
    const cases: [string, string][] = [
      ['image/png', 'png'],
      ['image/jpeg', 'jpg'],
      ['image/webp', 'webp'],
      ['image/avif', 'avif'],
      ['image/gif', 'gif'],
    ];
    for (const [type, ext] of cases) {
      const slot = await requestMediaUpload({ fileName: 'photo.bin', size: 2048, type });
      expect(slot.path.endsWith(`-photo.${ext}`)).toBe(true);
    }
    // Two uploads of the same name never share a path.
    const a = await requestMediaUpload({ fileName: 'same.webp', size: 10, type: 'image/webp' });
    const b = await requestMediaUpload({ fileName: 'same.webp', size: 10, type: 'image/webp' });
    expect(a.path).not.toBe(b.path);
    // A name with nothing usable still gets a path.
    expect((await requestMediaUpload({ fileName: '???.png', size: 10, type: 'image/png' })).path).toMatch(/-image\.png$/);
  });

  it('refuses SVG and anything that is not an allowed image with code "type"', async () => {
    for (const type of ['image/svg+xml', 'image/heic', 'application/pdf', '']) {
      const error = await apiError(requestMediaUpload({ fileName: 'logo.svg', size: 1024, type }));
      expect(error.status).toBe(400);
      expect(error.code).toBe('type');
      expect(error.message).toBe('Use a PNG, JPG, WebP, AVIF or GIF image.');
    }
  });

  it('refuses an empty file and anything over 10 MB with code "size"', async () => {
    const empty = await apiError(requestMediaUpload({ fileName: 'a.png', size: 0, type: 'image/png' }));
    expect([empty.status, empty.code, empty.message]).toEqual([400, 'size', 'That file is empty.']);
    const tooBig = await apiError(requestMediaUpload({ fileName: 'a.png', size: BLOG_MEDIA_MAX_BYTES + 1, type: 'image/png' }));
    expect([tooBig.status, tooBig.code, tooBig.message]).toEqual([400, 'size', 'That image is over 10 MB. Compress it and try again.']);
    // Exactly 10 MB is fine.
    expect((await requestMediaUpload({ fileName: 'a.png', size: BLOG_MEDIA_MAX_BYTES, type: 'image/png' })).bucket).toBe('blog-media');
  });
});
