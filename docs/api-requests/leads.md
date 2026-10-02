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
