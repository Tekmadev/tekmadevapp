# API requests: overview (Home)

Contract section 11 lists `GET /overview` with the top-level keys only. The mock implements everything below (`src/api/mock/routes/overview.ts`, computed in `src/api/mock/fixtures/overview.ts`, schema in `src/api/schemas/overview.ts`), so the app already depends on it. Please confirm or tell us what differs.

## 1. Response shape

```ts
type Overview = {
  kpis: {
    totalLeads: number;      // every lead (GET /leads, no filters)
    bookedCalls: number;     // leads with status "booked"
    activeSubs: number | null;  // live mode: active + trialing + past_due, Webline Care included. null without overview.revenue (section 4)
    pageviews30d: number;    // GET /analytics?range=30d `total`
  };
  attention: {
    needsAction: number;        // open needs-action rows in the CALLER's inbox (= inbox.needsAction)
    blockedOnboardings: number; // clients whose current (not complete) run is blocked, churned excluded
    callsToReview: number;      // CRM appointments with review "needs_review", summed over every client
    intakesToReview: number;    // clients whose latest intake is "submitted"
    behindPace: number;         // live clients, guarantee pace "behind", daysLeft > 0
  };
  attentionClients: AttentionClients;   // NEW, see section 2
  traffic: {
    series: AnalyticsPoint[];   // the 30 daily points of GET /analytics?range=30d, same shape
    topSources: LabelCount[];   // every source, biggest first (the app groups past the top 7 as Other)
    topPages: LabelCount[];     // top 10
  };
  topLinks: TopLink[] | null;   // null without links.view (section 4)
  recentLeads: Lead[];          // 8 newest, the full Lead (same as the first rows of GET /leads)
  recentSubscriptions: Subscription[] | null;  // 8 newest live-mode subscriptions (first rows of GET /billing/subscriptions). null without overview.revenue (section 4)
  inbox: { unread: number; needsAction: number; criticalUnread: number };  // = GET /notifications/summary for the caller
};

type TopLink = { id: string; slug: string; label: string | null; count: number };
```

- `recentLeads` and `recentSubscriptions` carry the same entity as their list endpoints, so a tap can open the detail from cache.
- `topLinks`: visits per short link over the same 30 Toronto days as `traffic` (today and the 29 days before), busiest first, at most 10, links with no visit in the period left out, deleted links left out (nothing to open). Empty array when none had a visit; `null` for someone without `links.view`.

## 2. Addition: `attentionClients`

Brief 8.3 says each "Needs you" card "opens the filtered list". `GET /clients` has no filter for blocked runs, calls to review, intakes to review or pace, so the overview also sends the clients behind each client card:

```ts
type AttentionClients = {
  blockedOnboardings: { clientId: string; businessName: string; url: string; stage: OnboardingStage | null; blockedReason: string | null }[];
  callsToReview:      { clientId: string; businessName: string; url: string; count: number }[];
  intakesToReview:    { clientId: string; businessName: string; url: string; version: number; submittedAt: string | null }[];
  behindPace:         { clientId: string; businessName: string; url: string; counted: number; target: number; expectedByNow: number; daysLeft: number }[];
};
```

- `url` is the web admin path of the section that needs attention: `/admin/clients/<id>#onboarding`, `#calls` (calls to review and behind pace) or `#intake`.
- Lengths equal the matching `attention` numbers; for `callsToReview` the sum of `count` equals `attention.callsToReview`.
- Order, most urgent first: blocked by business name; calls by count (most first); intakes by `submittedAt` (oldest first); behind pace by shortfall `expectedByNow - counted` (largest first), then fewest days left.
- The app shows a card's list in a sheet and opens the client at that section.

If you would rather not send this, the alternative we need is a filter on the Clients list: `GET /clients?attention=blocked|calls_to_review|intake_to_review|behind_pace`, returning the same `ClientRow`s. Tell us which one you will ship.

## 3. Rules the app relies on

- Every number is computed from the same rows the other screens list, at request time, so Home always matches the screen a card or KPI opens.
- Test clients never count, for anyone (Home shows live business only). Test notifications are not in `inbox` either.
- `attention.needsAction` and `inbox` depend on who asks: only rows in the caller's categories (`inbox.<category>`) count. The rest depends on the caller only as section 4 says.
- `GET /overview` needs `overview.view` (every role today); without it the answer is 403 `forbidden` "Your role cannot do that.". There are no other error codes beyond the shared ones (`unavailable` and so on).
- Please confirm `activeSubs` counts `active`, `trialing` and `past_due` (a past-due subscription is still running while Stripe retries). If the web admin counts only `active` and `trialing`, tell us and the mock follows.

## 4. Roles: what the caller's capabilities hide (owner decision 2026-10-03)

The app hides Home's money by capability (`GET /me` `capabilities`, with the role table as the fallback). The mock does what your `buildOverview` already does, and the app relies on it:

| Field | Needs | Without it |
|---|---|---|
| `kpis.activeSubs` | `overview.revenue` (owner, manager) | `null` |
| `recentSubscriptions` | `overview.revenue` | `null` |
| `topLinks` | `links.view` (every role) | `null` |
| `attention.needsAction`, `inbox` | `inbox.<category>` per row | rows of other categories are not counted |

- Hidden means `null`, never `0` or `[]`: the keys always stay, so the shape never changes and a hidden number can never be mistaken for a real zero. An empty list stays `[]` for someone who may see it ("No subscriptions yet...").
- Staff get the same `attention` client counts and `attentionClients` lists as everyone. The app itself leaves out the "Needs you" cards a person cannot act on: CRM appointments to review need `clients.calls.review`, intakes to review need `clients.intake.review` (staff hold neither). Please keep sending the counts: the app decides from the capabilities, so a role change on the server shows up without a new app.
- Revenue stays hidden for staff even though they may read leads: `kpis.totalLeads`, `kpis.bookedCalls`, `kpis.pageviews30d`, `traffic` and `recentLeads` are sent to every role that holds `overview.view`.
- The app draws Home's layout (3 or 4 KPI cards, the Recent subscriptions section) from the capabilities before the data arrives, so the skeleton and the loaded screen match. If the server ever sends `null` to someone holding `overview.revenue`, the card shows its number as unavailable instead of a zero.

