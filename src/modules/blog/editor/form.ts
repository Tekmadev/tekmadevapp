import type { Faq, PostDetail, PostStatus, PostWrite } from '@/api/schemas/blog';
import { truncate } from '@/lib/format';
import { finalizeSlug } from '@/lib/text';

/**
 * The editor's form: every field of a post as the screen edits it, and the
 * pure rules around it (what changed since the server copy, what to send,
 * what the app can check before the server does). Nullable server text is ""
 * here and goes back as null; list rows carry a local key so inputs keep
 * their focus when rows move.
 */

export type TakeawayRow = { key: string; text: string };
export type FaqRow = { key: string; question: string; answer: string };

export type EditorForm = {
  title: string;
  body: string;
  // Basics
  slug: string;
  status: PostStatus;
  /** Null on a new post: the server picks the default author (the founder). */
  authorId: string | null;
  categoryId: string | null;
  excerpt: string;
  featured: boolean;
  // Search
  targetQuery: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  tags: string[];
  canonicalUrl: string;
  noindex: boolean;
  // Answer engine
  keyTakeaways: TakeawayRow[];
  faqs: FaqRow[];
  // Media
  coverImageUrl: string;
  coverImageAlt: string;
  socialImageUrl: string;
};

/** The founder's public name (brief section 2): the Preview's fallback author. */
export const FOUNDER_NAME = 'Shajeed I.';
export const SITE_ORIGIN = 'https://www.tekmadev.com';

/** Search result length targets (brief 8.11, Search tab). */
export const META_TITLE_TARGET = 60;
export const META_DESCRIPTION_TARGET = 155;

let rowSeq = 0;
/** A local key for a new list row (never sent). */
export function newRowKey(): string {
  rowSeq += 1;
  return `row${rowSeq}`;
}

export function emptyForm(): EditorForm {
  return {
    title: '',
    body: '',
    slug: '',
    status: 'draft',
    authorId: null,
    categoryId: null,
    excerpt: '',
    featured: false,
    targetQuery: '',
    metaTitle: '',
    metaDescription: '',
    keywords: [],
    tags: [],
    canonicalUrl: '',
    noindex: false,
    keyTakeaways: [],
    faqs: [],
    coverImageUrl: '',
    coverImageAlt: '',
    socialImageUrl: '',
  };
}

/**
 * The form for a server copy. Rows reuse the keys of `previous` by position, so
 * adopting the server's answer after a save does not remount the inputs.
 */
export function formFromDetail(detail: PostDetail, previous?: EditorForm | null): EditorForm {
  const p = detail.post;
  return {
    title: p.title,
    body: detail.bodyMarkdown,
    slug: p.slug,
    status: p.status,
    authorId: p.author.id,
    categoryId: p.category?.id ?? null,
    excerpt: p.excerpt ?? '',
    featured: p.featured,
    targetQuery: p.targetQuery ?? '',
    metaTitle: p.metaTitle ?? '',
    metaDescription: p.metaDescription ?? '',
    keywords: [...p.keywords],
    tags: [...p.tags],
    canonicalUrl: p.canonicalUrl ?? '',
    noindex: p.noindex,
    keyTakeaways: detail.keyTakeaways.map((text, i) => ({ key: previous?.keyTakeaways[i]?.key ?? newRowKey(), text })),
    faqs: detail.faqs.map((f, i) => ({ key: previous?.faqs[i]?.key ?? newRowKey(), question: f.question, answer: f.answer })),
    coverImageUrl: p.coverImageUrl ?? '',
    coverImageAlt: p.coverImageAlt ?? '',
    socialImageUrl: p.socialImageUrl ?? '',
  };
}

/**
 * A draft saved by this or an older build, made whole: missing fields come
 * from `fallback` and rows get keys. Returns null for something that is not a
 * draft of this form at all.
 */
export function normalizeDraft(value: unknown, fallback: EditorForm): EditorForm | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<Record<keyof EditorForm, unknown>>;
  const str = (x: unknown, d: string) => (typeof x === 'string' ? x : d);
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  const strings = (x: unknown, d: string[]) => (Array.isArray(x) && x.every((i) => typeof i === 'string') ? [...(x as string[])] : d);
  const nullableId = (x: unknown, d: string | null) => (x === null || typeof x === 'string' ? x : d);
  const status = (x: unknown): PostStatus =>
    x === 'draft' || x === 'in_review' || x === 'published' || x === 'archived' ? x : fallback.status;
  const takeaways = Array.isArray(v.keyTakeaways)
    ? (v.keyTakeaways as unknown[]).map((row) => ({ key: newRowKey(), text: str((row as { text?: unknown } | null)?.text, '') }))
    : fallback.keyTakeaways;
  const faqs = Array.isArray(v.faqs)
    ? (v.faqs as unknown[]).map((row) => {
        const r = (row ?? {}) as { question?: unknown; answer?: unknown };
        return { key: newRowKey(), question: str(r.question, ''), answer: str(r.answer, '') };
      })
    : fallback.faqs;
  return {
    title: str(v.title, fallback.title),
    body: str(v.body, fallback.body),
    slug: str(v.slug, fallback.slug),
    status: status(v.status),
    authorId: nullableId(v.authorId, fallback.authorId),
    categoryId: nullableId(v.categoryId, fallback.categoryId),
    excerpt: str(v.excerpt, fallback.excerpt),
    featured: bool(v.featured, fallback.featured),
    targetQuery: str(v.targetQuery, fallback.targetQuery),
    metaTitle: str(v.metaTitle, fallback.metaTitle),
    metaDescription: str(v.metaDescription, fallback.metaDescription),
    keywords: strings(v.keywords, fallback.keywords),
    tags: strings(v.tags, fallback.tags),
    canonicalUrl: str(v.canonicalUrl, fallback.canonicalUrl),
    noindex: bool(v.noindex, fallback.noindex),
    keyTakeaways: takeaways,
    faqs,
    coverImageUrl: str(v.coverImageUrl, fallback.coverImageUrl),
    coverImageAlt: str(v.coverImageAlt, fallback.coverImageAlt),
    socialImageUrl: str(v.socialImageUrl, fallback.socialImageUrl),
  };
}

/* ------------------------------------------------------------------ */
/* What changed, what to send                                          */
/* ------------------------------------------------------------------ */

const clean = (s: string) => s.trim();
const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Takeaways as the server keeps them: trimmed, blank rows dropped. */
export function takeawayList(rows: readonly TakeawayRow[]): string[] {
  return rows.map((r) => r.text.trim()).filter(Boolean);
}

/** FAQs as the server keeps them: trimmed, fully blank rows dropped. */
export function faqList(rows: readonly FaqRow[]): Faq[] {
  return rows.map((r) => ({ question: r.question.trim(), answer: r.answer.trim() })).filter((f) => f.question || f.answer);
}

const sameList = <T>(a: readonly T[], b: readonly T[]) => JSON.stringify(a) === JSON.stringify(b);

const TEXT_FIELDS = [
  'excerpt',
  'targetQuery',
  'metaTitle',
  'metaDescription',
  'canonicalUrl',
  'coverImageUrl',
  'coverImageAlt',
  'socialImageUrl',
] as const;

/**
 * PATCH body: only the fields that differ from the server copy the form was
 * loaded from. Text is trimmed and blank becomes null (clears it). A slug
 * cleared by hand is sent as null, so the server makes a new one from the title.
 */
export function buildPatch(base: EditorForm, form: EditorForm): PostWrite {
  const patch: PostWrite = {};
  if (clean(form.title) !== clean(base.title)) patch.title = clean(form.title);
  if (form.body !== base.body) patch.bodyMarkdown = form.body;
  const slug = finalizeSlug(form.slug);
  if (slug !== base.slug) patch.slug = slug || null;
  if (form.status !== base.status) patch.status = form.status;
  if (form.authorId !== base.authorId && form.authorId) patch.authorId = form.authorId;
  if (form.categoryId !== base.categoryId) patch.categoryId = form.categoryId;
  for (const key of TEXT_FIELDS) {
    if (orNull(form[key]) !== orNull(base[key])) patch[key] = orNull(form[key]);
  }
  if (form.featured !== base.featured) patch.featured = form.featured;
  if (form.noindex !== base.noindex) patch.noindex = form.noindex;
  if (!sameList(form.keywords, base.keywords)) patch.keywords = [...form.keywords];
  if (!sameList(form.tags, base.tags)) patch.tags = [...form.tags];
  const takeaways = takeawayList(form.keyTakeaways);
  if (!sameList(takeaways, takeawayList(base.keyTakeaways))) patch.keyTakeaways = takeaways;
  const faqs = faqList(form.faqs);
  if (!sameList(faqs, faqList(base.faqs))) patch.faqs = faqs;
  return patch;
}

/** POST body for "Create post": the title plus every field that has a value. */
export function buildCreate(form: EditorForm): PostWrite & { title: string } {
  const input: PostWrite & { title: string } = { title: clean(form.title) };
  const slug = finalizeSlug(form.slug);
  if (slug) input.slug = slug;
  if (form.status !== 'draft') input.status = form.status;
  if (form.authorId) input.authorId = form.authorId;
  if (form.categoryId) input.categoryId = form.categoryId;
  for (const key of TEXT_FIELDS) {
    const value = orNull(form[key]);
    if (value) input[key] = value;
  }
  if (form.featured) input.featured = true;
  if (form.noindex) input.noindex = true;
  if (form.keywords.length) input.keywords = [...form.keywords];
  if (form.tags.length) input.tags = [...form.tags];
  const takeaways = takeawayList(form.keyTakeaways);
  if (takeaways.length) input.keyTakeaways = takeaways;
  const faqs = faqList(form.faqs);
  if (faqs.length) input.faqs = faqs;
  if (form.body) input.bodyMarkdown = form.body;
  return input;
}

/** The form without row keys, for comparing two forms. */
function comparable(form: EditorForm) {
  return {
    ...form,
    keyTakeaways: form.keyTakeaways.map((r) => r.text),
    faqs: form.faqs.map((r) => [r.question, r.answer]),
  };
}

/** Same content, ignoring row keys (drafts are compared with this). */
export function formsEqual(a: EditorForm, b: EditorForm): boolean {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

/**
 * Unsaved changes: for a saved post, anything the PATCH would send; for a new
 * post, anything typed at all.
 */
export function hasChanges(base: EditorForm, form: EditorForm, isNew: boolean): boolean {
  if (isNew) return !formsEqual(base, form);
  return Object.keys(buildPatch(base, form)).length > 0;
}

/* ------------------------------------------------------------------ */
/* Checks before the server                                             */
/* ------------------------------------------------------------------ */

export type FormErrors = Partial<Record<string, string>>;

export const TITLE_REQUIRED = 'Enter a title.';
export const FAQ_INCOMPLETE = 'Each FAQ needs a question and an answer.';
export const EMPTY_BODY = 'Add some body text before publishing.';
/** The cover's alt text is required in the app whenever there is a cover (brief update 2026-09-30). */
export const COVER_ALT_REQUIRED = 'Describe the cover image in a few words.';

const HTTPS_URL = /^https:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i;

/** The same checks the server makes, so the obvious mistakes never need a round trip. */
export function validateForm(form: EditorForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.title.trim()) errors.title = TITLE_REQUIRED;
  if (form.faqs.some((f) => !f.question.trim() !== !f.answer.trim())) errors.faqs = FAQ_INCOMPLETE;
  if (form.canonicalUrl.trim() && !HTTPS_URL.test(form.canonicalUrl.trim())) errors.canonicalUrl = 'Enter a full https:// URL.';
  for (const key of ['coverImageUrl', 'socialImageUrl'] as const) {
    if (form[key].trim() && !HTTPS_URL.test(form[key].trim())) errors[key] = 'Enter a full https:// image URL.';
  }
  if (form.coverImageUrl.trim() && !form.coverImageAlt.trim()) errors.coverImageAlt = COVER_ALT_REQUIRED;
  return errors;
}

/** A URL worth trying to show as an image preview. */
export function isPreviewableUrl(url: string): boolean {
  return HTTPS_URL.test(url.trim());
}

export type DetailsTab = 'basics' | 'search' | 'answers' | 'media';

/** The Details tab that holds a field (to open it on an error there). Title and body live in the editor. */
export function tabForField(field: string): DetailsTab | null {
  switch (field) {
    case 'slug':
    case 'status':
    case 'author':
    case 'authorId':
    case 'category':
    case 'categoryId':
    case 'excerpt':
    case 'featured':
      return 'basics';
    case 'targetQuery':
    case 'metaTitle':
    case 'metaDescription':
    case 'keywords':
    case 'tags':
    case 'canonicalUrl':
    case 'noindex':
      return 'search';
    case 'keyTakeaways':
    case 'faqs':
      return 'answers';
    case 'coverImageUrl':
    case 'coverImageAlt':
    case 'socialImageUrl':
      return 'media';
    default:
      return null;
  }
}

/** The first Details tab with an error, in tab order. */
export function firstErrorTab(errors: FormErrors): DetailsTab | null {
  const order: DetailsTab[] = ['basics', 'search', 'answers', 'media'];
  const tabs = Object.keys(errors)
    .filter((k) => errors[k])
    .map(tabForField)
    .filter((t): t is DetailsTab => t !== null);
  return order.find((t) => tabs.includes(t)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Rows                                                                 */
/* ------------------------------------------------------------------ */

/** Move the row at `index` one place up (-1) or down (1). Out of range: unchanged. */
export function moveRow<T>(rows: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return [...rows];
  const next = rows.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                      */
/* ------------------------------------------------------------------ */

/** The public article address. */
export function liveUrl(slug: string): string {
  return `${SITE_ORIGIN}/blog/${slug}`;
}

/** A CTA href like "/start" opens on the website. */
export function siteUrl(href: string): string {
  const h = href.trim();
  return h.startsWith('/') ? `${SITE_ORIGIN}${h}` : h;
}

/** "video_script" -> "Video script". */
export function provenanceLabel(source: string): string {
  const words = source.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : source;
}

/** Words in the body, Markdown markers ignored ("##", "-", "|", "---" are not words). */
export function wordCount(markdown: string): number {
  return markdown.split(/\s+/).filter((w) => /[A-Za-z0-9\u00C0-\u024F]/.test(w)).length;
}

/** The Google-style result: title and description as a search page would cut them. */
export function searchSnippet(form: Pick<EditorForm, 'title' | 'metaTitle' | 'metaDescription' | 'excerpt' | 'slug'>, savedSlug: string | null) {
  const title = form.metaTitle.trim() || form.title.trim();
  const description = form.metaDescription.trim() || form.excerpt.trim();
  const slug = finalizeSlug(form.slug) || savedSlug || '';
  return {
    title: truncate(title, META_TITLE_TARGET),
    description: description ? truncate(description, 160) : '',
    breadcrumb: slug ? `tekmadev.com › blog › ${slug}` : 'tekmadev.com › blog',
  };
}
