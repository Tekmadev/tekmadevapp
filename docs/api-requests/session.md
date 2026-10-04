# API requests: session, devices and profile

The contract lists these endpoints without their validation rules. The mock implements the rules below (`src/api/mock/routes/session.ts`). Please confirm or tell us what differs.

## `POST /devices` `{ token, platform, appVersion, deviceName }` → `{ id }`

- One row per push token: registering a token that already exists (token refresh, signing in again, or a different staff member on the same phone) updates that row and returns its existing `id` with 200. A new token returns 201.
- `token` must be an Expo push token (`ExponentPushToken[...]` or `ExpoPushToken[...]`).
- An empty `deviceName` is stored as "Android phone".

| Status | code | message | fields |
|---|---|---|---|
| 400 | `token` | That push token is not valid. | `token` |
| 400 | `platform` | Only Android phones can register for notifications. | `platform` |
| 400 | `app_version` | Send the app version. | `appVersion` |

## `DELETE /devices/:id`

- Returns `null`. `404 not_found` when the id is unknown or belongs to someone else (the app ignores this on sign-out).

## `PATCH /profile` `{ name }` → `{ name }`

- `name` is trimmed. An empty string or `null` clears it (the app then shows the email). Without `name` in the body nothing changes and the current name is returned.

| Status | code | message | fields |
|---|---|---|---|
| 400 | `name` | Enter a display name. (not a string) | `name` |
| 400 | `name` | Keep the name to 80 characters or fewer. | `name` |

## `GET /me`

```ts
type Me = {
  user: { id: string; email: string; name: string | null };
  role: "owner" | "manager" | "staff";
  /** NEW: everything this person may do (names below). */
  capabilities?: string[];
  features: string[];
  timezone: "America/Toronto";
  loader: { ... };
  testModeConfigured: boolean;
  app: { latestVersion: string; minVersion: string; apkUrl: string | null };
};
```

- The mock sends `features: []` (the `assistant` module stays hidden), `testModeConfigured: true` and `app: { latestVersion: "0.1.0", minVersion: "0.1.0", apkUrl: null }`.
- The first call for a user initialises their Inbox read state, as the contract says. In the mock, that first call marks every existing row read except a small seeded set, so a new staff member does not start with the whole history unread. Please confirm what the live server does here.

### Roles and capabilities (owner decision 2026-10-03)

- Three roles: `owner`, `manager`, `staff`. A manager has nearly the owner's power: everything except removing team members and creating or promoting owners. Staff: leads and outreach, analytics, onboarding help, view-only marketing, pricing and coupons, never money.
- Please send the signed-in person's `capabilities` in `GET /me`: the capability names from `lib/admin-api/permissions.ts` that this person holds, as plain strings. The app shows and hides every tab, More row, search screen, quick action, launcher shortcut, deep link and control from this list.
- Without the list (an older server), the app falls back to the role table below, which must match the server's. An empty list means "nothing", not "use the role".
- Names the app does not know are ignored, so the server can add capabilities before the app knows them.
- The app's table is `src/auth/capabilities.ts`; the mock's copy (`src/api/mock/permissions.ts`) is checked against it by a test.

| Capability | Owner | Manager | Staff | Notes |
|---|---|---|---|---|
| `overview.view` | yes | yes | yes | |
| `overview.revenue` | yes | yes | | revenue, active subscriptions and recent subscriptions on Home |
| `notifications.view` | yes | yes | yes | |
| `inbox.leads`, `inbox.clients` | yes | yes | yes | notification categories a role may read |
| `inbox.sales`, `inbox.billing`, `inbox.system`, `inbox.audience`, `inbox.team` | yes | yes | | |
| `analytics.view` | yes | yes | yes | |
| `ads.view`, `ads.refresh` | yes | yes | | |
| `leads.view`, `leads.create`, `leads.update`, `leads.outreach`, `leads.convert` | yes | yes | yes | |
| `leads.delete` | yes | yes | | |
| `tools.view` | yes | yes | yes | |
| `billing.view` | yes | yes | | the Subscriptions segment |
| `clients.view` | yes | yes | yes | |
| `clients.billing` | yes | yes | | billing card and amounts |
| `clients.create`, `clients.edit`, `clients.go_live`, `clients.trash`, `clients.crm`, `clients.members` | yes | yes | | `clients.edit`: account and guarantee terms |
| `clients.onboarding` | yes | yes | | run controls: stage, dates, blocked, complete |
| `clients.tasks.create`, `clients.tasks.status` | yes | yes | yes | |
| `clients.intake.review` | yes | yes | | |
| `clients.access.request` | yes | yes | yes | |
| `clients.access.update` | yes | yes | | |
| `clients.approvals.request`, `clients.calls.log`, `clients.activity.write` | yes | yes | yes | |
| `clients.calls.review`, `clients.templates` | yes | yes | | |
| `testdata.view` | yes | yes | | Test toggles, Include test, test rows |
| `blog.view` | yes | yes | yes | |
| `blog.write`, `blog.trash` | yes | yes | | |
| `email.view` | yes | yes | yes | overview, campaigns and templates |
| `email.campaigns.write`, `email.subscribers.view`, `email.subscribers.write` | yes | yes | | |
| `links.view` | yes | yes | yes | copy, share and QR included |
| `links.write` | yes | yes | | |
| `crm.view`, `crm.write` | yes | yes | | |
| `pricing.view`, `coupons.view`, `coupons.share` | yes | yes | yes | |
| `pricing.write`, `coupons.write` | yes | yes | | |
| `loader.view`, `loader.write`, `testmode.view`, `testmode.write` | yes | yes | | |
| `team.view`, `team.write` | yes | yes | | managers may only add managers and staff |
| `team.remove` | yes | | | NEW: remove members |
| `team.owners` | yes | | | NEW: create or promote owners |

### 403 for a missing capability

The mock answers like the server's `forbiddenError` (`lib/admin-api/permissions.ts`):

| Status | code | message | when |
|---|---|---|---|
| 403 | `owner_only` | That section is owner only. | only owners hold the capability (`team.remove`, `team.owners`) |
| 403 | `forbidden` | Your role cannot do that. | anything else this role may not do |

- `GET /search` keeps each result type by its `*.view` capability (`client` clients.view, `lead` leads.view, `subscriber` email.subscribers.view, `post` blog.view, `coupon` coupons.view, `link` links.view), and test clients only with `testdata.view`.

### Mock accounts

| Role | Email | Password |
|---|---|---|
| Owner | owner@tekmadev.test | tekmadev-owner |
| Manager | manager@tekmadev.test | tekmadev-manager |
| Staff | staff@tekmadev.test | tekmadev-staff |
