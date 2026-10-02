# API requests: clients (Customers, client detail, checklist templates)

Contract section 11 lists the Customers endpoints from `GET /clients` down to `/onboarding-templates`, but leaves most response shapes, several fields and the business-rule errors open. The mock implements everything below exactly as written (`src/api/mock/routes/clients.ts`, schemas in `src/api/schemas/clients.ts`), so the app already depends on it. Please confirm or tell us what differs.

Every derived value (derived stage, percent done, waiting on client, guarantee pace, `expectedByNow`, call review badge, `counts`) is computed by the server. The app never recomputes them, which is why several writes below return the recomputed parent.

## 1. Mutation responses

| Endpoint | Response |
|---|---|
| `POST /clients` | `201 { client: Client, reused: boolean, invite: "sent" \| "failed" \| "skipped" }` (200 when reused) |
| `PATCH /clients/:id` | the full `Client` |
| `DELETE /clients/:id` (owner) | the full `Client` with `deletedAt` set (soft delete) |
| `POST /clients/:id/go-live` `{ override? }` | `{ client: Client, guarantee: Guarantee }` (the toast reads `guarantee.clockStarted`) |
| `PATCH /onboardings/:id` | the full `OnboardingRun` (with derived fields) |
| `POST /onboardings/:id/complete` | the full `OnboardingRun` |
| `POST /onboardings/:id/tasks` | `201 { task: OnboardingTask, run: OnboardingRun }` |
| `PATCH /tasks/:id` `{ status }` | `{ task: OnboardingTask, run: OnboardingRun }` |
| `POST /intakes/:id/review` | the full `Intake` |
| `POST /clients/:id/access-grants` | `201 AccessGrant` |
| `PATCH /access-grants/:id` | the full `AccessGrant` |
| `POST /clients/:id/approvals` | `201 Approval` (the new version) |
| `POST /clients/:id/calls` | `201 { call: Call, guarantee: Guarantee }` |
| `PATCH /calls/:id` | `{ call: Call, guarantee: Guarantee }` |
| `POST /calls/:id/review` `{ counts }` | `{ call: Call, guarantee: Guarantee }` |
| `PUT /clients/:id/crm-location` (owner) | `CrmLocation` `{ locationId, calendarIds, pendingToApply, mappedAt }` |
| `POST /clients/:id/members` | `201 { member: Member, invite: "sent" \| "failed" }` |
| `PATCH /members/:id` | the full `Member` |
| `POST /members/:id/invite` | `{ member: Member, sent: "invite" \| "reset" }` |
| `POST /clients/:id/activity` | `201 Activity` |
| `POST /assets/:id/sign` | `{ url, thumbnailUrl: string \| null, expiresAt }` (we added `thumbnailUrl`: the grid shows thumbnails) |
| `PUT /onboarding-templates/:key` (owner) | `OnboardingTemplate` (201 when created) |
| `DELETE /onboarding-templates/:key` (owner) | `{ key, deleted: true }` |

## 2. Fields the screens need beyond the contract sketch

- **`ClientRow`** (list): `id, businessName, primaryEmail, isTest, planId, planName, status, stage (derived, null without a run), blocked, blockedReason, openTasks { client, us }, goLive { liveDate, targetDate }, guarantee { eligible, counted, target, daysIn, daysLeft, windowDays, status: met|on_pace|behind|not_started|n/a }, strategist (email), updatedAt`. `goLive.targetDate` is null once `liveDate` is set. `blocked` is only true for a run that is not complete.
- **`GET /clients` stats** `{ leads, onboarding (onboarding + pending), live, blocked, behindPace }` ignore the status chip and the search, and include test clients only when the same request has `test=1`.
- **`Client`** adds `contactName`, `planName`, `isTest`, `portalUrl` (client portal home for "Open portal"), `createdAt`, `updatedAt`, `deletedAt`. Guarantee terms are flat: `guaranteeEligible, guaranteeTarget, guaranteeWindowDays, guaranteeCountRule (booked|showed), guaranteeStatus (not_started|running|met|missed|waived), guaranteeClockStartedOn (date)`.
- **`billing`**: `{ subscription: { id, kind: plan|care, productName, status, cancelAtPeriodEnd, currentPeriodEnd, amount: Money, interval } | null, latestOrder: { id, productName, status, amount: Money, paymentMethod (display text, e.g. "Visa •••• 4242"), paidAt, createdAt } | null, carePlan: { required, active } } | null` (null: "no billing record").
- **`OnboardingRun`**: `id, clientId, stage, derivedStage, percentRequiredDone, requiredDone, requiredTotal, waitingOnClient, blocked, blockedReason, targetLiveDate, kickoffAt, startedAt, completedAt, updatedAt`. Tasks add `runId, templateKey, sortOrder, createdAt, updatedAt`; `doneBy` is a display name.
- **`Guarantee`**: `eligible, counted, target, windowDays, countRule, clockStarted, clockStartedOn, endsOn, daysIn, daysLeft, expectedByNow, status, needsReview` (`needsReview` drives the review banner). Pace is linear: `expectedByNow = floor(target * daysIn / windowDays)`.
- **`Call`**: adds `source (crm|manual|phone|website|referral|other)`, `review (needs_review|qualified|disqualified|outside_window)`, `counts`, `reviewedAt`, `reviewedBy`, `crmAppointmentId`. A CRM sync may preset `disqualifiedReason` on an unreviewed call ("Agree, it does not count").
- **`Asset`**: adds `width`, `height` (images), `uploadedAt`, `uploadedBy`.
- **`Approval`**: `version` increases per title; requesting a title that exists supersedes the pending version.
- **`Activity`**: `{ id, clientId, kind: note|update|event, event, summary, subject, text, actionUrl, visibleToClient, actor: { kind: staff|client|system, name, email }, createdAt }`. `event` keys are labelled by `GET /meta` `activityEvents`.
- **`crmLocation`** is omitted from the bundle (the key is absent, not null) for managers.
- **`GET /clients?attention=blocked|calls_to_review|intake_to_review|behind_pace`** narrows the list to the clients behind each Home "Needs you" count, using the same rules as `GET /overview` `attention`, so the card's number and the list match. If the server ignores it, the Clients list shows every client under the filter chip.
- **`ClientRow`** may also carry `callsToReview` and `intakeToReview` (counts). The app treats both as optional.
- **`GET /clients/:id/activity`** accepts `limit` like every list (default 30). The bundle carries the first page.

## 3. `GET /meta` keys for this domain

`clientStatuses, onboardingStages (with dayRange, staff only), taskKinds, taskStatuses, taskOwners, accessProviders (17), accessMethods, accessStatuses, assetKinds, approvalKinds, approvalStatuses, agreementStatuses, callStatuses, callSources, callReviewStates, disqualifyReasons, memberRoles, memberStatuses, guaranteeCountRules, guaranteeStatuses, guaranteePaces, guaranteeDefaults { target, windowDays, countRule }, intakeSchema, planOptions, activityEvents`. Options are `{ value, label }`, with `tone` where the screens show a badge.

`planOptions` is `{ id, name, kind: growth|product, guarantee, needsCarePlan }[]` for Convert, Grow, Let's Talk and Webline. It is named `planOptions` (not `plans`) so it never collides with the Pricing slice of the same response.

## 4. Rules the app relies on

- **List order**: most recently updated first, ties by business name. Status `active` (the default) is everything except churned and lead. `q` matches business name and email. Test clients appear only for owners with `test=1`; managers get 404 for a test client by id.
- **POST /clients**: an existing client with the same email (case-insensitive) is reused and updated (business name, and contact name, phone, plan, strategist when sent). A new client starts as `pending`; with a plan, an onboarding run starts from that plan's active templates. The client's owner login is created with it. `sendInvite` missing means no invite (`"skipped"`). A person who already has an active login is not re-invited.
- **Go live**: `409 already_live` when already live. On success: status `live`, `liveDate` today (Toronto), and for eligible clients the guarantee clock starts today with `guaranteeStatus: running`, unless it was started before (going live again after a pause keeps the original window) or the guarantee is waived. An open run at an earlier stage moves to `optimizing`.
- **Plan change** (`PATCH /clients/:id` with `planId`): `guaranteeEligible` follows the new plan unless the same request sets it, and `billing.carePlan.required` follows the plan.
- **Onboarding**: `PATCH` with `stage: "complete"` completes the run exactly like `POST /complete`. Unblocking (`blocked: false`) clears `blockedReason`. A new task defaults to the run's derived stage, owner `tekmadev`, kind `general`, not required. A client-owned task is visible to the client (activity `visibleToClient: true`).
- **Intake review** also closes the open "Review the intake" checklist task.
- **Access grants**: `client_says_done` stamps `clientDoneAt`; `verified` stamps `verifiedAt` and `verifiedBy`; moving back to `requested` or `pending_client` clears them. An empty `note` keeps the old note; `null` clears it.
- **Calls**: calls logged by hand (`POST /clients/:id/calls`) are qualified at once and count. A call counts when it is qualified, booked inside the guarantee window, and its status passes the count rule (`booked`: anything but cancelled; `showed`: showed only). `PATCH { qualified: false }` needs a `disqualifiedReason` (sent or already set); `qualified: null` puts it back to review. `review { counts: false }` keeps a preset reason, or uses `other`.
- **CRM mapping**: ids are 20 letters and numbers. `locationId: null` removes the mapping. Calendar ids are trimmed and de-duplicated. Re-saving the same sub-account keeps `pendingToApply`; a new one starts at 0.
- **Members**: `PATCH { status: "active" }` turns a person back on; someone who never logged in goes back to `invited`. `POST /members/:id/invite` sends an invite to invited people and a reset link to active ones; disabled people get `409 member_disabled`.
- **Templates**: the app sends the JSON editor's raw text as `payload` (a string); the server parses it (`400 json` when invalid). A parsed JSON value is accepted as is. For a new key, `title`, `stage`, `owner` and `kind` are required; on an existing key, missing fields keep their values. Changes apply to new runs only.

## 5. Error codes

Documented codes, with the status the mock uses:

| Endpoint | status | code | message |
|---|---|---|---|
| `POST /clients`, `PATCH /clients/:id` | 400 | `required` | Business name and a valid email are required. |
| `POST /clients/:id/go-live` | 422 | `care_required` | "Webline needs an active Webline Care plan before the site goes live, and this client does not have one. Start Webline Care first, or go live without it." |
| `PUT /clients/:id/crm-location` | 400 | `crm_location` | "That sub-account id does not look right. Copy it from the CRM: it is 20 letters and numbers." |
| same | 400 | `crm_calendar` | "\"<id>\" is not a calendar id. Calendar ids are 20 letters and numbers, one per line." |
| same | 409 | `crm_taken` | "That CRM sub-account is already mapped to <business name>." |
| same | 422 | `crm_own` | "That is Tekmadev's own CRM account. Use the client's sub-account id." |
| same | 500 | `crm_db` | "Could not save the CRM mapping. Nothing changed. Try again." |
| `POST /clients/:id/members` | 400 | `email` | Enter a valid email. |
| `POST /members/:id/invite` | 502 | `invite` | Invite email failed. Check the Supabase auth email settings. |
| `PUT /onboarding-templates/:key` | 400 | `json` | Payload must be valid JSON. |

New codes we need (please confirm or rename):

| Endpoint | status | code | message |
|---|---|---|---|
| `GET /clients` | 400 | `status` | Unknown status filter. |
| `PATCH /clients/:id` (and `POST /clients` for a manager hitting a test client's email) | 409 | `email_taken` | Another client already uses that email. |
| `POST /clients/:id/go-live` | 409 | `already_live` | This client is already live. |
| any write on a completed run or its tasks | 409 | `run_complete` | This onboarding is complete. A completed run cannot be reopened. |
| `POST /onboardings/:id/tasks` | 400 | `title` | Enter a task title. |
| `PATCH /tasks/:id` | 400 | `status` | Pick a status from the list. |
| `POST /intakes/:id/review` | 409 | `not_submitted` | Only a submitted intake can be marked reviewed. (or "This intake is already reviewed.") |
| `POST /clients/:id/access-grants` | 400 | `provider` | Pick what we need access to. |
| `POST /clients/:id/approvals` | 400 | `title`, `url`, `task`, `attachment` | Enter a title. / Enter a full link starting with https://. / That task is not on this client's checklist. / Add a label and a full https:// link for the attachment. |
| `POST /clients/:id/calls` | 400 | `contact`, `email`, `source` | Add a name, phone or email for this call. / Enter a valid email. / CRM calls arrive through the sync. Pick another source. |
| `PATCH /calls/:id` | 400 | `reason` | Pick why it does not count. |
| `POST /calls/:id/review` | 400 | `counts` | Say whether the call counts. |
| `POST /clients/:id/members` | 409 | `member_exists` | That person is already on this team. |
| `POST /members/:id/invite` | 409 | `member_disabled` | This person is turned off. Turn them back on first. |
| `POST /clients/:id/activity` | 400 | `kind`, `text`, `url` | Pick an internal note or an update to the client. / Write something first. / Enter a full link starting with https://. |
| `PUT /onboarding-templates/:key` | 400 | `key`, `title` | Use lowercase letters, numbers and dashes for the key. / Enter a title. |
| any of the above | 400 | `input` | Check the highlighted fields. (generic, always with `fields`) |
| any unknown id | 404 | `not_found` | That client no longer exists. (or task, call, file, person, template...) |

Every 400 carries `fields` keyed by the body field name, so the forms can show the error inline.
