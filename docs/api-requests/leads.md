# API requests: leads

Contract section 11 lists `GET /leads?q=&source=&status=&need=&cursor=` and `GET /leads/:id` without the lead shape or the filter rules. The mock implements everything below (`src/api/mock/routes/leads.ts`, schema in `src/api/schemas/leads.ts`), so the app already depends on it. Please confirm or tell us what differs.

## 1. The `Lead` shape

```ts
type Lead = {
  id: string;
  name: string | null;          // null when the form did not ask (some free tools)
  email: string;
  phone: string | null;
  business: string | null;
  status: "new" | "booked" | "contacted" | "qualified" | "won" | "lost" | "cancelled";
  source: "cal_booking" | "grow" | "lead_magnet" | "portal_signup";
  need: "customers" | "website" | "custom" | "content" | "unsure" | null;      // null for free tools and portal sign-ups
  revenue: "pre" | "under_10k" | "10k_20k" | "20k_50k" | "50k_100k" | "100k_plus" | null;
  message: string | null;       // as typed, line breaks kept
  bookingAt: string | null;     // ISO instant of the booked call (Cal.com bookings only)
  createdAt: string;            // ISO instant, microseconds
  utm: { source: string | null; medium: string | null; campaign: string | null };  // first touch
  referrer: string | null;      // full URL, null for direct
  convertedClientId: string | null;  // the client this lead became (portal sign-ups: from the start)
};
```

- `status` values are our guess at the website's set. "Booked calls" on Home counts `status = "booked"`. Please send the real list in `GET /meta` (`leadStatuses`, below) and the app follows it.
- A free tool submission creates one lead with `source = "lead_magnet"`. Its id is linked from the submission detail (`leadId`, see tools.md).

## 2. `GET /leads` rules

- Newest first by `createdAt`. `?cursor=&limit=` as everywhere (default 30, max 100), cursor opaque.
- `q` matches name, email, business and phone (case-insensitive "contains").
- `source`, `status`, `need` filter exactly and combine with AND.
- An unknown filter value is a 400, not an empty list, so a typo in the app shows up:

| Status | code | message |
|---|---|---|
| 400 | `source` | Unknown lead source. |
| 400 | `status` | Unknown lead status. |
| 400 | `need` | Unknown lead need. |

- `GET /leads/:id` answers `404 not_found` "That lead no longer exists." for an unknown id.
- Managers may read leads (no 403).

## 3. `GET /meta` fragment

```ts
leadSources: { value: LeadSource; label: string }[];          // "Booked call", "Lead form", "Free tool", "Portal sign-up"
leadStatuses: { value: LeadStatus; label: string; tone: Tone }[];  // new gold, booked ok, others muted
leadNeeds: { value: LeadNeed; label: string }[];              // the five labels in brief 8.6
leadRevenueBands: { value: LeadRevenue; label: string }[];    // the six labels in brief 8.6
```

## Added in phase 3

- The Lead forms section calls `GET /leads?source=grow&limit=3` with the list's `q`, `status` and `need`, and relies on `nextCursor` being non-null when there are more.

## Outreach (owner decision 2026-10-03, roles)

The contract is the website's `docs/admin-api/outreach.md` (server code in `lib/admin-api/leads/` and `app/api/admin/v1/leads/`). The app follows it exactly; this section only lists how the app uses it and what it still needs. Nothing here is owner only: owners, managers and staff hold `leads.view`, `leads.create`, `leads.update` and `leads.outreach`.

What the app calls:

| Call | Where in the app | Capability |
|---|---|---|
| `POST /leads` (Idempotency-Key) | "Add a lead" (button on the Leads segment, and the gold + quick action) | `leads.create` |
| `PATCH /leads/:id` `{ status }`, `{ followUpAt }`, `{ assignedTo }` | Lead detail, Outreach card: Status, Follow-up, Assigned to | `leads.update` |
| `GET /leads/:id/touches?cursor=` | Lead detail, the touches timeline ("Show older" pages) | `leads.view` |
| `POST /leads/:id/touches` (Idempotency-Key) | "Log outreach", and "Log this call / email / text" after a one-tap contact | `leads.outreach` |
| `GET /leads/assignees` | The "Assigned to" picker | `leads.update` or `leads.create` |
| `GET /leads?followUp=any` | The "Follow-ups due" chip on the Leads segment | `leads.view` |

- The app sends `source=outreach` in the Source filter. `zLeadSource` now lists `outreach`, so **please turn on `LIST_OUTREACH_SOURCE` in `lib/admin-api/meta/leads.ts`** in the release that ships these screens. Until then the app adds "Outreach" to the Source choices itself.
- `leadTouchKinds` is read from `GET /meta` (optional in the app's schema, with the same five labels as the fallback).
- A touch logged from the sheet sends `followUpAt` only when the person changed it (null clears it), and never sends `status` (the server's "new becomes contacted" rule decides; the app shows the lead the server answers).
- The app sends no `at` after a one-tap call (the server's clock is "now"); the sheet's "When" field sends one when the person picks a time.
- Booked and Cancelled are shown in the status picker but cannot be chosen (400 `status` otherwise).

What the app still needs from the server:

1. **`followUp=today`**: follow-ups due by the end of the Toronto day (overdue, plus later today), soonest first. "Follow-ups due" means "today or overdue" for the team, and `due` stops at the current minute, so a call planned for 4 PM is missing at 10 AM. Today the app asks for `followUp=any` and stops at the first row past today (the list is soonest first, so the rest are later). With `today` the app would drop that cut.
2. **The existing lead on a 409 `duplicate`**: add `leadId` to the error (for example `{ code: "duplicate", message, fields: { email }, leadId }`) so "Find it" opens that lead. Today the app searches the Leads list for the email.
3. **Fix a touch logged by mistake**: `PATCH /leads/:id/touches/:touchId` and `DELETE /leads/:id/touches/:touchId` (the author, or `leads.update`). Today a wrong touch stays in the timeline.
4. **A title for a lead without a name or an email** (phone only, business only) in `GET /search`: use the business, then the phone, like the app's `leadTitle`, so the result is never blank.
