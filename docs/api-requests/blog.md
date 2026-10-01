# API requests: blog (Marketing > Blog)

Contract section 11 lists the blog endpoints and the block types, but leaves the write body, several response shapes and most validation rules open. The mock implements everything below exactly as written (`src/api/mock/routes/blog.ts`, schemas in `src/api/schemas/blog.ts`, the Markdown converter in `src/api/mock/markdown.ts`), so the app already depends on it. Please confirm or tell us what differs. Every blog endpoint is owner only (403 for managers).

## 1. Response shapes

| Endpoint | Response |
|---|---|
| `GET /blog/posts?status=&q=&cursor=&limit=` | `Page<PostRow>`, newest `updatedAt` first (id breaks ties). Trashed posts never appear. `q` matches the title only. |
| `GET /blog/posts/:id` | `PostDetail` `{ post: Post, bodyMarkdown, faqs: { question, answer }[], keyTakeaways: string[], updatedAt }`. 404 for a trashed post. |
| `POST /blog/posts` (Idempotency-Key) | `201 PostDetail` |
| `PATCH /blog/posts/:id` | `PostDetail` |
| `POST /blog/posts/:id/publish` | `PostDetail` |
| `POST /blog/posts/:id/status` `{ status }` | `PostDetail` |
| `DELETE /blog/posts/:id` | `null` (moved to the trash) |
| `POST /blog/render` `{ markdown }` | `{ blocks: BlogBlock[], readingTimeMinutes }` |
| `GET /blog/categories` | `{ id, name, slug, postCount }[]`, A to Z (case-insensitive). `postCount` excludes the trash. |
| `POST /blog/categories` `{ name }` (Idempotency-Key) | `201` category |
| `PATCH /blog/categories/:id` `{ name }` | the category |
| `DELETE /blog/categories/:id` | `null` |
| `GET /blog/authors` | `{ id, name, photoUrl: string \| null, role: string \| null }[]` (`role` is the line under the name in the Preview) |

## 2. Fields

- **`PostRow`**: `id, title, slug, status (draft|in_review|published|archived), featured, category { id, name } | null, author { id, name }, updatedAt, publishedAt | null, source (manual|ai_draft), excerpt | null`.
- **`Post`**: `id, title, slug, status, author (full author with photoUrl), category | null, excerpt, featured, targetQuery, metaTitle, metaDescription, keywords[], tags[], canonicalUrl, noindex, coverImageUrl, coverImageAlt, socialImageUrl, source, provenance { source, model, sourceTitle | null } | null, createdAt, updatedAt, publishedAt`. Nullable text fields are `null` when empty, never `""`.
- **`publishedAt`** is the latest time the post went live. It is kept when the post is unpublished or archived, so an archived post can still say when it was live.

## 3. Write body (POST and PATCH)

```ts
{
  title?: string;            // required on POST
  slug?: string | null;      // blank or null: generate from the title
  status?: "draft" | "in_review" | "published" | "archived";
  authorId?: string;
  categoryId?: string | null;
  excerpt?, targetQuery?, metaTitle?, metaDescription?, coverImageAlt?: string | null;
  canonicalUrl?, coverImageUrl?, socialImageUrl?: string | null;   // full https:// URLs
  featured?, noindex?: boolean;
  keywords?, tags?, keyTakeaways?: string[];   // trimmed, blanks and case-insensitive duplicates dropped
  bodyMarkdown?: string;
  faqs?: { question: string; answer: string }[];   // rows with both sides blank are dropped
}
```

- PATCH is partial; `null` clears. Status may be changed through PATCH too (same rules as `POST /status`), so the Details sheet saves in one call.
- New posts default to: author Shajeed I., no category, status draft, source manual.

## 4. Slugs

- A typed slug is slugified (lowercase ASCII letters, digits, single dashes; accents folded). If another post uses it, **including one in the trash**: 409 `slug_taken`.
- A blank or `null` slug is generated from the title. A generated slug that is taken gets `-2`, `-3`... instead of failing.
- Changing the title never changes the slug (old links keep working). Only sending `slug` does.

## 5. Revisions and publishing

- A revision (title and body snapshot) is recorded on create and on every PATCH ("Saved. A version snapshot was recorded."). Publish and status changes do not record one.
- Publishing a post whose body is empty or blank answers 422 `empty`. This is our assumption: please confirm the server has (or wants) this rule.
- There is no scheduled status.

## 6. Categories

- Names are trimmed and inner whitespace collapsed; up to 60 characters. Duplicates are checked case-insensitively against every other category.
- The slug is made from the name at creation (with `-2`... when taken) and **never changes on rename**.
- Deleting a category removes it from its posts (the trash included); the posts keep everything else.

## 7. Render

- `readingTimeMinutes`: words in the blocks divided by 225, rounded up, at least 1; `0` for an empty body. Syntax characters are not counted.
- Inside `quote`, `callout` and `answer`, a blank quoted line becomes `"\n\n"` in `text` (a paragraph break).
- `list.ordered` is always sent (`true` or `false`). `quote.cite` and `table.caption` are never produced, because the supported syntax has no way to write them.
- Inline Markdown (`**bold**`, `*italic*`, `` `code` ``, `[text](url)`) stays in the text. Anything that does not match the supported syntax becomes a paragraph (an incomplete `::: cta` block too).

## 8. Errors

| Status | code | message | fields |
|---|---|---|---|
| 400 | `title` | Enter a title. | `title` |
| 400 | `status` | Pick a valid status. (body, or the list `status` filter) | `status` |
| 400 | `author` | That author no longer exists. | `authorId` |
| 400 | `category` | That category no longer exists. | `categoryId` |
| 400 | `canonical` | Enter a full https:// URL for the canonical link. | `canonicalUrl` |
| 400 | `image_url` | Enter a full https:// image URL. | `coverImageUrl` or `socialImageUrl` |
| 400 | `faqs` | Each FAQ needs a question and an answer. | `faqs` |
| 400 | `input` | Check the highlighted fields. (a field of the wrong type) | per field |
| 409 | `slug_taken` | That slug is already used by another post (including one in the trash). | `slug` |
| 422 | `empty` | Add some body text before publishing. | |
| 400 | `markdown` | Send the Markdown to render. | `markdown` |
| 400 | `name` | Enter a category name. / Keep the name to 60 characters or fewer. | `name` |
| 409 | `category_dup` | A category with that name already exists. | `name` |
| 404 | `not_found` | That post no longer exists. / That category no longer exists. | |

## 9. GET /meta

`blogStatuses` (`{ value, label, tone }`: Draft muted, In review neutral, Published gold, Archived muted), `blogBlockTypes` (`{ value, label }`), `blogCategories` (`{ id, name, slug }`, as of the meta fetch; editors read `GET /blog/categories` for fresh counts).
