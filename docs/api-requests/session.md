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

- The mock sends `features: []` (the `assistant` module stays hidden), `testModeConfigured: true` and `app: { latestVersion: "0.1.0", minVersion: "0.1.0", apkUrl: null }`.
- The first call for a user initialises their Inbox read state, as the contract says. In the mock, that first call marks every existing row read except a small seeded set, so a new staff member does not start with the whole history unread. Please confirm what the live server does here.
