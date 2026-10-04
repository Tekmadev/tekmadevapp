import type { BlogCategory, Post, PostPage, PostRow } from '@/api/schemas/blog';

import {
  categoryDeleteMessage,
  categoryNameError,
  dropRow,
  liveUrl,
  patchRow,
  postCountText,
  postMenuActions,
  postSwipeActions,
  removeCategory,
  rowFromPost,
  rowMetaLine,
  rowsOf,
  statusBadge,
  statusFilterItems,
  trashMessage,
  updatedText,
  upsertCategory,
} from '../logic';

const NOW = new Date('2026-10-02T16:00:00Z');

const row = (over: Partial<PostRow> = {}): PostRow => ({
  id: 'post_1',
  title: 'How to get more booked calls',
  slug: 'more-booked-calls',
  status: 'draft',
  featured: false,
  category: { id: 'bcat_1', name: 'Guides' },
  author: { id: 'auth_1', name: 'Shajeed I.' },
  updatedAt: '2026-10-02T13:00:00.000000Z',
  publishedAt: null,
  source: 'manual',
  excerpt: null,
  ...over,
});

const cat = (over: Partial<BlogCategory> = {}): BlogCategory => ({ id: 'bcat_1', name: 'Guides', slug: 'guides', postCount: 3, ...over });

const pages = (...lists: PostRow[][]) => ({
  pages: lists.map((items, i): PostPage => ({ items, nextCursor: i < lists.length - 1 ? `c${i}` : null })),
  pageParams: lists.map((_, i) => (i === 0 ? null : `c${i - 1}`)),
});

describe('status labels', () => {
  it('uses the brief tones and the meta label', () => {
    expect(statusBadge(undefined, 'published')).toEqual({ label: 'Published', tone: 'gold' });
    expect(statusBadge(undefined, 'in_review')).toEqual({ label: 'In review', tone: 'neutral' });
    expect(statusBadge(undefined, 'draft').tone).toBe('muted');
    expect(statusBadge(undefined, 'archived').tone).toBe('muted');
    const meta = { blogStatuses: [{ value: 'in_review' as const, label: 'Under review', tone: 'gold' as const }] };
    expect(statusBadge(meta, 'in_review')).toEqual({ label: 'Under review', tone: 'neutral' });
  });

  it('lists All then every status', () => {
    expect(statusFilterItems(undefined).map((i) => i.label)).toEqual(['All', 'Draft', 'In review', 'Published', 'Archived']);
  });
});

describe('row text', () => {
  it('builds the live URL', () => {
    expect(liveUrl('more-booked-calls')).toBe('https://www.tekmadev.com/blog/more-booked-calls');
  });

  it('says when it was updated', () => {
    expect(updatedText('2026-10-02T13:00:00Z', NOW)).toBe('Updated 3 h ago');
    expect(updatedText('2026-10-01T15:00:00Z', NOW)).toBe('Updated yesterday');
    expect(updatedText('2026-09-20T15:00:00Z', NOW)).toBe('Updated Sep 20');
  });

  it('joins category, author and time, leaving out a missing category', () => {
    expect(rowMetaLine(row(), NOW)).toBe('Guides · Shajeed I. · Updated 3 h ago');
    expect(rowMetaLine(row({ category: null }), NOW)).toBe('Shajeed I. · Updated 3 h ago');
  });

  it('warns that a live post comes off the site', () => {
    expect(trashMessage(row({ status: 'published' }))).toContain('comes off tekmadev.com');
    expect(trashMessage(row())).toBe('Move "How to get more booked calls" to trash. Its slug stays taken.');
  });
});

describe('pages and cache', () => {
  it('keeps each post once across pages', () => {
    const a = row({ id: 'a' });
    const b = row({ id: 'b' });
    expect(rowsOf(pages([a, b], [b, row({ id: 'c' })]).pages).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rowsOf(undefined)).toEqual([]);
  });

  it('patches a row in place and leaves other data alone', () => {
    const data = pages([row({ id: 'a' }), row({ id: 'b' })], [row({ id: 'c' })]);
    const next = patchRow(data, row({ id: 'b', status: 'published' }));
    expect(next?.pages[0]?.items[1]?.status).toBe('published');
    expect(next?.pages[1]).toBe(data.pages[1]);
    expect(patchRow(data, row({ id: 'zzz' }))).toBe(data);
    expect(patchRow(undefined, row())).toBeUndefined();
  });

  it('drops a trashed row', () => {
    const data = pages([row({ id: 'a' }), row({ id: 'b' })]);
    expect(dropRow(data, 'a')?.pages[0]?.items.map((r) => r.id)).toEqual(['b']);
    expect(dropRow(data, 'nope')).toBe(data);
  });

  it('turns a full post into a row', () => {
    const post: Post = {
      id: 'p',
      title: 'T',
      slug: 's',
      status: 'published',
      author: { id: 'a', name: 'Shajeed I.', photoUrl: null, role: null },
      category: null,
      excerpt: 'E',
      featured: true,
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
      source: 'ai_draft',
      provenance: null,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-02T10:00:00Z',
      publishedAt: '2026-10-02T10:00:00Z',
    };
    expect(rowFromPost(post)).toEqual({
      id: 'p',
      title: 'T',
      slug: 's',
      status: 'published',
      featured: true,
      category: null,
      author: { id: 'a', name: 'Shajeed I.' },
      updatedAt: '2026-10-02T10:00:00Z',
      publishedAt: '2026-10-02T10:00:00Z',
      source: 'ai_draft',
      excerpt: 'E',
    });
  });
});

describe('categories', () => {
  const list = [cat(), cat({ id: 'bcat_2', name: 'Case studies', slug: 'case-studies', postCount: 1 })];

  it('checks names like the server', () => {
    expect(categoryNameError('   ', list)).toBe('Enter a category name.');
    expect(categoryNameError('x'.repeat(61), list)).toBe('Keep the name to 60 characters or fewer.');
    expect(categoryNameError('  guides ', list)).toBe('A category with that name already exists.');
    expect(categoryNameError('GUIDES', list, 'bcat_1')).toBeNull();
    expect(categoryNameError('Pricing', list)).toBeNull();
  });

  it('uses the brief delete copy with a correct plural', () => {
    expect(categoryDeleteMessage(cat())).toBe('Delete "Guides"? 3 posts will keep everything but lose the category.');
    expect(categoryDeleteMessage(cat({ postCount: 1 }))).toBe('Delete "Guides"? 1 post will keep everything but lose the category.');
    expect(categoryDeleteMessage(cat({ postCount: 0 }))).toBe('Delete "Guides"? No posts use it.');
  });

  it('counts posts', () => {
    expect(postCountText(0)).toBe('No posts');
    expect(postCountText(1)).toBe('1 post');
    expect(postCountText(1204)).toBe('1,204 posts');
  });

  it('keeps A to Z order on add and rename, and removes by id', () => {
    const added = upsertCategory(list, cat({ id: 'bcat_3', name: 'Ads', slug: 'ads' }));
    expect(added.map((c) => c.name)).toEqual(['Ads', 'Case studies', 'Guides']);
    const renamed = upsertCategory(added, cat({ name: 'Zebra guides' }));
    expect(renamed.map((c) => c.name)).toEqual(['Ads', 'Case studies', 'Zebra guides']);
    expect(renamed.find((c) => c.id === 'bcat_1')?.slug).toBe('guides');
    expect(removeCategory(renamed, 'bcat_2').map((c) => c.id)).toEqual(['bcat_3', 'bcat_1']);
  });
});

describe('postMenuActions', () => {
  const owner = { canWrite: true, canTrash: true };
  const staff = { canWrite: false, canTrash: false };

  it('gives writers every action', () => {
    expect(postMenuActions(row({ status: 'draft' }), owner)).toEqual(['edit', 'publish', 'share', 'trash']);
    expect(postMenuActions(row({ status: 'published' }), owner)).toEqual(['edit', 'unpublish', 'viewLive', 'share', 'trash']);
  });

  it('keeps only reading for staff: open, View live and Share link', () => {
    expect(postMenuActions(row({ status: 'published' }), staff)).toEqual(['read', 'viewLive', 'share']);
    expect(postMenuActions(row({ status: 'draft' }), staff)).toEqual(['read', 'share']);
  });

  it('shows Move to trash only with blog.trash', () => {
    expect(postMenuActions(row({ status: 'draft' }), { canWrite: true, canTrash: false })).toEqual(['edit', 'publish', 'share']);
  });
});

describe('postSwipeActions', () => {
  it('publishes or unpublishes and trashes for writers online', () => {
    expect(postSwipeActions(row({ status: 'draft' }), { canWrite: true, canTrash: true }, true)).toEqual({ publish: 'publish', trash: true });
    expect(postSwipeActions(row({ status: 'published' }), { canWrite: true, canTrash: true }, true)).toEqual({ publish: 'unpublish', trash: true });
  });

  it('offers no swipe to staff, and none offline', () => {
    expect(postSwipeActions(row({ status: 'draft' }), { canWrite: false, canTrash: false }, true)).toEqual({ publish: null, trash: false });
    expect(postSwipeActions(row({ status: 'draft' }), { canWrite: true, canTrash: true }, false)).toEqual({ publish: null, trash: false });
  });
});
