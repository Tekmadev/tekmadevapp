# API requests: settings (loader, owner)

Contract section 11 lists `GET /settings/loader` and `PUT /settings/loader` (`LoaderSettings | { reset: true }`) without their rules. The mock implements the rules below (`src/api/mock/routes/settings.ts`). Please confirm or tell us what differs.

## `GET /settings/loader` → `LoaderSettings`

The same six values `GET /me` sends as `loader` (section 5): `beatMs`, `buttonBeatMs`, `innerPull`, `outerPull`, `innerFade`, `showAfterMs`.

## `PUT /settings/loader` → `LoaderSettings`

- Returns the saved settings, so the app applies exactly what the site now uses. `GET /me` returns the same values right after.
- PUT replaces the whole object: all six values must be numbers. Otherwise `400 loader` "Send all six loader settings as numbers." with `fields` naming each missing or bad key.
- Out-of-range values are clamped to the section 5 ranges (the same rule the app uses when reading), not refused. Values are stored at slider precision: whole milliseconds for `beatMs`, `buttonBeatMs`, `showAfterMs`; two decimals for `innerPull`, `outerPull`, `innerFade`.
- `{ reset: true }` puts back the defaults (1600, 1100, 0.72, 0.9, 0.7, 300) and returns them.
- A failed save answers `500 db` "Could not save. Nothing changed on the site. Try again." and changes nothing.

Mock trigger: saving `beatMs` of exactly 2999 fails with `db`.
