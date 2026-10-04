import type { InfiniteData } from '@tanstack/react-query';

import { CATEGORY_NAME_MAX, POST_STATUSES, type BlogCategory, type BlogMeta, type Post, type PostPage, type PostRow, type PostStatus } from '@/api/schemas/blog';
import type { Tone } from '@/design/tokens';
import { relativeTime } from '@/lib/dates';
import { formatCount, plural } from '@/lib/format';

/**
 * Pure helpers for the Blog post list and Blog categories (brief 8.11): status
 * labels (GET /meta first, the brief's words as the fallback), row text, cache
 * updates from the server's answer, and category name checks. No React Native
 * here, so it is unit tested.
 */

/* ---------- copy (brief 8.11, exact where the brief gives it) ---------- */

export const BLOG_COPY = {
  empty: 'No posts yet. Create your first one.',
  noMatch: 'No posts match these filters.',
  searchPlaceholder: 'Search by title',
  newPost: 'New post',
  categories: 'Categories',
  publishTitle: 'Publish this post to tekmadev.com?',
  published: 'Published and live on the site.',
  unpublishTitle: 'Unpublish this post?',
  unpublished: 'Unpublished. It is a draft again.',
  trashTitle: 'Move to trash?',
  trashed: 'Moved to trash.',
  shareFirst: 'Publish it first. The link works once it is live.',
  /** Read-only roles cannot publish, so they are not told to. */
  shareNotLive: 'The link works once the post is live.',
  noCategories: 'No categories yet. Add one above.',
  /** Read-only roles (no `blog.write`) get the empty states without the call to create. */
  emptyReadOnly: 'No posts yet.',
  noCategoriesReadOnly: 'No categories yet.',
  categoryAdded: 'Category added.',
  categoryRenamed: 'Category renamed.',
  categoryDeleted: 'Category deleted.',
} as const;

/* ---------- what each role may do (owner decision 2026-10-03) ---------- */

/** What the signed-in person may do to posts: `blog.write` and `blog.trash`. Reading is `blog.view`. */
export type PostAccess = { canWrite: boolean; canTrash: boolean };

/** An entry of a post's actions sheet. `read` stands in for `edit` without `blog.write`. */
export type PostMenuAction = 'edit' | 'read' | 'publish' | 'unpublish' | 'viewLive' | 'share' | 'trash';

/**
 * The long-press / "More actions" sheet of a post, in order. Without
 * `blog.write` it keeps only what reading allows (open, View live, Share
 * link); Move to trash needs `blog.trash`. Never an action that only fails with 403.
 */
export function postMenuActions(row: Pick<PostRow, 'status'>, access: PostAccess): PostMenuAction[] {
  const live = row.status === 'published';
  const actions: PostMenuAction[] = [access.canWrite ? 'edit' : 'read'];
  if (access.canWrite) actions.push(live ? 'unpublish' : 'publish');
  if (live) actions.push('viewLive');
  actions.push('share');
  if (access.canTrash) actions.push('trash');
  return actions;
}

/**
 * A row's swipes: right publishes or unpublishes (`blog.write`), left moves to
 * trash (`blog.trash`). Writes, so none offline.
 */
export function postSwipeActions(
  row: Pick<PostRow, 'status'>,
  access: PostAccess,
  online: boolean,
): { publish: 'publish' | 'unpublish' | null; trash: boolean } {
  if (!online) return { publish: null, trash: false };
  const publish = access.canWrite ? (row.status === 'published' ? 'unpublish' : 'publish') : null;
  return { publish, trash: access.canTrash };
}

/* ---------- status labels and tones ---------- */

export type ToneLabel = { label: string; tone: Tone };

/** Brief 8.11: published gold; in review neutral; draft and archived muted. */
export const STATUS_FALLBACK: Record<PostStatus, ToneLabel> = {
  draft: { label: 'Draft', tone: 'muted' },
  in_review: { label: 'In review', tone: 'neutral' },
  published: { label: 'Published', tone: 'gold' },
  archived: { label: 'Archived', tone: 'muted' },
};

/** The status badge: the label from GET /meta when loaded, the brief's tone always. */
export function statusBadge(meta: Pick<BlogMeta, 'blogStatuses'> | undefined, status: PostStatus): ToneLabel {
  const fallback = STATUS_FALLBACK[status];
  const label = meta?.blogStatuses.find((s) => s.value === status)?.label;
  return { label: label || fallback.label, tone: fallback.tone };
}

/** The filter chips: All, then every status in the server's order. */
export type StatusFilter = 'all' | PostStatus;

export function statusFilterItems(meta: Pick<BlogMeta, 'blogStatuses'> | undefined): { value: StatusFilter; label: string }[] {
  return [{ value: 'all', label: 'All' }, ...POST_STATUSES.map((status) => ({ value: status, label: statusBadge(meta, status).label }))];
}

/* ---------- row text ---------- */

/** The public article. */
export const liveUrl = (slug: string) => `https://www.tekmadev.com/blog/${slug}`;

/** "Updated 5 min ago", "Updated yesterday", "Updated Sep 28". */
export function updatedText(updatedAt: string, now: Date): string {
  const when = relativeTime(updatedAt, now);
  if (!when) return '';
  return `Updated ${when === 'Yesterday' ? 'yesterday' : when}`;
}

/** Category, author and the update time: "Guides · Shajeed I. · Updated 3 h ago". A missing category is left out. */
export function rowMetaLine(row: Pick<PostRow, 'category' | 'author' | 'updatedAt'>, now: Date): string {
  return [row.category?.name, row.author.name, updatedText(row.updatedAt, now)].filter(Boolean).join(' · ');
}

/** What TalkBack reads for the whole row. */
export function rowSpokenLabel(row: PostRow, meta: Pick<BlogMeta, 'blogStatuses'> | undefined, now: Date): string {
  return [
    row.title,
    statusBadge(meta, row.status).label,
    row.featured ? 'Featured' : null,
    row.source === 'ai_draft' ? 'AI draft' : null,
    row.category ? `Category ${row.category.name}` : null,
    `by ${row.author.name}`,
    updatedText(row.updatedAt, now).toLowerCase(),
  ]
    .filter(Boolean)
    .join(', ');
}

/** Message of the trash confirm sheet. */
export function trashMessage(row: Pick<PostRow, 'title' | 'status'>): string {
  return row.status === 'published'
    ? `Move "${row.title}" to trash. It comes off tekmadev.com right away, and its slug stays taken.`
    : `Move "${row.title}" to trash. Its slug stays taken.`;
}

export const publishMessage = (row: Pick<PostRow, 'title' | 'slug'>) => `"${row.title}" goes live at tekmadev.com/blog/${row.slug}.`;
export const unpublishMessage = (row: Pick<PostRow, 'title'>) =>
  `"${row.title}" comes off tekmadev.com and goes back to draft. Its link stops working until you publish it again.`;

/* ---------- pages and cache ---------- */

/** Rows of every loaded page, once each (a post edited between page loads can move pages). */
export function rowsOf(pages: readonly PostPage[] | undefined): PostRow[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: PostRow[] = [];
  for (const page of pages) {
    for (const row of page.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/** The list row for a full post (what every post mutation returns). */
export function rowFromPost(post: Post): PostRow {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    status: post.status,
    featured: post.featured,
    category: post.category,
    author: { id: post.author.id, name: post.author.name },
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt,
    source: post.source,
    excerpt: post.excerpt,
  };
}

type PostPages = InfiniteData<PostPage, string | null>;

/** Replaces the row with the server's answer wherever it is loaded. */
export function patchRow(data: PostPages | undefined, row: PostRow): PostPages | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    if (!page.items.some((item) => item.id === row.id)) return page;
    changed = true;
    return { ...page, items: page.items.map((item) => (item.id === row.id ? row : item)) };
  });
  return changed ? { ...data, pages } : data;
}

/** Drops a trashed post from a loaded list. */
export function dropRow(data: PostPages | undefined, id: string): PostPages | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    if (!page.items.some((item) => item.id === id)) return page;
    changed = true;
    return { ...page, items: page.items.filter((item) => item.id !== id) };
  });
  return changed ? { ...data, pages } : data;
}

/* ---------- categories ---------- */

/** Trimmed, inner runs of spaces collapsed (the server does the same). */
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ');

const sameName = (a: string, b: string) => normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();

/**
 * The inline error for a category name, or null when it can be sent. `selfId`
 * is the category being renamed (its own name is not a duplicate).
 */
export function categoryNameError(name: string, categories: readonly BlogCategory[], selfId?: string): string | null {
  const clean = normalizeName(name);
  if (!clean) return 'Enter a category name.';
  if (clean.length > CATEGORY_NAME_MAX) return `Keep the name to ${CATEGORY_NAME_MAX} characters or fewer.`;
  if (categories.some((c) => c.id !== selfId && sameName(c.name, clean))) return 'A category with that name already exists.';
  return null;
}

/** Brief 8.11: `Delete "<name>"? N posts will keep everything but lose the category.` */
export function categoryDeleteMessage(category: Pick<BlogCategory, 'name' | 'postCount'>): string {
  const n = category.postCount;
  if (n <= 0) return `Delete "${category.name}"? No posts use it.`;
  return `Delete "${category.name}"? ${formatCount(n)} ${plural(n, 'post', 'posts')} will keep everything but lose the category.`;
}

/** "12 posts", "1 post", "No posts". */
export const postCountText = (n: number) => (n <= 0 ? 'No posts' : `${formatCount(n)} ${plural(n, 'post', 'posts')}`);

const byName = (a: BlogCategory, b: BlogCategory) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/** Adds or replaces a category, keeping the server's A to Z order. */
export function upsertCategory(list: readonly BlogCategory[], category: BlogCategory): BlogCategory[] {
  const rest = list.filter((c) => c.id !== category.id);
  return [...rest, category].sort(byName);
}

export const removeCategory = (list: readonly BlogCategory[], id: string): BlogCategory[] => list.filter((c) => c.id !== id);
