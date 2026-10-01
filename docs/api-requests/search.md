# API requests: global search

Contract section 11 gives `GET /search?q=` and its result shape, but not how it matches or ranks. The mock implements everything below (route in `src/api/mock/routes/session.ts`, logic in `src/api/mock/fixtures/overview.ts`), so the app's SearchSheet already depends on it. Please confirm or tell us what differs.

## 1. Response

```ts
type SearchResults = {
  results: {
    type: "client" | "lead" | "subscriber" | "post" | "coupon" | "link";
    id: string;
    title: string;     // what the row is called
    subtitle: string;  // plain text, parts joined with " · "
    url: string;       // web admin path, mapped with the deep link table
  }[];
};
```

| type | title | subtitle | url |
|---|---|---|---|
| client | business name | "Test" (test clients only), status label, plan name or "No plan", primary email | `/admin/clients/<id>` |
| lead | name, or the email when there is none | status label, source label, then the email (or the business when the title is already the email) | `/admin/leads/<id>` |
| subscriber | email | status label, signup source label | `/admin/email/subscribers/<id>` |
| post | title | status label, category name or "No category" | `/admin/blog/<id>` |
| coupon | code | "20% off" or "$100 off", scope label, status label, internal label | `/admin/coupons` |
| link | `tekmadev.com/<slug>` | internal label, destination, "Disabled" when off | `/admin/links/<id>` |

Labels are the same ones `GET /meta` sends. No dates in subtitles (the app formats dates itself, in Toronto time).

## 2. Rules

- **Roles**: managers only ever get `client` and `lead` results, and never a test client. Owners get every type, test clients included (subtitle starts with "Test").
- **Never returned**: deleted clients, trashed posts, erased subscribers, deleted links.
- **Empty query** (or only spaces or punctuation): `{ results: [] }`. A query with no match is also an empty list. Search never answers 400.
- **At most 20 results**, best matches first.
- **Matching** is case, accent and punctuation insensitive: "Côté" finds "Cote", "lets talk" finds "Let's Talk", "home show" finds the slug `hamilton-home-show`, "dan@acme" finds "dan@acmeplumbing.test".
- **Fields searched**:
  - client: business name; also email, contact name, legal name, website, phone
  - lead: name; also email, business, phone
  - subscriber: email
  - post: title; also slug, target query, category
  - coupon: code; also internal label
  - link: slug and internal label; also destination, UTM campaign and source
- **Ranking**, per field: exact match, then starts with, then a word starts with, then contains. Names, titles, codes and slugs count more than the other fields, except that an exact email or code is as good as an exact name. Ties: clients, leads, subscribers, posts, coupons, links, then newest first.
- **Short queries**: below 3 characters a query only matches the start of a word ("ai" finds "Aisha", not "Detailing").
- **Several words** match in any order ("plumbing acme").
- **Phone numbers**: a query made of digits and phone punctuation, with at least 4 digits, also matches phone numbers by digits ("(905) 555-0142" and "905.555.0142" both find the client).
- Queries are cut at 100 characters.
