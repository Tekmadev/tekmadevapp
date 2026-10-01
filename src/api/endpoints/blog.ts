import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { api, seg } from '../client';
import {
  zAuthors,
  zBlogCategories,
  zBlogCategory,
  zPostDetail,
  zPostPage,
  zRenderResult,
  type Author,
  type BlogCategory,
  type PostDetail,
  type PostPage,
  type PostStatus,
  type PostWrite,
  type RenderResult,
} from '../schemas/blog';

/**
 * Typed endpoints and query keys for the "blog" domain (owner only): posts,
 * the Markdown renderer behind Preview, categories and authors.
 *
 * Every post mutation returns the full post (`PostDetail`): put it straight
 * into `blogKeys.post(id)` and invalidate `blogKeys.lists()` and
 * `blogKeys.categories()` (counts move when a post changes category).
 */

export const BLOG_PAGE_SIZE = 30;

export type PostListParams = {
  /** One status chip, or null/undefined for "All". */
  status?: PostStatus | null;
  /** Search by title. */
  q?: string | null;
  limit?: number;
};

/** Normalised so equal filters always share one cache entry. */
const listKeyParams = (params: PostListParams) => ({
  status: params.status ?? null,
  q: params.q?.trim() || null,
  limit: params.limit ?? BLOG_PAGE_SIZE,
});

export const blogKeys = {
  all: ['blog'] as const,
  posts: () => ['blog', 'posts'] as const,
  lists: () => ['blog', 'posts', 'list'] as const,
  list: (params: PostListParams) => ['blog', 'posts', 'list', listKeyParams(params)] as const,
  post: (id: string) => ['blog', 'posts', 'detail', id] as const,
  render: (markdown: string) => ['blog', 'render', markdown] as const,
  categories: () => ['blog', 'categories'] as const,
  authors: () => ['blog', 'authors'] as const,
};

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

/** GET /blog/posts: newest change first. Trashed posts never appear. */
export function getPosts(params: PostListParams & { cursor?: string | null }, signal?: AbortSignal) {
  return api.get<PostPage>('/blog/posts', {
    query: {
      status: params.status ?? undefined,
      q: params.q?.trim() || undefined,
      // Passed back exactly as the server sent it.
      cursor: params.cursor ?? undefined,
      limit: params.limit ?? BLOG_PAGE_SIZE,
    },
    schema: zPostPage,
    signal,
  });
}

/** GET /blog/posts/:id: the post, its Markdown body, FAQs and key takeaways. */
export function getPost(id: string, signal?: AbortSignal) {
  return api.get<PostDetail>(`/blog/posts/${seg(id)}`, { schema: zPostDetail, signal });
}

/**
 * POST /blog/posts ("Create post"). The server slugifies (blank slug: from the
 * title), records the first revision and returns the full post.
 * 409 `slug_taken` when a typed slug is used by another post, the trash included.
 */
export function createPost(input: PostWrite & { title: string }, idempotencyKey: string) {
  return api.post<PostDetail>('/blog/posts', input, { schema: zPostDetail, idempotencyKey });
}

/**
 * PATCH /blog/posts/:id ("Save changes"): only the fields sent change, `null`
 * clears. Send `slug: null` to regenerate it from the title. Records a revision.
 */
export function updatePost(id: string, patch: PostWrite) {
  return api.patch<PostDetail>(`/blog/posts/${seg(id)}`, patch, { schema: zPostDetail });
}

/** POST /blog/posts/:id/publish: live on tekmadev.com. 422 `empty` when there is no body. */
export function publishPost(id: string) {
  return api.post<PostDetail>(`/blog/posts/${seg(id)}/publish`, {}, { schema: zPostDetail });
}

/** POST /blog/posts/:id/status: Unpublish (draft), send to review, archive, or publish. */
export function setPostStatus(id: string, status: PostStatus) {
  return api.post<PostDetail>(`/blog/posts/${seg(id)}/status`, { status }, { schema: zPostDetail });
}

/** DELETE /blog/posts/:id: moves the post to the trash (its slug stays taken). */
export function trashPost(id: string) {
  return api.delete<null>(`/blog/posts/${seg(id)}`, { schema: z.null() });
}

/** POST /blog/render: Markdown to blocks for the native Preview (debounce 400ms). */
export function renderPostMarkdown(markdown: string, signal?: AbortSignal) {
  return api.post<RenderResult>('/blog/render', { markdown }, { schema: zRenderResult, signal });
}

/* ------------------------------------------------------------------ */
/* Categories and authors                                              */
/* ------------------------------------------------------------------ */

/** GET /blog/categories: A to Z, each with its post count (trash excluded). */
export function getCategories(signal?: AbortSignal) {
  return api.get<BlogCategory[]>('/blog/categories', { schema: zBlogCategories, signal });
}

/** POST /blog/categories (name up to 60 characters). 409 `category_dup` for a name that exists. */
export function createCategory(name: string, idempotencyKey: string) {
  return api.post<BlogCategory>('/blog/categories', { name }, { schema: zBlogCategory, idempotencyKey });
}

/** PATCH /blog/categories/:id: rename. The slug never changes. */
export function renameCategory(id: string, name: string) {
  return api.patch<BlogCategory>(`/blog/categories/${seg(id)}`, { name }, { schema: zBlogCategory });
}

/** DELETE /blog/categories/:id: its posts keep everything but lose the category. */
export function deleteCategory(id: string) {
  return api.delete<null>(`/blog/categories/${seg(id)}`, { schema: z.null() });
}

/** GET /blog/authors. */
export function getAuthors(signal?: AbortSignal) {
  return api.get<Author[]>('/blog/authors', { schema: zAuthors, signal });
}

/* ------------------------------------------------------------------ */
/* Query options                                                       */
/* ------------------------------------------------------------------ */

export function postsInfiniteQuery(params: PostListParams) {
  return infiniteQueryOptions({
    queryKey: blogKeys.list(params),
    queryFn: ({ pageParam, signal }) => getPosts({ ...params, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function postQuery(id: string) {
  return queryOptions({
    queryKey: blogKeys.post(id),
    queryFn: ({ signal }) => getPost(id, signal),
  });
}

/**
 * The Preview's blocks for one Markdown body (pass the debounced text). The
 * result only depends on the input, so it never goes stale, and it is not
 * persisted (bodies can be long).
 */
export function renderQuery(markdown: string) {
  return queryOptions({
    queryKey: blogKeys.render(markdown),
    queryFn: ({ signal }) => renderPostMarkdown(markdown, signal),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    meta: { persist: false },
  });
}

export function categoriesQuery() {
  return queryOptions({
    queryKey: blogKeys.categories(),
    queryFn: ({ signal }) => getCategories(signal),
  });
}

export function authorsQuery() {
  return queryOptions({
    queryKey: blogKeys.authors(),
    queryFn: ({ signal }) => getAuthors(signal),
    staleTime: 60 * 60_000,
  });
}
