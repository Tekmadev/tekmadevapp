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

## 10. Image uploads (brief update 2026-09-30)

The website's blog editor uploads images instead of taking pasted links, and the app now does the same. Images live in the **public Supabase Storage bucket `blog-media`**: PNG, JPG, WebP, AVIF or GIF, 10 MB at most, never SVG. The image bytes never go through the admin API.

### `POST /blog/media` (owner only, 403 for managers)

```ts
// request: what is about to be uploaded
{ fileName: string; size: number; type: string }   // size in bytes, type the MIME type ("image/webp")
// response
{ bucket: "blog-media"; path: string; token: string; publicUrl: string }
```

| Status | code | message |
|---|---|---|
| 400 | `type` | Use a PNG, JPG, WebP, AVIF or GIF image. |
| 400 | `size` | That image is over 10 MB. Compress it and try again. |
| 400 | `size` | That file is empty. |
| 400 | `input` | Check the highlighted fields. (`size` sent as something other than a number) |

The app shows `message` exactly as given, in signal red under the field (the body's "Insert image" shows it as a toast).

What the mock does, which we assume the server does too (please confirm):

- `type` is checked first, then `size`. A missing `size` counts as empty. 10 MB means 10 x 1024 x 1024 bytes; exactly that is accepted.
- The path is `posts/<yyyy>/<mm>/<8 random hex>-<slugified file name>.<extension from the type>`, so two uploads never share a path and the stored extension always matches the declared type.
- No Idempotency-Key: the call creates no record, and a retry simply gets a new slot.
- `publicUrl` is the bucket's public object URL (`<project>/storage/v1/object/public/blog-media/<path>`), a full `https://` URL, so it passes the existing `coverImageUrl` / `socialImageUrl` checks.
- In the mock the token is fake. The app skips the storage step in mock API mode and previews the file still on the phone.

### Upload flow in the app

1. Pick from the gallery (the system photo picker, no storage permission) or take a photo.
2. Resize to at most 2400px wide and compress to WebP (JPEG where WebP cannot be written), lowering the quality step by step (0.82, 0.7, 0.55, 0.4) until it is under 10 MB. A GIF that already fits is uploaded unchanged, so it keeps its animation.
3. Read the file into an ArrayBuffer; its byte count is the `size` we declare.
4. `POST /blog/media { fileName, size, type }`.
5. `supabase.storage.from(bucket).uploadToSignedUrl(path, token, bytes, { contentType: type })` with the app's own Supabase client (publishable key only; the token authorizes the upload).
6. Use `publicUrl`: as `coverImageUrl` / `socialImageUrl`, or in the body as `![Describe the image](publicUrl)` on its own line.

The cover's alt text stays a separate field (`coverImageAlt`) and the app requires it whenever there is a cover. Pasting an image link still works everywhere.

Open questions for the server:

- Should the bucket set a long `Cache-Control` on uploads? Paths are unique, so a year would be safe. The app sends supabase-js's default (`max-age=3600`).
- Uploads that are never used by a saved post stay in the bucket (the writer removed the image, or left without saving). Is there (or should there be) a cleanup job?
