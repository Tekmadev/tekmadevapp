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

## 7. Push delivery: what the server sends through the Expo push API

The app registers each phone with `POST /devices` (an Expo push token, `ExponentPushToken[...]`) and handles everything below (`src/modules/push`). Every field below is in the Expo push API's message format (checked 2026-10-03): `tag` (Android) replaces an entry already shown with the same tag, `collapseId` coalesces messages still in transit (FCM `collapse_key`), and a `channelId` the phone does not have means the notification is not shown at all. The app (expo-notifications 57.0.21) reads `data` the same way whether the push arrives in the foreground or is tapped from the shade.

**When.** For each new or bumped notification row, push to every phone of every staff member who can see the row (managers never get owner-audience rows; test rows go to owners only), when that person has **Push on** for the row's category and the category is **not Quiet** for them. A bump sends again.

**How.** `POST https://exp.host/--/api/v2/push/send` (at most 100 messages per request; send the project's Expo access token if "enhanced security for push" is on). One message per device:

```json
{
  "to": "ExponentPushToken[...]",
  "title": "<row title>",
  "body": "<row body, or the event label when the row has no body>",
  "data": {
    "notificationId": "<row id>",
    "url": "<action_url, or null>",
    "category": "<leads|sales|billing|clients|audience|team|system>",
    "severity": "<info|success|warning|critical>"
  },
  "channelId": "<category>, or <category>-critical when severity is critical",
  "tag": "<row id>",
  "collapseId": "<row id>",
  "priority": "high",
  "sound": "default",
  "ttl": 86400
}
```

| Field | Rule |
|---|---|
| `data` | Exactly these four keys (JSON values; `url` may be null or left out). The app reads the category and severity leniently: an unknown value falls back to System and info. |
| `channelId` | Required on Android: a push whose channel does not exist on the phone is **not shown**. The app creates these 14 channels at startup: `leads`, `sales`, `billing`, `clients`, `audience`, `team`, `system`, and `leads-critical`, `sales-critical`, `billing-critical`, `clients-critical`, `audience-critical`, `team-critical`, `system-critical` (high importance, heads-up). A category the app does not know yet must use `system` / `system-critical` until an app update adds its channel. |
| `tag` | The row id, the same on every bump. This is what makes a bumped problem **replace** the earlier entry in the Android shade instead of piling up (brief section 9). Never send a random tag. |
| `collapseId` | Also the row id: if the phone was offline, only the newest bump is delivered (FCM `collapse_key`), and on iPhone it replaces the shown entry (`apns-collapse-id`). |
| `priority` | `high` for every push (each one shows a notification; normal priority can wait for Doze). Heads-up on Android comes from the `-critical` channel, not from priority. |
| `title`, `body` | Always set. Data-only messages are not shown by the app while it is in the background. Keep the whole payload under 4 KiB (trim the body). |
| `sound` | iPhone only (Android sound comes from the channel). Harmless on Android. |

Optional for the iPhone build: `threadId: "<category>"` groups a category's entries.

**Test push** (`POST /notifications/test-push`): same shape, no Inbox row behind it:

```json
{
  "title": "Test notification",
  "body": "Push works on this phone.",
  "data": { "notificationId": "test", "url": "/admin/notifications", "category": "system", "severity": "info" },
  "channelId": "system",
  "tag": "test",
  "priority": "high"
}
```

**Tickets and receipts.** Read the push tickets, then the receipts (they expire after 24 hours). On `DeviceNotRegistered`, delete that `/devices` row and stop sending to the token until the phone registers again. On `MessageTooBig`, trim the body and resend.

**What the app does with it.**
- Tap (app closed or in the background): marks the row read (`POST /notifications/read`), then opens `url` mapped for the person's role (brief section 7). No `url`, an unknown one, or one the role cannot open: the Inbox, with the row's detail sheet (`GET /notifications/:id`). A tap while signed out or locked waits until the person is signed in and unlocked.
- App open: no system banner; an in-app toast (with "Open" when there is a `url`) and a refresh of `GET /notifications/summary` and the Inbox lists.

## 8. Devices: requests for the iPhone build and sign-out

- `POST /devices` must accept `platform: "ios"` as well (the app sends `Platform.OS`). Today the contract and the mock answer 400 `platform` "Only Android phones can register for notifications.".
- The app registers again (same token, same row) when the app version changes, when the person changes, when the push token changes, and at least once a week, so `lastSeenAt` stays fresh. Treat a repeat as an update, as section "POST /devices" in session.md says.
- Sign-out sends `DELETE /devices/:id` first, with a 3 second limit, and skips it offline. A phone that signed out offline keeps its row: please prune rows whose pushes come back `DeviceNotRegistered`, and consider pruning rows not seen for 60 days.
