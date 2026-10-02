# API requests: analytics

Contract section 11 sketches `GET /analytics?range=24h|7d|30d|3m|6m|1y|all`. The mock implements the rules below (`src/api/mock/routes/analytics.ts`, schema in `src/api/schemas/analytics.ts`). Please confirm or tell us what differs.

## 1. Buckets and labels

| range | bucket | points | `t` | `label` | `title` |
|---|---|---|---|---|---|
| 24h | hour | 24, ending with the current hour | `2026-09-30T14:00:00` | "2 PM" | "Wed, Sep 30, 2 PM" |
| 7d, 30d | day | 7 or 30, ending today | `2026-09-30` | "Sep 30" | "Wednesday, September 30" |
| 3m, 6m | week (Monday start) | 13 or 26, ending with this week | `2026-09-07` (the Monday) | "Week of Sep 7" | "Sep 7 to Sep 13" |
| 1y, all | month | 12, or every month since tracking started | `2026-09-01` | "Sep 2026" | "September 2026" |

- `t` is a Toronto wall-clock label without an offset. The app treats it as text (never parses it).
- `title` is new: the heading for the chart scrub tooltip, so the app never builds dates from labels. Please add it, or tell us and we will drop it.
- The current bucket is partial (it counts what already happened).
- `range` missing means `30d`. An unknown range is `400 range` "Unknown range. Use 24h, 7d, 30d, 3m, 6m, 1y or all."

## 2. Totals and comparison

- `total` is the sum of the series.
- `prevTotal` is the same-length period just before. It is `null` when that period starts before `trackingSince` (an incomplete comparison would mislead), and always `null` for `all`. The app then shows "Tracking started <date>".
- `change = (total - prevTotal) / prevTotal` as a ratio, rounded to 4 decimals. `null` when `prevTotal` is null or 0 (the app shows "Nothing in the period before" when `prevTotal` is 0).
- `average` is per hour for `24h` and per day for every other range (today counts as the share of the day gone by). New field `averagePer: "hour" | "day"` says which, so the KPI label never guesses.
- `peak` is the busiest bucket `{ label, count }` (its `label` is the series label), `null` when there is no traffic.
- `trackingSince` is a Toronto date, `null` when nothing was ever tracked.

## 3. Top lists

All `{ label, count }[]`, highest first, zero rows left out:

- `topSources` and `devices` add up to `total` (the app builds "top 7 plus Other" itself, so send the full source list).
- `topPages`: at most 10, paths.
- `countries`: `label` is the country name, plus an optional `flag` emoji. Adds up to `total`.
- `topReferrers`: hostnames, direct traffic left out.

When nothing was tracked every list is empty (`[]`), so each chart shows "No data yet.", never zeros.

## 4. `GET /meta`

Nothing needed. The range chip labels are app copy (brief 8.9).

## Added in phase 3

- `countries[]` carries `code`, an ISO 3166-1 alpha-2 code the app turns into the flag; `flag` is an optional fallback.
