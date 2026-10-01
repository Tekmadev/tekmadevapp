# API requests: email (Marketing > Email)

Contract section 11 lists the email endpoints, but leaves the campaign, event, subscriber and consent shapes and several rules open. The mock implements everything below exactly as written (`src/api/mock/routes/email.ts`, schemas in `src/api/schemas/email.ts`), so the app already depends on it. Please confirm or tell us what differs. Every email endpoint is owner only (403 for managers). This app never sends email.

## 1. Response shapes

| Endpoint | Response |
|---|---|
| `GET /email/overview` | `{ stats: { activeSubscribers, new30d, opens30d, clicks30d }, campaigns: Campaign[] (newest first), recentEvents: EngagementEvent[] (latest 25, newest first) }` |
| `POST /email/campaigns` (Idempotency-Key) | `201 Campaign` |
| `PATCH /email/campaigns/:id` `{ active }` | `Campaign` |
| `DELETE /email/campaigns/:id` | `null` |
| `GET /email/templates` | `{ key, name, subject, useWhen, html, previewHtml }[]` |
| `GET /email/subscribers?q=&status=&cursor=&limit=` | `Page<Subscriber>`, newest signup first. `q` matches the email. |
| `GET /email/subscribers/:id` | `{ subscriber: Subscriber, consentHistory: ConsentEvent[] (newest first) }` |
| `POST /email/subscribers/:id/unsubscribe` | the same detail shape, updated |
| `DELETE /email/subscribers/:id` | `null` |

## 2. Fields

- **`Campaign`**: `id, key, name, subject | null, template | null, description | null (the form's "Note"), opens, clicks, active, createdAt`. `opens` and `clicks` count events for the key **since this campaign was created**, so re-adding a deleted key starts from 0 while past events stay on record.
- **`EngagementEvent`**: `id, at, type (open|click), campaignKey, link (the clicked URL; null for opens), device ("mobile"|"desktop"|"tablet"|null), country (a country name such as "Canada", or null)`. Country names, not ISO codes: Hermes has no `Intl.DisplayNames` to turn codes into names.
- **Stats**: `activeSubscribers` counts status active now. `new30d` counts every signup in the last 30 days, whatever the status is now. `opens30d` and `clicks30d` count every event in the last 30 days, including events of deleted campaigns.
- **Templates**: `key` is also the campaign key the pixel and links use (`c=<key>`). `html` is returned exactly as it must be pasted (with `{{contact.first_name}}`, `{{contact.email}}` and `{{unsubscribe}}` untouched). `previewHtml` has sample values in place of the merge tags and no tracking pixel, so previewing never counts as an open.
- **`Subscriber`**: `id, email, source (signup source key, labels in meta `subscriberSources`), status (active|unsubscribed|bounced|complained), reason (too_many|not_relevant|never_signed_up|other) | null, unsubscribeSource (unsubscribe_page|crm|crm_permanent|admin) | null, inCrm (the CRM / No CRM badge), country | null, signedUpAt, unsubscribedAt | null`. `reason` and `unsubscribeSource` are only set while the status is unsubscribed. `unsubscribedAt` is when the status left active (unsubscribe, bounce or complaint).
- **`ConsentEvent`**: `at, event (subscribed|resubscribed|unsubscribed|bounced|complained|reason), source (a signup or unsubscribe source key), policyVersion | null (null for bounces and complaints), reason? (on "reason" and "unsubscribed" events when they said why)`.

## 3. Rules

- **Campaign key**: trimmed and lowercased by the server, then it must be letters, numbers and single dashes (no leading or trailing dash), up to 64 characters. When both key and name are wrong, the response carries the key error as `code`/`message` and both in `fields`.
- **Pause / Resume**: `active` must be a boolean. Pausing is a label only; counting goes on.
- **Unsubscribe** (staff action): only for active subscribers, else 409 `not_active`. Sets `unsubscribeSource: "admin"`, clears the reason, adds an `unsubscribed` consent event with the current policy version, and queues email DND to the CRM when `inCrm`.
- **Delete** is permanent erasure: the subscriber and their consent history are deleted, anything still queued for the address is dropped, and the CRM contact is queued to be suppressed and tagged erased. The address is remembered as erased and never pushed again (the CRM inspector shows it).
- **`crm_erase`**: we answer **500** when the erasure cannot be queued, and delete nothing. Please confirm the status you use.

## 4. Errors

| Status | code | message | fields |
|---|---|---|---|
| 400 | `key` | Enter a campaign key using letters, numbers and dashes. | `key` (and `name` when that is wrong too) |
| 400 | `name` | Enter a campaign name. | `name` |
| 409 | `dupe` | A campaign with that key already exists. Pick another. | `key` |
| 400 | `active` | Send active as true or false. | `active` |
| 400 | `status` | Pick a valid status. (list filter) | |
| 409 | `not_active` | Only active subscribers can be unsubscribed. | |
| 500 | `crm_erase` | Not deleted: the CRM erasure could not be queued, so their CRM contact would have stayed mailable. Try again. | |
| 404 | `not_found` | That campaign no longer exists. / That subscriber no longer exists. | |

## 5. GET /meta

`subscriberStatuses` (`{ value, label, tone }`: Active gold; Unsubscribed, Bounced, Complained muted), `unsubscribeReasons` ("Too many emails", "Not relevant to me", "I never signed up", "Something else"), `unsubscribeSources` ("via the unsubscribe page", "via the CRM", "via the CRM, as permanent", "via the admin"), `subscriberSources` (labels for source keys, including the unsubscribe sources used in consent events), `consentEvents` (Subscribed, Resubscribed, Unsubscribed, Bounced, "Marked as spam", "Said why they left"), `campaignStatuses` (Active gold, Paused muted), `engagementTypes` (Open muted, Click gold).
