# API requests: ads (owner only)

Contract section 11 sketches `GET /ads?range=7d|14d|30d|3m|all` → `{ connected, lastSync, totals, days, campaigns, ads, outcomes, cost }` and `POST /ads/refresh` (long job) → `{ rowsUpserted }`. The mock implements the shapes below (`src/api/mock/routes/ads.ts`, schema in `src/api/schemas/ads.ts`). Please confirm or tell us what differs.

## 1. `GET /ads` when not connected

When the server has no Meta ad account id or access token, send only:

```ts
{ connected: false; range: AdsRange; lastSync: null }
```

No totals, no zeros: the app shows the "not connected" card and nothing else (brief rule: never fake data). The schema is a union on `connected`.

## 2. `GET /ads` when connected

```ts
{
  connected: true;
  range: "7d" | "14d" | "30d" | "3m" | "all";   // "all" = the last 12 months
  lastSync: { at: string; ok: boolean; error: string | null } | null;  // error: readable reason when ok is false
  totals: { spend: Money; impressions: number; reach: number; linkClicks: number; ctr: number; costPerLinkClick: Money | null };
  outcomes: { visits: number; leads: number; booked: number; sales: number; revenue: Money; roas: number | null };
  cost: { perVisit: Money | null; perLead: Money | null; perBooked: Money | null; perSale: Money | null };
  days: { date: string; spend: Money; visits: number }[];      // every Toronto day of the range, oldest first, ending today
  campaigns: { id; name; status: "active" | "paused" | "archived"; spend: Money; linkClicks; visits; leads; booked; sales; revenue: Money; costPerLead: Money | null; costPerSale: Money | null }[];
  ads: { id; campaignId; name; spend: Money; linkClicks; visits; leads }[];
}
```

- `cost` is our reading of the contract's `cost` field: spend divided by each outcome over the range, `null` when that outcome is 0. Please confirm what the server means by it.
- `ctr` is a ratio (0.0164 = 1.64%). `roas` is revenue / spend, `null` when nothing was spent.
- `days` covers every day of the range from the first day any campaign ran (days with no spend are sent with 0, because no ads ran that day).
- `campaigns` and `ads` only include rows that spent in the range, sorted by spend (highest first). The ads list carries `campaignId` so tapping a campaign card filters locally.
- Campaign status labels come from `GET /meta` `adsCampaignStatuses: { value, label, tone }[]`.
- `range` missing means `30d`. An unknown range is `400 range` "Unknown range. Use 7d, 14d, 30d, 3m or all."

## 3. `POST /ads/refresh`

- Long job (the app waits up to 2 minutes). Success: `{ rowsUpserted: number }` (the toast says "Pulled {n} ad-day rows from Meta."), and the next `GET /ads` carries the new `lastSync`.
- Meta refuses: `502 upstream` with the message "Meta refused the pull. The inbox has the reason; an expired token is the usual cause.", `lastSync` becomes `{ ok: false, error }`, and the `system.meta_pull_failed` inbox row is bumped (same row, one more occurrence).
- Not connected: `503 not_configured` "The server is missing a setting for this feature."
- In the mock, every 3rd refresh fails so both outcomes can be tried from the app.
