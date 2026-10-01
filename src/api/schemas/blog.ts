import { z } from 'zod';

import { zInstant, zPage, zTone } from '../types';

/**
 * Schemas for the "blog" domain (contract section 11, Marketing; brief 8.11).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * Bodies are Markdown. The server turns them into blocks (POST /blog/render);
 * the app renders blocks natively and never parses Markdown for the preview.
 */

export const zPostStatus = z.enum(['draft', 'in_review', 'published', 'archived']);
export type PostStatus = z.infer<typeof zPostStatus>;

/** Filter chips and the Details status picker follow this order. "Scheduled" does not exist. */
export const POST_STATUSES: readonly PostStatus[] = zPostStatus.options;

/** `ai_draft`: created by an automation (shows the "AI draft" badge and provenance). */
export const zPostSource = z.enum(['manual', 'ai_draft']);
export type PostSource = z.infer<typeof zPostSource>;

export const zCategoryRef = z.object({ id: z.string(), name: z.string() });
export type CategoryRef = z.infer<typeof zCategoryRef>;

export const zAuthorRef = z.object({ id: z.string(), name: z.string() });
export type AuthorRef = z.infer<typeof zAuthorRef>;

/** GET /blog/authors. The Preview shows the author's name and photo. */
export const zAuthor = z.object({
  id: z.string(),
  /** Public name, e.g. "Shajeed I." (never a full legal name). */
  name: z.string(),
  photoUrl: z.string().nullable(),
  /** One line under the name in the article footer. */
  role: z.string().nullable(),
});
export type Author = z.infer<typeof zAuthor>;
export const zAuthors = z.array(zAuthor);

/** Where an AI draft came from (shown in Details). Null for posts written by hand. */
export const zProvenance = z.object({
  /** What it was drafted from, e.g. "video_script", "call_transcript". */
  source: z.string(),
  /** The model that drafted it. */
  model: z.string(),
  /** Title of the source item, when it has one. */
  sourceTitle: z.string().nullable(),
});
export type Provenance = z.infer<typeof zProvenance>;

/** One row of GET /blog/posts. */
export const zPostRow = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  status: zPostStatus,
  featured: z.boolean(),
  category: zCategoryRef.nullable(),
  author: zAuthorRef,
  updatedAt: zInstant,
  /** Latest time it went live. Kept when a post is unpublished or archived. */
  publishedAt: zInstant.nullable(),
  source: zPostSource,
  excerpt: z.string().nullable(),
});
export type PostRow = z.infer<typeof zPostRow>;

export const zPostPage = zPage(zPostRow);
export type PostPage = z.infer<typeof zPostPage>;

/** Every field of the Details sheet (Basics, Search, Answer engine lists live next to `post`). */
export const zPost = z.object({
  id: z.string(),
  title: z.string(),
  // Basics
  slug: z.string(),
  status: zPostStatus,
  author: zAuthor,
  category: zCategoryRef.nullable(),
  excerpt: z.string().nullable(),
  featured: z.boolean(),
  // Search
  targetQuery: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  canonicalUrl: z.string().nullable(),
  noindex: z.boolean(),
  // Media
  coverImageUrl: z.string().nullable(),
  coverImageAlt: z.string().nullable(),
  socialImageUrl: z.string().nullable(),
  // Provenance
  source: zPostSource,
  provenance: zProvenance.nullable(),
  createdAt: zInstant,
  updatedAt: zInstant,
  publishedAt: zInstant.nullable(),
});
export type Post = z.infer<typeof zPost>;

export const zFaq = z.object({ question: z.string(), answer: z.string() });
export type Faq = z.infer<typeof zFaq>;

/**
 * GET /blog/posts/:id, and what every post mutation returns (the full post).
 * `updatedAt` mirrors `post.updatedAt` so a local draft can be compared at a glance.
 */
export const zPostDetail = z.object({
  post: zPost,
  bodyMarkdown: z.string(),
  faqs: z.array(zFaq),
  keyTakeaways: z.array(z.string()),
  updatedAt: zInstant,
});
export type PostDetail = z.infer<typeof zPostDetail>;

/**
 * Body of POST /blog/posts and PATCH /blog/posts/:id (partial: only sent fields
 * change, `null` clears). `slug` blank or null means "generate from the title".
 * Written as a TS type: requests are built by the app, not parsed.
 */
export type PostWrite = {
  title?: string;
  slug?: string | null;
  status?: PostStatus;
  authorId?: string;
  categoryId?: string | null;
  excerpt?: string | null;
  featured?: boolean;
  targetQuery?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  keywords?: string[];
  tags?: string[];
  canonicalUrl?: string | null;
  noindex?: boolean;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  socialImageUrl?: string | null;
  bodyMarkdown?: string;
  faqs?: Faq[];
  keyTakeaways?: string[];
};

/** GET /blog/categories. Slugs never change on rename. */
export const zBlogCategory = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  /** Posts in this category, trash excluded. */
  postCount: z.number().int(),
});
export type BlogCategory = z.infer<typeof zBlogCategory>;
export const zBlogCategories = z.array(zBlogCategory);

/** Category names are capped at 60 characters (server rule). */
export const CATEGORY_NAME_MAX = 60;

/* ------------------------------------------------------------------ */
/* Rendered blocks (POST /blog/render)                                  */
/* ------------------------------------------------------------------ */

/*
 * Text inside blocks is inline Markdown: it may contain **bold**, *italic*,
 * `code` and [text](url). A blank quoted line inside a quote, callout or
 * answer arrives as "\n\n" (a paragraph break inside the block).
 */

export const zCalloutVariant = z.enum(['info', 'tip', 'warning']);
export type CalloutVariant = z.infer<typeof zCalloutVariant>;

export const zHeadingBlock = z.object({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), text: z.string() });
export const zParagraphBlock = z.object({ type: z.literal('paragraph'), text: z.string() });
export const zListBlock = z.object({ type: z.literal('list'), ordered: z.boolean().optional(), items: z.array(z.string()) });
export const zQuoteBlock = z.object({ type: z.literal('quote'), text: z.string(), cite: z.string().optional() });
export const zCalloutBlock = z.object({ type: z.literal('callout'), variant: zCalloutVariant.optional(), text: z.string() });
export const zAnswerBlock = z.object({ type: z.literal('answer'), question: z.string().optional(), text: z.string() });
export const zImageBlock = z.object({ type: z.literal('image'), url: z.string(), alt: z.string(), caption: z.string().optional() });
export const zTableBlock = z.object({
  type: z.literal('table'),
  caption: z.string().optional(),
  headers: z.array(z.string()),
  /** Every row has exactly `headers.length` cells. */
  rows: z.array(z.array(z.string())),
});
export const zCodeBlock = z.object({ type: z.literal('code'), language: z.string().optional(), code: z.string() });
export const zCtaBlock = z.object({ type: z.literal('cta'), heading: z.string(), body: z.string().optional(), buttonLabel: z.string(), href: z.string() });
export const zDividerBlock = z.object({ type: z.literal('divider') });

export const zBlogBlock = z.discriminatedUnion('type', [
  zHeadingBlock,
  zParagraphBlock,
  zListBlock,
  zQuoteBlock,
  zCalloutBlock,
  zAnswerBlock,
  zImageBlock,
  zTableBlock,
  zCodeBlock,
  zCtaBlock,
  zDividerBlock,
]);
export type BlogBlock = z.infer<typeof zBlogBlock>;
export type BlogBlockType = BlogBlock['type'];
/** A block of one type, e.g. `BlockOf<'table'>`. */
export type BlockOf<T extends BlogBlockType> = Extract<BlogBlock, { type: T }>;

export const zRenderResult = z.object({
  blocks: z.array(zBlogBlock),
  /** 0 for an empty body, otherwise at least 1. */
  readingTimeMinutes: z.number().int(),
});
export type RenderResult = z.infer<typeof zRenderResult>;

/* ------------------------------------------------------------------ */
/* GET /meta fragment                                                   */
/* ------------------------------------------------------------------ */

export const zBlogStatusMeta = z.object({ value: zPostStatus, label: z.string(), tone: zTone });
export const zBlogBlockTypeMeta = z.object({
  value: z.enum(['heading', 'paragraph', 'list', 'quote', 'callout', 'answer', 'image', 'table', 'code', 'cta', 'divider']),
  label: z.string(),
});
/** Categories as of the last meta fetch. Editors read GET /blog/categories for fresh counts. */
export const zBlogCategoryMeta = z.object({ id: z.string(), name: z.string(), slug: z.string() });

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  blogStatuses: z.array(zBlogStatusMeta),
  blogBlockTypes: z.array(zBlogBlockTypeMeta),
  blogCategories: z.array(zBlogCategoryMeta),
});
export type BlogMeta = z.infer<typeof metaFragment>;
