# API requests for the website team

The app is built against the contract in PROMPT.md section 11, using a mock adapter that follows it exactly. Where a screen needs something the contract does not say (a response shape, a field, a rule, an error code), the exact shape the app expects is written down here instead of being guessed silently. The mock implements every item, so the app already works against it. When the real API differs, the app's zod schemas log the drift in dev builds.

Each file covers one area and lists, in order: response shapes, fields beyond the contract sketch, rules the app relies on, error codes, and that area's slice of `GET /meta`.

| Area | File | Biggest asks |
|---|---|---|
| Session, devices, profile | [session.md](api-requests/session.md) | `GET /me` shape details, device registration responses |
| Inbox | [notifications.md](api-requests/notifications.md) | New `GET /notifications/:id` and `POST /notifications/test-push`; what each mutation returns |
| Home | [overview.md](api-requests/overview.md) | `attentionClients` so a "Needs you" card can open the one client directly |
| Search | [search.md](api-requests/search.md) | Result ordering and role filtering rules |
| Clients | [clients.md](api-requests/clients.md) | Mutation responses return the recomputed run, guarantee or bundle part; list row fields (stage, blocked, tasks, guarantee pace) |
| Leads | [leads.md](api-requests/leads.md) | Full `Lead` shape and filter codes |
| Free tools | [tools.md](api-requests/tools.md) | Answers and result as display text |
| Subscriptions | [billing.md](api-requests/billing.md) | A `summary` on both list responses for the subtitle counts |
| Analytics | [analytics.md](api-requests/analytics.md) | Bucket labels and `prevTotal` rules |
| Ads | [ads.md](api-requests/ads.md) | Connected / not connected shapes, refresh failure codes |
| Blog | [blog.md](api-requests/blog.md) | Write body, slug rules, revisions, render output |
| Email | [email.md](api-requests/email.md) | Campaign counters, consent history events |
| Links | [links.md](api-requests/links.md) | Reserved slugs and destination rules |
| CRM sync | [crm.md](api-requests/crm.md) | Full `GET /crm` and inspector shapes |
| Pricing | [pricing.md](api-requests/pricing.md) | Partial Stripe failure response |
| Coupons | [coupons.md](api-requests/coupons.md) | `Coupon` shape, auto codes, `dealUrl` rules |
| Loader settings | [settings.md](api-requests/settings.md) | Reset semantics |
| Test mode | [testMode.md](api-requests/testMode.md) | Status and purge counts |
| Team | [team.md](api-requests/team.md) | Env-owner lock, removal response |

Two items worth deciding first, because several screens depend on them:

1. **Mutation responses.** The contract says "every entity returned by a mutation is the full updated entity". For nested writes (a task, a call, an access grant), the app also needs the recomputed parent (the onboarding run's derived stage and percent, the guarantee's counted/pace) so it never computes business rules itself. See clients.md section 1.
2. **`GET /notifications/:id`.** The notification detail sheet and push taps need to load one notification by id. See notifications.md section 1.
