# API requests: notifications (Inbox)

Contract section 11 lists the Inbox endpoints but leaves some shapes and rules open. The mock implements everything below exactly as written (`src/api/mock/routes/notifications.ts`), so the app already depends on it. Please confirm or tell us what differs.

## 1. New endpoint: `GET /notifications/:id`

Needed when a push notification is tapped and its row has no `action_url` (the app opens the detail sheet, and the row may not be in the cached list), and to refresh one row after a deep link.

- Response: one notification item, same shape as in the list (with the caller's `is_read` and `is_muted`).
- `404 not_found` "That notification no longer exists." when the id is unknown, or when the caller may not see it (a manager asking for an owner-audience row or a test row). Answer 404, not 403, so managers cannot probe for owner rows.
- Owners may open test rows by id even without `test=1`.

## 2. New endpoint: `POST /notifications/test-push`

Needed for "Send a test notification" in App settings, Notifications (brief 8.18).

- Body: `{ deviceId?: string }`. With a device id, push only that phone (the id `POST /devices` returned). Without it, push every phone the caller registered.
- Response: `{ sent: number }` (how many devices were sent a push).
- `422 no_devices` "This phone is not set up for notifications yet. Allow notifications, then try again." when there is nothing to send to (no devices, or the device id is not one of the caller's).
- Suggested payload: `{ notificationId: "test", url: "/admin/notifications", category: "system", severity: "info" }`, title "Test notification", body "Push works on this phone." No inbox row is created.

## 3. Mutation responses (the contract does not say what they return)

So the app can apply the server's answer instead of guessing, every Inbox mutation returns the changed rows plus a fresh badge summary:

| Endpoint | Response |
|---|---|
| `POST /notifications/read` `{ ids }` | `{ items: NotificationItem[], summary }` (the rows the caller can see, in their new state) |
| `POST /notifications/unread` `{ ids }` | `{ items: NotificationItem[], summary }` |
| `POST /notifications/read-all` `{ seen? }` | `{ count: number, summary }` (how many rows became read) |
| `POST /notifications/:id/resolve` `{ resolved }` | `{ item: NotificationItem, summary }` |
| `PATCH /notifications/prefs/:category` `{ muted?, push? }` | the full pref row `{ category, label, muted, push }` |

`summary` in these responses is the badge summary (same as `GET /notifications/summary`, test rows excluded).

## 4. Rules the app relies on

- **Sort and paging.** `GET /notifications` is newest first by `last_occurred_at`, ties broken by `id`. The cursor is a keyset cursor ("after this row"), so a row that bumps to the top between page loads is not repeated on the next page. Default limit 30, max 100.
- **Summary semantics.** `unread` and `criticalUnread` leave out rows in categories the caller made quiet. `needsAction` counts open needs-action rows (`needs_action && resolved_at == null`) whether quiet or not.
- **`filter=unread`** returns unread rows in categories that are not quiet, so the list always matches the `unread` count ("You're all caught up." shows when the count is 0).
- **`filter=action`** returns open needs-action rows only (resolved ones stay visible under All, with "Resolved by").
- **`test=1`** includes test rows for owners, and the `summary` in that same response counts them too (so the header matches the rows on screen). Managers sending `test=1` get no test rows and no error.
- **`category=audience|team` from a manager** returns an empty page, not 403 (the rows are filtered by audience anyway).
- **`resolved_by`** is the display name of the staff member (their name, or their email when they have no name), ready for "Resolved by {who}". Not a user id.
- **Resolve** also marks the row read for the caller. Resolving a row that is already resolved keeps the first resolver. Reopening clears `resolved_at` and `resolved_by`. A bump of a resolved needs-action row reopens it.
- **`read-all` with `seen`** marks read every row the caller can see with `last_occurred_at <= seen` (owners: test rows included). The app sends the newest `last_occurred_at` shown, exactly as received (microseconds intact).
- **`data`** is always an object (`{}` when empty), never null.
- **`actor_type`** values used by the mock: `lead`, `client`, `customer`, `subscriber`, `staff`, `integration`, `system`.

## 5. Error codes the app handles

| Endpoint | Status | code | message |
|---|---|---|---|
| `GET /notifications` | 400 | `filter` | Unknown filter. Use all, unread or action. |
| `GET /notifications` | 400 | `category` | Unknown notification category. |
| `GET /notifications` | 400 | `cursor` | That page of the inbox is out of date. Pull to refresh. |
| `POST /notifications/read`, `/unread` | 400 | `ids` | Pick at least one notification. (or "Pick at most 500 notifications at a time.") |
| `POST /notifications/read-all` | 400 | `seen` | That watermark is not a valid time. Pull to refresh, then try again. |
| `POST /notifications/:id/resolve` | 400 | `resolved` | Send resolved as true or false. |
| `POST /notifications/:id/resolve` | 404 | `not_found` | That notification no longer exists. |
| `POST /notifications/:id/resolve` | 422 | `not_actionable` | This notification does not need action. |
| `PATCH /notifications/prefs/:category` | 400 | `input` | Send quiet and push as true or false. (`fields.muted`, `fields.push`) |
| `PATCH /notifications/prefs/:category` | 403 | `owner_only` | That section is owner only. (a manager changing Team or Audience) |
| `PATCH /notifications/prefs/:category` | 404 | `not_found` | That notification category does not exist. |

## 6. GET /meta fragment

```ts
notificationCategories: { value: Category; label: string; ownerOnly: boolean }[]   // ownerOnly: audience, team
notificationSeverities: { value: Severity; label: string; tone: Tone }[]           // info neutral, success ok, warning warn, critical signal
notificationEvents: { key: string; label: string; category: Category; severity: Severity; needsAction: boolean }[]
```
