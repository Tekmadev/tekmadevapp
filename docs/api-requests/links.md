# API requests: links (Marketing > Links)

Contract section 11 lists the links endpoints, but leaves the link and click shapes and several rules open. The mock implements everything below exactly as written (`src/api/mock/routes/links.ts`, schemas in `src/api/schemas/links.ts`), so the app already depends on it. Please confirm or tell us what differs. Every links endpoint is owner only (403 for managers).

## 1. Response shapes

| Endpoint | Response |
|---|---|
| `GET /links` | `ShortLink[]`, newest first (not paged) |
| `POST /links` (Idempotency-Key) | `201 ShortLink` |
| `PATCH /links/:id` `{ active }` | `ShortLink` |
| `DELETE /links/:id` | `null` |
| `GET /links/clicks?linkId=&cursor=&limit=` | `Page<LinkClick>`, newest first; without `linkId`, every link |

## 2. Fields

- **`ShortLink`**: `id, slug, destination, shareUrl (always https://www.tekmadev.com/<slug>), utmSource | null, utmMedium | null, utmCampaign | null, label | null, active, clicks, createdAt`. `clicks` counts visits for this link id, so a deleted and recreated slug starts again from 0.
- **`LinkClick`**: `id, at, linkId, slug (as it was when clicked), device ("mobile"|"desktop"|"tablet"|null), country (a country name, or null), referrer (host such as "instagram.com"; null for direct visits and QR scans)`.

## 3. Rules

- **Slug**: trimmed and lowercased by the server, then letters, numbers and single dashes, up to 60 characters. Reserved slugs (meta `linkReservedSlugs`) are refused. A slug used by an existing link is a 409; a deleted link frees its slug.
- **Destination**: optional; when missing, `null` or `""` it is `/` (the home page). Otherwise a site path starting with a single `/` (no spaces), or a full `https://` URL with a dotted host. Bare domains, `http://` and protocol-relative `//host` are refused.
- **UTM fields and label**: trimmed; blank becomes `null`. Not otherwise validated.
- When several fields are wrong, `code`/`message` name the slug problem first and `fields` carries every inline error.
- **PATCH** only reads `active` (a boolean). Other fields are ignored: links cannot be edited after creation.
- **DELETE** keeps the click history. `GET /links/clicks?linkId=` still answers for a deleted link; an id that never existed is a 404.

## 4. Errors

| Status | code | message | fields |
|---|---|---|---|
| 400 | `slug` | Enter a slug using letters, numbers and dashes. | `slug` |
| 400 | `reserved` | That slug is reserved by an existing page. Pick another. | `slug` |
| 400 | `destination` | Enter a valid destination: a path like /start or a full https:// URL. | `destination` |
| 409 | `dupe` | A link with that slug already exists. Pick a different slug. | `slug` |
| 400 | `active` | Send active as true or false. | `active` |
| 404 | `not_found` | That link no longer exists. | |

## 5. GET /meta

`linkReservedSlugs` (the site's top-level pages: about, account, admin, api, blog, book, contact, growth-system, login, pricing, privacy, start, terms, tools, webline and the rest), `utmSuggestions { sources: [instagram, facebook, linkedin, business_card, google, youtube, email], mediums: [social, qr, email, cpc, organic, offline] }`, `linkStatuses` (Active gold, Disabled muted).
