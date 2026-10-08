# Decisions

Choices made where the brief is silent or where the current libraries forced a call. Newest phases append at the bottom.

## Phase 1: foundation

### Platform and versions
- **Expo SDK 57 with its pinned native versions** (RN 0.86.3, Reanimated 4.5.1, Gesture Handler 2.32, Skia 2.6.2). Newer npm releases exist (Reanimated 4.7, Gesture Handler 3.3, Skia 2.13) but they match SDK 58 (still in beta). Mixing them with SDK 57 is not validated by Expo, so we stay on the pinned set and upgrade with SDK 58.
- **Routes in `app/` at the repo root**, as the brief's architecture shows, with feature code in `src/`. Route files only re-export screens from `src/modules`.
- **JS tabs (`expo-router/js-tabs`) with a fully custom tab bar.** Native tabs cannot render the floating pill with the sliding gold indicator.
- **New Architecture, Hermes and the React Compiler are on.** Shared values use `.get()` / `.set()` so the compiler stays happy.
- **Node 22.23 via nvm** (`.nvmrc`). React Native 0.86 needs 22.13 or newer; the machine had 22.12.

### Brand and assets
- **Every icon is rendered from the four logo paths in the brief** by `scripts/generate-icons.mjs` (launcher, adaptive foreground, themed monochrome, splash light/dark, notification silhouette, shortcut icons). The paths are extracted byte for byte from PROMPT.md.
- **Adaptive icon mark at 58% of the canvas**: the mark's corners reach a radius of about 1220 viewBox units, so 58% keeps them inside the 66dp safe circle.
- **Launcher label "Tekmadev", app name "Tekmadev Admin"** via a small local config plugin that gives the launcher activity its own label.
- **Geist and Geist Mono are embedded at build time** as Android XML font families (`fontFamily: 'Geist'` + `fontWeight`), so no font loads at runtime and the first frame already has the right type.

### Data and security
- **Session storage**: the Supabase session lives in an AES-256 encrypted MMKV store whose key is generated once and kept in the Android Keystore (expo-secure-store). That is the "encrypted large-value adapter" the brief asks for. The query cache and drafts use an encrypted store too, because they hold client names, emails and phone numbers.
- **`allowBackup: false`**: an Auto Backup restore would bring back encrypted files without their Keystore key. As a second guard, a newly created key wipes any old store files.
- **Sensitive media permissions are blocked** (READ_MEDIA_*, RECORD_AUDIO). DETECT_SCREEN_CAPTURE stays allowed: it is a normal install-time permission, and expo-screen-capture needs it on Android 14+ or the app fails to start. Saving a QR code to Photos uses MediaStore, which needs no read permission on Android 11+.
- **Auth modes**: `EXPO_PUBLIC_AUTH_MODE=mock` signs in against fixture staff accounts (owner and manager, plus a portal user that `/me` rejects). `supabase` uses the real Tekmadev project. With real Supabase sign-in and the mock API, `EXPO_PUBLIC_MOCK_OWNER_EMAILS` lists which real emails the mock `/me` treats as owners. Without that, a real account is rejected with "That account is not allowed here.", like the server would.
- **TanStack persistence uses the async storage persister** (the sync persister is deprecated in 5.104). It is backed by synchronous MMKV, so restore is effectively instant.
- **The mock transport behaves like the server**: same envelope, status codes, error codes and messages, owner-only 403s, idempotency keys honoured (a repeated key returns the first response), opaque cursors, microsecond timestamps, and in-memory state that mutations change. Dev-only controls (Kit screen) can fail requests, go offline, expire tokens and force a 426.

### Motion and UI
- **Our own bottom sheet** instead of `@gorhom/bottom-sheet`. Version 5.2.14 crashes on any Dimensions change with this worklets version (keyboard show/hide included) and has several open Android bugs. Ours is built on Reanimated, Gesture Handler and keyboard-controller, rendered in a root portal (same window, so FLAG_SECURE covers it), and closes on Android back.
- **Hermes Intl is limited** (only DateTimeFormat and NumberFormat), so plurals and relative times are small hand-written helpers rather than Intl.PluralRules / RelativeTimeFormat polyfills.
- **The loader keyframe math is pure, unit-tested code** (`src/loader/keyframes.ts`) shared by every variant. Its CSS cubic-bezier solver runs as a worklet on the UI thread.
- **Display line height is 1.16, not the brief's 0.94.** Geist's natural line is 1.30em, and Android trims a short line box equally from the top and bottom, which clipped the descenders of g, p, y, j and q in large titles (found by the owner on a Galaxy S26 Ultra). 1.16 is the tightest value that keeps the full descender. Letter spacing (-4%) and weight (800) are unchanged. Headlines moved from 1.18 to 1.22 for the same reason.
- **Mock sign-in imports the fixture accounts statically.** A dynamic `import()` made the dev build fetch a separate lazy bundle and hang on "Signing in" (and broke Jest). The fixtures are already in the bundle through the mock transport, so nothing is lost.
- **Owner decision: the Inbox is not a tab.** It opens from a bell at the top right of every tab header (next to search), with the unread count on the bell (gold, red when a critical item is unread, "99+" above 99). This replaces the Inbox tab in brief section 7 and frees a tab slot for something more important later. The tab bar keeps generic per-tab count badges for that future tab. Deep links to /admin/notifications still open the Inbox.
- **Owner decision: Analytics takes the freed tab slot.** Tabs are Home, Customers, Analytics, Marketing (owner only), More. Analytics is visible to managers too (the brief already gives them Analytics). Ads stays under More, Insights (owner only), so managers see no Insights section in More.
- **Owner decision: no side drawer.** The full menu stays in the More tab (thumb reach on large phones, one navigation system, and no conflict with Android's left-edge back gesture). More mirrors the web admin sidebar's grouping.

## Phase 1: details by area

Recorded by the engineers who built each area. The mock API decisions describe how the mock behaves where the contract is silent; the live server may differ (see api-requests.md).

### Mock API: clients

- The meta key is `planOptions`, not `plans`, so it cannot collide with the Pricing slice of GET /meta.
- Task writes return `{ task, run }`, call writes return `{ call, guarantee }`, and go-live returns `{ client, guarantee }`, so the app never recomputes stage, progress or pace.
- List stats ignore the status chip and search; the list is sorted most recently updated first.
- Managers get 404 for test clients by id, matching how Inbox treats test rows.
- A hand-created client starts as `pending`; an onboarding run is created only when a plan is chosen; a missing `sendInvite` means no invite is sent.
- Reuse by email is case-insensitive; changing a client's email to one another client already uses returns 409 `email_taken`.
- Go-live starts the guarantee clock only once (going live again after a pause keeps the original window) and moves an earlier-stage run to `optimizing`.
- Changing the plan resets guarantee eligibility to match the new plan, unless the same request sets it.
- `PATCH` an onboarding run with `stage: complete` does the same as POST complete; any later write to that run or its tasks returns 409 `run_complete`.
- Unblocking a run clears its blocked reason.
- Reviewing the intake also closes the "Review the intake" checklist task.
- Requesting an approval with an existing title creates the next version and supersedes the pending one.
- Calls logged by hand count straight away. A source of `crm` is refused on hand-logged calls. Disqualifying a call requires a reason.
- Access notes: an empty note keeps the old one, `null` clears it. Moving a grant back to requested or pending clears its client-done and verified stamps.
- CRM errors: format problems are 400, already mapped is 409, Tekmadev's own account is 422, a failed save is 500. `locationId: null` removes the mapping.
- Adding a member whose invite bounces returns 201 with `invite: failed`. Resending to that member returns 502 `invite`. Disabled members get 409 `member_disabled`.
- The app sends the template payload editor's raw text as a string; the server parses it.
- Any email containing "bounce" fails delivery in the mock, so the failure toasts can be seen.
- Fixture images use picsum.photos URLs (from the earlier run), so the viewer has real pictures to show.

### Mock API: leads, tools, billing, analytics, ads

- Lead statuses are new, booked, contacted, qualified, won, lost and cancelled. New is gold, booked is ok, the rest are muted, and the labels come from GET /meta.
- An unknown filter or range value returns 400 with codes `source`, `status`, `need`, `kind` or `range`, not an empty list.
- Every free tool submission also creates a `lead_magnet` lead. The lead id is `ld_` plus the submission's suffix, and the submission detail links it through `leadId`.
- Tool `answers` and `result` values are display text formatted by the server. `leak` is null, never 0, when the tool could not work it out.
- The billing `summary` is on both list responses and ignores filters. `bnpl` counts only Klarna, Afterpay or Affirm payments that went through.
- Payment method is one of card, klarna, afterpay, affirm or link, plus a `bnpl` flag. Cancellation details are readable text: `{ reason, feedback, comment }`.
- Billing meta keys are prefixed `billing*` so they cannot collide with Test mode's keys.
- Analytics weeks start on Monday. A month point's `t` is `YYYY-MM-01`.
- Analytics `prevTotal` is null when the previous period starts before `trackingSince`. Tracking started 470 days ago, so 1 year and All time show "Tracking started".
- Analytics sources, devices and countries each add up to the total. Top pages are capped at 10.
- Ads `cost` is read as spend per visit, lead, booked call and sale. `days` includes days with zero spend. Campaigns and ads are sorted by spend.
- The ads mock starts with a failed sync from 361 minutes ago, to match the inbox's "Meta pull failed" row.
- Every 3rd refresh returns 502 `upstream` with the brief's message and bumps that inbox row (through `recordNotificationEvent`). A refresh while not connected returns 503 `not_configured`.
- The range chip labels are constants in the schema files, because GET /meta has no ranges.

### Mock API: blog, email, links, CRM

- Blog posts are written with `authorId` and `categoryId`. PATCH also accepts `status`, so the Details sheet saves in one call.
- A typed slug that is taken (including by a trashed post) gives 409. A slug the server generates gets `-2`, `-3` instead. Changing the title never changes the slug.
- `publishedAt` is the latest time the post went live, and it is kept after unpublishing or archiving.
- Publishing an empty body gives 422 `empty`. This is an assumption, flagged in `docs/api-requests/blog.md`.
- A revision is recorded on create and on every PATCH, but not on publish or status changes.
- Reading time is words divided by 225, rounded up, at least 1. It is 0 for an empty body.
- Parser behaviour:
  - A blank quoted line becomes a paragraph break inside the block.
  - `list.ordered` is always sent.
  - `cite` and `caption` are never produced, because the supported syntax can't write them.
  - `#####` headings and incomplete CTA blocks become paragraphs.
  - Nested list items are flattened.
  - A numbered line only interrupts a paragraph when it starts at 1.
- Category names are trimmed and duplicates checked ignoring case. The slug is made at creation (with `-2` if taken) and never changes. Deleting a category also clears it from trashed posts.
- Authors have a `role` line under the name in the Preview. The second author is "Tekmadev Team", with no photo.
- Campaign opens and clicks count from the campaign's `createdAt`, so re-adding a key starts at zero while the event log keeps everything.
- `new30d` counts every signup in the last 30 days, whatever the status is now. The 30-day open and click stats include deleted campaigns.
- The overview's recent events are the latest 25, and each has an `id`.
- Countries are names ("Canada"), not ISO codes, because Hermes has no `Intl.DisplayNames`.
- A template's `key` is also its campaign key. `previewHtml` uses sample values and has no tracking pixel, so previews never count as opens.
- The staff unsubscribe source is "via the admin". Unsubscribing someone who isn't active gives 409 `not_active`, and an unsubscribe queues DND to the CRM.
- `crm_erase` returns 500. That status is not confirmed by the contract.
- A link's destination defaults to `/`. Only `https://` external URLs are accepted, and paths can't start with `//`. Link slugs max out at 60 characters, campaign keys at 64.
- Link PATCH ignores every field except `active`. Deleted links keep their click history, which can still be read by `linkId`.
- `PUT /crm/switches` returns `{ switch, queued? }`; I added `switch` to the contract's shape. `POST /crm/verify` returns the connection object.
- A failed verify stops every switch that is on. A reconcile safety stop keeps reconcile not running until a run succeeds.
- Sync only handles directions whose switch is on. Retry only takes signed items; `nothing` is 422.
- I wrote the CRM error messages myself, because the contract table only describes them.
  - Statuses: `not_configured` 503, `unverified` 422, `probe`/`sync`/`reconcile` 502.
  - Resubscribe refusals: `resub_refused` 422, `resub_notfound` 404, `resub_stale` 409.
- The generic validation code is `input` ("Check the highlighted fields."), matching the clients domain.
- Fixtures use a seeded random generator, so the data is the same on every reload.

### Mock API: pricing, coupons, loader, test mode, team

- A Stripe sync failure comes back as an error (502, code `stripe`) whose message names what was refused and what saved. Fields that saved stay saved, and the screen should refetch GET /pricing.
- `stripe: 'skipped'` means no price changed (or Stripe is not configured). A plan's first saved price sets `inStripe: true`.
- Product `status` is computed by the server: `selling`, `paused` (Purchasable off) or `not_in_stripe`. `currency` is added on plans, products and amount discounts.
- A new 400 `compare_at` refuses a compare-at price at or below the one-time fee.
- PUT /pricing/sales-tax returns the whole `salesTax` block. `salesTax.test` is null when the sandbox is not configured.
- Fixture prices: Let's Talk starts as "Not yet in Stripe". Sandbox tax is "On, not charging" to show the warn state.
- Coupon scopes are `growth_monthly`, `growth_setup` (one-time), `webline` (one-time), `webline_care` and `anything`.
- One-time scopes always get duration `once`. Monthly scopes must send a duration (new 400 `duration`).
- Coupon codes are 3 to 40 characters and uppercased. Duplicates are checked case-insensitively, including disabled coupons.
- Percent off allows up to 2 decimals. Expiry must be a real date after today in Toronto (today is refused).
- Other new coupon codes: 400 `type`, `scope`, `label`.
- Coupon errors report every bad field; the top-level code is the first error in form order.
- `dealUrl` is `https://www.tekmadev.com/deal/CODE` (placeholder, real format asked for in the docs).
- Auto codes look like `TKM-XXXX` with no 0, O, 1 or I. Disabling twice is idempotent (200).
- Loader PUT clamps out-of-range values instead of rejecting them, and rounds to whole ms or 2 decimals. A missing or non-number value gives a new 400 `loader`.
- Test purchases get an `id`, a status (`paid`, `pending`, `failed`, `refunded`) and amounts with tax included. Purge needs `confirm: true` (new 400 `confirm`).
- Team: env owner removal gives 422 `owner`, not 403, because a 403 would trigger the global "owner only" handler and leave the screen.
- Other new team codes: 422 `self`, 409 `dupe`, and 400 `email`, `password`, `role`, `name`.
- GET /team is ordered env owners, other owners, then managers, oldest first in each group. Owners listed in `EXPO_PUBLIC_MOCK_OWNER_EMAILS` show as locked env owners.

### Mock API: session and inbox

- The inbox uses a keyset cursor, so a row that bumps to the top between page loads is not repeated on the next page. A malformed cursor gets 400 `cursor`.
- Quiet categories are left out of `unread`, `criticalUnread` and `filter=unread`, so the list always matches the count. `needsAction` counts open rows whether quiet or not.
- `filter=action` shows open needs-action rows only.
- With `test=1`, the summary in that list response counts test rows too, so the header matches what's on screen. Managers sending `test=1` simply get no test rows.
- A manager asking for `category=team` or `audience` gets an empty page. Changing Team or Audience prefs returns 403.
- Owner-only events beyond Team and Audience: Stripe webhook, Meta pull failed, Meta token expiring, CRM stuck, reconcile halted, coupon redeemed.
- Read state is stored as "read up to this time", so a bump makes the row unread again for everyone automatically. A bump also reopens a resolved row.
- `resolved_by` is a display name (name, else email). Resolving an already resolved row keeps the first person.
- Mutations return the changed rows plus a fresh badge summary, which excludes test rows.
- Starting prefs: the owner has Audience quiet with push off and Team push off; the manager has Sales quiet with push off.
- Devices: one row per push token, and only Expo push tokens are accepted. An empty profile name clears it (max 80 characters).

**Endpoints I added beyond the contract** (both in the mock and written up in `docs/api-requests/notifications.md`)
- `GET /notifications/:id`, for a push tap on a row with no link.
- `POST /notifications/test-push { deviceId? } -> { sent }`, for "Send a test notification", returning 422 `no_devices` when there's nothing to send to.
- New error codes: `filter`, `category`, `cursor`, `ids`, `seen`, `resolved`, `not_actionable`, `input`, `token`, `platform`, `app_version`, `name`.

### Charts, approvals, jobs, QR

- Y-axis labels are native `<Text>` laid over the chart (Geist Mono 11) so they stay crisp and follow font scale.
- The area line is a monotone curve with evenly spaced points (labels are text, never parsed as dates), so it never dips below the baseline or invents a peak.
- Gridline steps come from 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 so the top line sits near the peak. Whole-count series never get fractional ticks.
- Scrub: a sideways swipe scrubs at once, a vertical swipe lets the page scroll, and a 220ms long press also scrubs.
- The scrub tooltip sits at the top and moves to the bottom when the point is near the top.
- The chart draws in again when the series changes (a new range), not when a refetch returns the same data.
- Donut: if exactly one row is left after the top 7, it keeps its own name rather than becoming "Other", but uses the Other colour.
- Donut: zero rows are dropped. "Other" uses `lineStrong`. Each scheme has its own colour order so neighbouring slices contrast most.
- Donut: tapping the centre or the same slice clears the highlight, and the selection survives a refetch (matched by label).
- HBars keep the API's order, size bars against the largest row shown, and give tiny non-zero values a 1.5% sliver.
- Sparkline scales to its own min and max, does not animate, and is hidden from TalkBack.
- ApprovalCard: all actions in one card share a submit group, so only one runs at a time.
- ApprovalCard reject: the reason is required ("Add a reason.", 500 chars max), and the sheet keeps the text open if the server call fails.
- ApprovalCard: previews taller than 360dp fold behind "Show full preview" with a fade and open on the soft spring.
- If approving is irreversible for a module (publish, send), that module wraps `onApprove` in its own HoldToConfirm. The card does not.
- Approval Markdown only opens http(s) and mailto links, in a Custom Tab. Other link schemes show as plain text.
- The diff compares word by word, and falls back to marking each side whole past 400 words per side. A broken image shows its alt text.
- JobProgress steps advance on elapsed time and hold on the last step, so they never claim the job is done.
- TalkBack hears the JobProgress title and each new step, not the ticking clock.
- `useJobRunner` refuses a second start while one is running (returns `busy`). Cancel aborts the request and ignores a late answer, and leaving the screen cancels. A timeout is flagged `timedOut` and never retried.
- QR: always a white card with near-black modules in both themes, so it scans and prints. Error correction H, 4-module quiet zone.
- QR: module size snapped to whole device pixels. The logo sits on a cleared block of whole modules, always under 20% of the code width.
- QR: the PNG is saved as `tekmadev-qr-<last path segment>.png`. A value too long for a QR shows "This link is too long for a QR code."

### Core components

- **Tab bar background:** `bg2` at 92% with a 1px line border and a warm shadow, not expo-blur. On Android the blur needs a BlurTargetView around the content, and I can't verify it without a device.
- **Tab indicator:** a gold pill at 15% behind the gold active icon, rather than the solid gold gradient, which would hide the icon.
- **Tab bar and keyboard:** the bar fades and slides away while the keyboard is open.
- **Pull resistance:** `150 * (1 - e^(-drag/200))`, so the 72dp trigger needs about 130dp of finger travel. A pull only counts when the drag starts at the top.
- **Pull haptic:** the lock haptic comes from `PullToRefreshIndicator` only, so Screen doesn't fire a second one.
- **Large title:** 0.35 parallax and a fade. The compact title fades in between 45% and 85% of the title block's height.
- **Header hairline:** it appears with the collapse, or after 12dp of scroll on screens without a large title. The compact title is left-aligned, like Android.
- **Count-up:** frames are formatted on the JS thread (so Intl money works), and the UI thread writes them into a read-only TextInput. At rest the number is a plain `<Text>`. An interrupted count continues from the number on screen.
- **Trend chip tones:** up is ok, down is warn (not signal), flat is muted. Each card can override.
- **Missing values:** StatCard shows "Not available", KeyValue "Not set", MetricRows "n/a" (TalkBack reads "not available"). None of them ever shows 0.
- **Swipe actions:** they fire on release past 40% of the row width. `haptics.medium` plays when the action locks in, the same as the pull lock, then the row springs back. Each action is also a TalkBack custom action.
- **Skeleton:** the shimmer is an RN `experimental_backgroundImage` linear-gradient band over a base of ink at 6 to 7%, which works on both bg and cards. A group shares one delay and one animation clock.
- **Grain:** multiply and screen are reproduced as alpha through a ColorMatrix, because Android views can't blend with what's underneath. Light mode gets dark specks, dark mode gets warm light specks, with the noise contrast tripled.
- **ProgressBar:** a full-width fill slides in with `springs.soft` instead of animating width, so there's no per-frame layout and the rounded end keeps its shape.
- **Dividers:** 1dp rather than hairlineWidth, because an 8% line one physical pixel tall all but disappears on dense screens.
- **Edge-to-edge rows:** FilterChips and ScrollTabs cancel the enclosing Screen's gutter (via GutterContext) and keep the first item on the gutter line.
- **Section:** 22sp headline, 28dp between sections.
- **Avatar:** one initial on goldTint by default (two optional).
- **Touch targets:** chips are 36dp tall with 48dp touch slop; the segmented control is a 44dp track. Selection haptics fire only when the value changes.
- **Empty state:** the LogoMark watermark is at 14% opacity.
- **Retry:** the button shows "Retrying" with the black hole while the promise `onRetry` returns is running.
- **Copy:** copying shows "Copied." (or "Could not copy that." if it fails). Tapping a phone number or email opens the dialer or mail app; a long press copies it.
- **Offline banner:** if the data is from an earlier Toronto day, the date is added ("at Sep 28, 9:05 AM"). With no time at all it says "Offline · showing what was loaded earlier".
- **Stage tracker:** an unknown current stage marks every stage as not started. Each stage is at least 84dp wide, and the row scrolls when they don't fit.

### Form controls

- Autosave writes at most every 3s while typing, rather than waiting for a pause, so steady typing still gets saved. It also saves on blur, on unmount and when the app goes to the background.
- The "Restore your unsaved changes?" offer appears only when the draft differs from the server copy and was saved after the server's `updatedAt`.
- The time picker is one tap per choice with no wheels: AM/PM, a 12-hour grid, and :00/:15/:30/:45. "Other time" accepts typed times like "2:41 PM", "14:41", "1441" or "noon".
- `DateTimeField` starts at 9:00 AM today. When there is a `min` and that time has already passed, it starts at the next quarter hour instead. Closing the sheet without "Done" keeps the old value.
- On the spring-forward day a skipped time (2:30 AM) is saved as 3:30 AM. On the fall-back day an ambiguous time is saved as the first one. The sheet's summary line shows the time that will actually be saved.
- `DateField` picks the day and closes on a single tap; there is no confirm button.
- Field values read "Wed, Sep 30, 2026" (date) and "Thu, Oct 8, 10:00 AM" (date and time). The date-time field's help line always ends with "Toronto time".
- A value outside the allowed range shows "Pick a date on or after Oct 2, 2026." Coupons should pass `rangeError="The expiry date must be in the future."` to use the brief's copy.
- Slider:
  - The thumb snaps to each step when there are 24 steps or fewer, and follows the finger freely above that.
  - Step dots are drawn when there are 12 steps or fewer, and tapping the track jumps the thumb there.
  - For TalkBack the range is given as step positions, because Android rounds the range values to whole numbers. The spoken text is the formatted value.
- `ChipsInput` adds a chip on comma or enter, and pasting "a, b, c" adds three. A word left in the box when leaving the field is kept. The first backspace in an empty box marks the last chip, the second removes it. Duplicates are matched ignoring case and show "Already added: x." A full list shows "Up to 10 keywords."
- The `Switch` off track is `ink5`. The thumb turns into the `InlineLoader` while `pending`.

### Sheets, toasts, buttons

- `SheetProvider` is the overlay root: app, then sheets, then toasts. `ToastHost` inside it registers itself, so toasts draw above open sheets.
- While a sheet is open, the app underneath is hidden from TalkBack and back closes the top sheet. A non-dismissible sheet swallows back.
- Sheet content renders at the root: it sees app-wide providers but not screen context (`useNavigation`, `useFocusEffect`, `useLocalSearchParams`, a screen's own providers). Pass those values in as props.
- Every sheet is its own SubmitGroup and cannot be dismissed while one of its submit buttons runs.
- A sheet that doesn't scroll drags from anywhere. A scrollable sheet drags from its header, or from the list when it is at the top; pushing up on a lower snap point expands the sheet before the list scrolls.
- Sheets with several snap points open at the lowest one and expand to the top when the keyboard opens.
- Keyboard: the sheet lifts by the keyboard height minus the gesture-bar inset, and its max height shrinks so the top edge stays on screen. Android scrolls the focused input back into view.
- Keyboard values come from `useKeyboardContext().reanimated` instead of `useReanimatedKeyboardAnimation`, so each sheet does not toggle the window input mode (app.json already sets resize).
- A 240dp surface skirt under the sheet hides spring overshoot; release velocity is capped at 2400dp/s.
- The scrim fades in over 220ms and thins as the sheet is dragged down.
- If an owner ignores `onClose` after a drag-to-close, the sheet springs back.
- Destructive and gold buttons use `onInk` text, not white: white on the dark-theme signal colour is about 3.6:1, below the brief's 4.5:1. Gold is `goldDeep` in light and `gold` in dark.
- PendingButton keeps its width by laying out both the idle and pending labels from the start, rather than measuring idle width. This also covers pending labels longer than the idle one.
- Offline: the hint shows under each button, and the accessibility hint says "You are offline". In a row of buttons, set `offlineHint={false}` on all but one.
- Errors: `onError` receives the error if given; otherwise the API message shows as `notice.err`, skipping 401, 403, 426 and aborted requests. The button always returns to idle and nothing rejects unhandled.
- HoldToConfirm fills with solid signal or ink, and a copy of the label in `onInk` appears as the fill passes. A 25% tint left the label at about 3.4:1 in dark mode.
- HoldToConfirm motion: eased fill normally, linear with reduced motion. Ticks come every 150ms on a separate clock; the finger can drift 24dp. After success the full fill holds 450ms before resetting.
- HoldToConfirm with TalkBack: "Hold to move to trash" becomes "Move to trash" with hint "Double tap to confirm". Without TalkBack it still exposes an activate action for switch access.
- Toasts: newest on top with the older one pushed down below it, both readable, at most two. A third dismisses the oldest for good.
- Toast auto-dismiss honours Android's "Time to take action" setting and pauses while touched. Ok and err toasts carry check and alert icons, so tone is not colour alone. TalkBack gets a "Dismiss" action.
- ActionSheet closes first and runs the action on the next frame. It scrolls above 7 items.
- ConfirmSheet layout is the message, then HoldToConfirm above a full-width ghost "Cancel".
- Menu renders nothing when it has no items.

**Needs checking on a device** (my best guesses, not observed)
- Handing the drag between the sheet and its scroll view.
- The sheet's max height shrinking as the keyboard opens, with the focused input staying visible.
- Toasts drawing above sheets.
- The TalkBack focus moving to the sheet title when it opens.

### Formatting utilities

- Compact numbers and percents are hand-built, not `notation: 'compact'` or `style: 'percent'`, so the text is the same on every Android Hermes version and in tests.
- Rounding is half away from zero with float noise removed (14.5% shows as 15%), and nothing ever prints "-0".
- `formatChange` returns "" for null, NaN or Infinity, so the screen can show "Nothing in the period before". Anything that rounds to 0% reads "No change".
- `formatBytes` uses decimal units (1000), like Android's file manager.
- `formatPhone` only formats valid North American numbers; anything else is returned trimmed.
- `initials` uses the first and last word, skips punctuation, and uses the part before the @ when given an email.
- `truncate` counts characters so an emoji is never split, and never leaves a space before "…".
- Slugs and coupon codes strip accents ("Café" becomes "cafe").
- `isValidDestination` refuses "//host" and "/\host" (both open another website, an open redirect) and anything with spaces.
- `relativeTime` counts whole elapsed minutes and hours, rounding down.
- A deep-link test checks that every pathname the mapper produces exists as a file in `app/`, so a renamed route fails CI.

### The black hole loader

- The beat clock is a UI-thread frame callback, not `withRepeat`, so live slider changes apply mid-beat with no restart; progress holds during the rest so the canvas doesn't redraw an identical logo.
- All animated marks share one Skia scene with a small canvas margin, because the outer arc tips reach 1217 viewBox units (past the 1200 half box) and would clip while spinning.
- `InlineLoader` uses `buttonBeatMs`, since small marks read better on the quicker beat.
- `TopProgress` animates `scaleX` from the left edge instead of width (no layout per frame); mounting inactive shows nothing.
- `PageLoader` beats from mount while invisible, so it appears mid-beat like the website; the delay is read once at mount.
- Pull to refresh: fully visible by 30% of the trigger distance; the lock haptic re-arms below 0.85; overpull adds at most 10% scale, with resistance; the shrink spring is clamped (no wobble); after leaving it stays hidden until the pull is back near 0.
- Boot splash exit: soft spring slide and shrink, background fades over 450ms, mark fades in the last 300ms (ease-in). A beat in progress finishes on the way and no new one starts. Touches pass through as soon as the exit starts.
- Boot splash with reduced motion: no intro wait; pulse while waiting; 250ms fade.
- `BreathingMark`: a 3000ms beat inside a 6s cycle (about 1.9s of motion, 4.1s rest), first breath 1.5s after mount, gentle values 0.94 / 0.985 / 0.9.
- Accessibility: `BlackHole` is hidden from TalkBack unless given a label; `PageLoader`, `InlineLoader` and `BootSplash` announce a "Loading" progress bar.
- Our own timings use `ReduceMotion.Never`; the reduced-motion visual is the opacity pulse we draw ourselves.

### Kit screen

- Theme: a System/Light/Dark SegmentedControl in a card at the top, plus a sun/moon IconButton in the header that flips light and dark from anywhere. Both write `usePrefs.theme`.
- "Jump to" is sticky FilterChips (`allowDeselect`) with a scroll spy that lives inside JumpRow, so scrolling never re-renders the demos. Tapping the current chip returns to that section's top.
- Lazy sections: Cards and lists, States, Forms, Charts, Automation and QR mount once they are within one screen of view, then stay mounted. Until then they hold an estimated height.
- Scroll anchoring: when a section above the reader changes height, the screen scrolls by that amount in the next frame, so nothing on screen moves.
- Jump glides pause lazy mounting and the scroll spy for 900ms, because Android's smooth scroll has no completion callback.
- Demos with animated Skia canvases (marks, button spinners, PageLoader, the pull indicator, BreathingMark, JobProgress, the pending Switch) unmount while more than 240dp off screen and keep their measured height.
- The Kit screen has a real pull to refresh (1.6s) so the Screen's black hole pull can be tried live.
- The TopProgress toggle drives both a standalone Header demo and the Kit's own header hairline.
- The boot splash replay renders BootSplash (`exitTo="center"`) over the screen and becomes ready after 1.8s.
- StatCard, ApprovalCard and Card demos have no wrapping card (`bare`), since they are cards themselves.
- Sample data is deterministic (seeded), and chart labels are built from Toronto dates ("Sep 12").
- Copy is taken from the brief where it exists:
  - the trash confirm message
  - the password, slug and destination errors
  - the toasts: "Saved. A version snapshot was recorded.", "Link created. Share …", the Meta refusal
  - "Replay the delay" (I used the brief's wording, not "Replay delay")
  - "Pulling from Meta…"
  - the email-is-login help text
- Mock API section:
  - "Require version 9.9.9" sets `minVersion`.
  - "Expire tokens" and the version switch say "Reload the app to undo", because the sign-out and the update screen have no way back while they are on.
  - "Send a test request" calls GET /meta through the real client.
  - "Fail the next request" queues a one-shot failure.
  - "Reset everything" also turns off simulated offline.
- Section eyebrows are numbered 01 to 14.

### Mock API: overview and search

- `GET /overview` also sends `attentionClients`, the clients behind each client card with a web path to the right section (`#onboarding`, `#calls`, `#intake`), so a card opens exactly what it counts. This is requested in `docs/api-requests/overview.md`, with a `GET /clients?attention=` filter as the alternative.
- Home counts real clients only, for owners and managers alike; test clients never count.
- `topLinks` is `null` for managers (links are owner only) and an empty list when no link had a visit.
- `topLinks` covers the same 30 Toronto days as the traffic block, busiest first, at most 10, and leaves out deleted links.
- `activeSubs` counts active, trialing and past due, using the billing fixture's rule. I asked the server to confirm this.
- Recent leads and subscriptions are the full list entities, so a tap can open the detail from cache.
- `traffic.topSources` sends every source; the Donut does the top 7 plus Other.
- Search for managers returns only clients and leads, never test clients; owners see test clients with "Test" first in the subtitle.
- Search ranks exact, then starts with, then a word starting with the query, then contains. Names, titles, codes and slugs weigh more, and an exact email or code ranks as high as an exact name. Ties go client, lead, subscriber, post, coupon, link, then newest first.
- Search ignores case, accents and punctuation. Words can come in any order, and queries under 3 characters match only at the start of a word. A query that looks like a phone number (4 or more digits) matches phone numbers.
- Search returns at most 20 results, and an empty query answers an empty list (never a 400). Coupon results link to `/admin/coupons`, links are titled `tekmadev.com/<slug>`, and subtitles never contain dates.

### Sign in

- Sign in and reset use `FormSubmitButton`, not `PendingButton`, so the keyboard's Go/Send key can submit. `PendingButton` can't be pressed from code; this is the kit's documented `useSubmitGroup` + `Button` pattern and behaves identically.
- Sign in is not disabled offline, so the person sees the brief's "Could not sign in. Check your connection." The reset sheet is disabled offline, because "a reset link is on its way" would be untrue.
- Inline form checks: "Enter your email.", "Enter a valid email address.", "Enter your password.". The password is never trimmed.
- Sign-out messages show once as a neutral ink note in the same slot where errors appear in signal red. The screen also catches a message that arrives while it sits under the boot splash.
- The hero mark is 96dp, top-left, with the form pushed toward the bottom for thumb reach. Content is capped at 440dp wide, and the keyboard offset keeps "Sign in" visible while typing.
- The hero mark only fades in; everything else uses `enterPull`. On a cold start signed out, the screen mounts under the boot splash, so the splash fade reveals the already-settled form.
- The "Mock accounts" chips (Owner, Manager, Staff) load their values lazily from `fixtures/staff.ts`, so no credentials are written in the screen.
- Reset sheet: title "Reset your password", subtitle "Enter your email. We'll send a link to set a new one.", button "Send reset link" / "Sending". After sending it shows the brief's exact message and a "Done" button.
- The biometric offer appears only when the phone has a sensor and an enrolled fingerprint, 900ms after sign-in.
  - It is marked as offered the moment it shows, so dismissing it also counts as an answer.
  - "Turn on" confirms with a real fingerprint before saving the preference. Cancelling the system prompt is silent; lockout and failure show inline.
- Update screen: eyebrow "Version x.y.z", "Version N is ready." when known, and "This version is still too old. Install the update to keep going." on a recheck that still fails.
- A 401 on "Check again" counts as passing the version check, because the request goes out without a token and the server checks the version first. A stale session is already signed out by the client at that point.
- Only https APK links are opened; anything else shows "Ask Shajeed I. for the latest APK."
- The update card says "Version N is ready. You have X." Remembering a dismissal is left to the caller.

### Phase 1 review

- After a drag-to-close, the sheet gives its owner 300ms to act on `onClose` before springing back.
- The `minVersion` gate runs on every `/me` (fresh and cached); an unknown build version ("0.0.0") never blocks.
- Signed-out boot: the splash mark lands on the sign-in hero mark, or fades in place until that is measured.
- The biometric offer is mounted once in `app/(app)/_layout.tsx`.
- The pull-to-refresh beat clock runs only while refreshing or shrinking away.
- Chart axis labels roll over to the next unit instead of printing "1000K".

I need no changes in files I do not own.

## Phase 2: daily driver

### Navigation and shell

- Links from a pushed screen (Inbox, search) to a tab route go through `openHref()` in `src/modules/inbox/navigation.ts`: `router.dismissTo` when there is a screen to go back from, `router.navigate` otherwise. A plain push to a tab route in expo-router 57 stacks a second copy of the tabs.
- `/admin/notifications?filter=action|unread|all` opens the Inbox on that segment.
- Every screen that can be opened with nothing cached shows the network error when offline, never an endless skeleton.

### Home

- Each KPI card opens its list: Leads, Leads with `view=booked`, Subscriptions, Analytics. Recent subscriptions also gets "View all"; its rows are not tappable (no subscription detail route).
- "Needs you" order: notifications, blocked onboardings, CRM reviews, intakes, behind pace. Card size grows with font scale, and the skeleton uses the same size, so nothing jumps.
- KPIs above 99,999 show in short form ("124.8K"). Numbers count up from zero only on a first load with nothing cached.
- A dismissed update card stays hidden until a newer version is announced (stored on the phone). It is hidden when the build version is unknown.
- A failed pull keeps the data and toasts the error; a failed background refetch stays silent.

### Inbox

- The segment control is custom (segments sized to their labels) so "Needs action (12)" stays whole at font scale 1.3. Category chips are plain chips so "Include test" can end the same scrolling row.
- "Mark all read" is hidden when the current view has no rows (there is no watermark to send).
- A row opens the detail sheet when its link points at the Inbox itself or at a page this role cannot open.
- Swipe actions are hidden offline; the sheets say "You are offline".
- Making a category quiet toasts "Leads is quiet now. It won't count toward unread." with Undo. Day headers add the year when it is not this year.

### Customers and Clients list

- The four Customers sections use ScrollTabs, not SegmentedControl: "Subscriptions" is cut off in four equal segments.
- `view=blocked|review|intake|behind` sends `attention` to `GET /clients` with a removable gold chip. Leads, Live, Blocked and Behind pace stat cards also filter the list.
- New client: when the email matched an existing client, the toast says "Existing client updated." instead of "Client created.".
- Checklist templates save with PUT (no Idempotency-Key); a new template's key is checked against the loaded list so it never silently overwrites one. The key is suggested from the title. Empty copy: "No checklist templates yet. New onboarding runs start with an empty checklist."

### Client detail

- Intake answers are open while the intake waits for review and folded behind "Show answers (x of y)" otherwise.
- The last section is at least one screen tall so any tab can bring its section under the tabs; sections keep 16dp above them.
- While the bundle loads, the title comes from a cached Clients list. A 404 shows ErrorState even with cached data (trashed elsewhere).
- Completing a run uses an ink (not red) hold button: "Mark onboarding complete. A completed run cannot be reopened."
- Intake badge tones are local (draft muted, submitted gold, reviewed ok): `GET /meta` sends no intake statuses.
- Toasts: "Moved to trash.", "Intake marked reviewed.", "Onboarding marked complete.", "Task added.", "Marked <status>." with Undo.

### Client sections

- Access: with no grants the button says "Request access"; the sheet title is always "Request another access". Add buttons sit under the lists.
- Files: 2 columns on phones, 3 from 600dp. Signed URLs are treated as expired 30 seconds early and kept in memory only. The image viewer is always dark and scales images over 8 megapixels down to the screen.
- Agreements: copying the hash copies the full SHA-256. A sent then viewed agreement reads "Sent <time> · viewed <time>".
- Calls: 12 shown, then "Show N more". The edit sheet's Qualified control also has "Not reviewed". The log sheet leaves CRM out of the sources (the server refuses it) and an empty "Booked at" means now. Before the clock starts: "60 day window, clock not started".
- Team: "Active" is locked for an invited person ("Once they accept the invite"); role and status save on change, without an optimistic update.
- Activity composer hint: "Appears in the client's portal. No email is sent."
- Empty copy where the brief has none: "No booked calls yet.", "No one has portal access yet.", "No activity yet."
- Writes refresh what the web admin would: Calls and Account refresh the client, the Clients list and Home; CRM, Team and Activity refresh only the client.

### Search, quick actions, shortcuts, More

- The search field is pinned at the bottom of the sheet, above the keyboard. Records are searched from the first character; previous results stay dimmed while typing.
- Screens rank by title, then keywords, then words in any order, then letters in order ("prcng" finds Pricing).
- Recent searches are tied to the user id, capped at 8 of 100 characters, saved when a result opens or the search key is pressed. Results are never written to disk.
- Launcher shortcuts follow role and feature flags, are cleared on sign-out, and a shortcut that launched the app is handled once per run.
- Sign out: "Sign out?" with "Hold to sign out"; when drafts exist the message says they will be deleted and the hold turns red. Sign-out works offline.

## Phase 3: customers and insights

### Leads

- "Lead forms" means source `grow` (the website's qualifying form), not status qualified. It shows the newest 3 under the same search, status and need, with "View all" (sets Source to Lead form). It shows only when Source is "All sources", is hidden when empty, and those leads also appear under "All leads".
- Filters are three chips (Source, Status, Need) that each open a short sheet. "Clear" keeps the search; "Clear filters" in the empty state clears it too. `view=booked` resets the other filters and shows a removable gold "Booked calls" chip.
- Detail: "Open client" replaces "Create client from this lead" once the lead became a client. Copy asks which when there is both an email and a phone. Call and Text are dimmed without a phone.
- Missing UTM values read "Not set"; a missing referrer reads "Direct visit". A 404 shows "That lead no longer exists." with no Retry.

### Free tools

- KPI cards scroll sideways, sized to fit the whole money figure at font scale 1.3.
- Badge tones: Opted in ok, No muted; Email ok, No email warn; CRM ok, No CRM muted. A missing leak reads "Not worked out"; a missing close rate or reply speed reads "Skipped".
- The breakdown shows the server's text exactly, headline lines on a gold tint.

### Subscriptions

- The inner tab is the route param `sub` (default Subscriptions); only the visible tab fetches. Status chips come from meta, with a "No ... with this status." empty and "Show all".
- An ending subscription drops the period line (the "Ending <date>" badge carries it). The order sheet says "Paid with" once paid, otherwise "Payment method". Both sheets have "Open client" when the row has a client.
- A detail sheet keeps its row even if a refetch drops it.

### Analytics

- The range is the route param `range` (not remembered across launches); `/admin/analytics?range=` passes it through and Home's Pageviews card opens 30 days. The chips pin under the header once scrolled.
- Averages under 10 show one decimal. Country flags come from the ISO code; an unknown code gets a globe.

### Ads

- The range is shared by both Ads screens and kept in memory. KPI panels are 2x2, one column when a money figure would not fit; money is never shortened outside chart axes.
- Sync time: "just now", "5 min ago", "3 h ago" today, then a date and time; "Not synced yet" before the first. A pull timeout toasts that it may still finish. A refused pull refreshes the bell and the Inbox lists.
- Empty copy: "No ad spend in this range.", "This campaign spent nothing in this range.", "No ad in this campaign spent in this range."

### Everywhere

- Offline, a filter or range that was never loaded shows the network error, never the previous filter's rows dimmed (a placeholder reports success, so the check includes `isPlaceholderData`). Applied to the Clients list too.

## Phases 4 and 5: marketing, sales and settings

- The app ships on Android first and on iPhone right after, from the same code: Android-only APIs sit behind Platform checks with an iOS path.
- Settings was built first at the owner's request. Push delivery was added right after (see Push notifications below).
- The black hole loader now runs every instance off one shared frame loop (same poses, pause and reduced-motion behaviour).

### App settings and lock
- The lock is a full-screen Modal with no fade, above sheets and toasts. Android back does nothing on it.
- It locks on a cold start with a saved session, but not right after a password sign-in.
- "Immediately" locks on the way out. The system unlock prompt's own trip to the background does not count as leaving.
- It locks if the phone's clock moved backwards while the app was away.
- It asks for the fingerprint or screen lock once by itself, then waits for Unlock. Sign out is offered with a hold.
- Turning biometric unlock on needs one successful unlock first. It is only offered when the phone has a biometric or a screen lock set up.
- Theme change: a snapshot covers the screen, the theme switches underneath, and the snapshot fades out over 320ms. With reduced motion, or a snapshot slower than 600ms, the theme switches at once.
- "Clear cached data" keeps the session, settings, drafts and recent searches. Open screens reload.
- Quiet and Push switches are optimistic with rollback. Quiet refreshes the Inbox lists and the bell; Push refreshes nothing else.
- The Kit opens after 7 taps on the version, with a haptic countdown from the 4th tap.


### Blog list
- Posts are full-width rows. Swipe right publishes or unpublishes, swipe left moves to trash, long press opens every action.
- Publish and Unpublish use an ink hold; trash uses a red hold.
- "Share link" is disabled until the post is published.
- Featured and AI draft badges are neutral, so gold stays for Published.


### Editor
- The top bar slides away while scrolling down and comes back on the first scroll up.
- The toolbar shows only while the body has focus.
- Choosing Published in Details goes through the publish hold.
- New posts start as drafts.


### Email
- Preview links open their real destination (not the click tracker) in a Custom Tab, so previewing never counts a click.
- The library origin whitelist is `*`, with "only about:blank loads" enforced in the navigation handler.
- Pause / Resume waits for the server.


### Links
- Disable confirms with an ink hold; Enable needs no confirm.
- Save to photos uses the write-only legacy media library call, so it asks for nothing on Android 13 and newer.


### CRM
- One long job at a time, with no Cancel.
- Sync, Run now and turning a switch on need a verified connection.
- The Outbound hold is ink.
- The inspector refreshes only on Look up or a pull.


### Pricing
- When Stripe reports `skipped`, the toast says "Saved. The site is updated."
- A partial Stripe failure is shown on the card. Unsaved fields keep their edits so Save can retry them.


### Team
- The temporary password is pre-filled: 14 characters, no look-alike characters.
- After adding, the sheet stays open with the sign-in details and a Share button.

## Blog images upload to storage (brief update 2026-09-30)

- Images are picked (gallery or camera), resized to at most 2400px wide (the decoded, rotated width), and saved as WebP (JPEG fallback) at falling quality until under 10 MB. A GIF that already fits uploads unchanged so it stays animated; a GIF of unknown width is re-encoded.
- Bytes are read before `POST /blog/media`, so `size` is exact. No Idempotency-Key: it creates no record and a retry gets a new slot. If the lowest quality is still over 10 MB, the file is sent so the server's message shows.
- Mock API mode keeps the mock's https `publicUrl` (so saving passes the https check) and previews the processed file from memory for the session.
- The storage upload gives up after 3 minutes: "That took too long. Nothing is lost: try again in a moment." Nothing goes to the bucket once the editor has closed. Temporary files are deleted after every attempt.
- "Insert image" replaces the old Image tool; its sheet offers Choose from gallery, Take a photo and Use an image link. An uploaded image goes after a selection, the insertion point follows edits made during the upload, and "Describe the image" is selected on arrival (the body is focused only when no sheet or Preview is open).
- Body upload errors are a toast; cover and social errors show in signal red under the link field. Cover alt text ("Describe the cover image in a few words.") is required when a cover is set; saving without it opens Details on Media.
- Leaving during an upload: with other unsaved changes the usual Save / Discard / Keep editing sheet adds "An image is still uploading. If you leave now, it is not added to the post."; with nothing else unsaved it asks "Leave before the image is added?".
- Camera refused: "Camera access is off. Allow it in Settings, or choose from the gallery." Closing the picker is silent. Previews use a 1200 x 630 shape.

## Push notifications (brief section 9)

- Firebase project `tekmadev-admin`; `google-services.json` lives in the project root and stays out of git. Expo project `@tekmadev/tekmadev-admin`; the FCM V1 service account key is uploaded to Expo, never to the app.
- Channel ids are `<category>` and `<category>-critical` (high importance), with gold light and private lock-screen visibility.
- The push offer appears only after a password sign-in, once per install, after the biometric offer and with no other sheet open. Phones already signed in turn push on in Settings, Notifications.
- Re-register when the person, app version, platform or token changes, and weekly (in mock mode also once per launch).
- Foreground pushes show a toast. While the app is locked, the system shows the push instead.
- A tap opens once per phone (the last 30 tap keys are kept on disk), only when the app is in front and unlocked. Taps waiting at sign-out are dropped.
- Sign-out waits up to 1.5s for a registration on its way, then sends DELETE with a 3s limit, skipped offline. A `POST /devices` that fails offline retries when the connection comes back.
- The notification permission dialog does not trigger the app lock (it briefly sends the app to the background).
- Once push is registered, the bell polls every 120s instead of 45s.
- What the server must send through the Expo push API is in docs/api-requests/notifications.md sections 7 and 8.

## Sign-in and versions

- Real Supabase sign-in is on. With the mock API, tekmadev@gmail.com and shajeed@tekmadev.com are owners (EXPO_PUBLIC_MOCK_OWNER_EMAILS), and the @tekmadev.test fixture accounts keep working so other roles can be checked.
- Every APK build bumps the version and versionCode +1. Owner's numbering: a small update bumps the last digit (`npm run apk -- minor`, 0.3.0 to 0.3.1), a big one the middle digit (`npm run apk -- major`, 0.3.1 to 0.4.0), and the official launch is 1.0.0 (`launch`).
- The brief is kept in sync with the website's copy (tekmadev3/docs/mobile-admin/PROMPT.md); update prompts are applied and logged here.

## Roles and capabilities (owner decision 2026-10-03)

- Three roles: owner, manager, staff. Everything is shown or hidden by capability (`useCan`, `RequireCapability`, module and quick action `capability`), never by role. GET /me `capabilities` wins; without it the role's row in `src/auth/capabilities.ts` is used. The mock's copy (`src/api/mock/permissions.ts`) is checked against it by a test.
- A 403 for an owner-only capability is `owner_only` "That section is owner only." (toast and back); any other is `forbidden` "Your role cannot do that.", shown where the action was and the screen stays.
- Write controls a role lacks are left out, never greyed: no button only ever answers 403. Read-only empty states drop their call to create ("No posts yet.", "No links yet.", "No coupons yet.").
- Home for staff: three KPI cards (no Active subs, the third spans the row), no Recent subscriptions, and only the "Needs you" cards they can act on. The skeletons draw the same layout.
- Customers and Marketing show only the sections a person may open; a link to a hidden section opens the first allowed one. With a single Marketing section the tab switcher is a spacer of the same height.
- Client detail for staff: no Billing card, Go live, Edit, trash, CRM tab or member actions; onboarding shows a read-only summary; tasks, access requests, approval requests, call logging and notes stay.
- "Create client from this lead" needs `leads.convert` and `clients.create` (staff: no button).
- Blog without `blog.write` opens a read-only post (Preview only, View live and Share link). Pricing without `pricing.write` is read only; coupons share with `coupons.share`.
- Team: Staff is the default role in the add sheet; Owner is offered only with `team.owners`; Remove only with `team.remove`, never on a locked env owner or yourself. Role badges and help come from the app's table: Owner gold, Manager neutral, Staff muted.
- Inbox chips, notification settings rows and Android channels follow `inbox.<category>`; channels a person cannot read are deleted. Staff get "Get pushes for new leads?".
- Search: screens follow the registry; records are filtered by the server before the top 20 are cut, so staff get a full page.
- Deep links also map the web's /admin/blog/new (`blog.write`), /admin/blog/:id/preview, /admin/clients/templates and /admin/email/templates. Anything a person cannot open lands in the Inbox; the Inbox itself, when not allowed, sends them Home.

## Staff management and commission credit (owner decisions 2026-10-03)

Contract: the website's docs/admin-api/staff.md. Seven capabilities after `team.owners`: `team.role`, `team.pause`, `team.activity` (owners and managers), `activity.own` (everyone), `clients.credits.view`, `clients.credits.edit` (owners and managers), `commission.settings` (owners).

- A 403 `paused` from any call, a cached-session restore or sign-in signs the person out with "Your access is paused. Ask an owner or manager." The mock answers it on every route for a paused account.
- Change role opens its own sheet over the member sheet, narrowest role first, each with its help line. Owner is offered only with `team.owners`.
- Pause uses an ink hold (it can be undone); Resume needs no hold. Paused rows show the role badge and a Paused badge (warn); the member sheet says when and by whom.
- Where an action is not offered, a lock note says why: env owner, yourself, or (for managers) an owner.
- Team activity opens from a card at the top of Team and from More (a row under the profile card); staff get "My activity" there and on Profile. Both are in search.
- The board sorts by clients won, then touches, calls booked, leads found and name. The range defaults to 7 days and is not remembered.
- The team board lists 3 credit rows per person, then "and N more"; My activity lists them all.
- Lead detail shows Found by and Booked by once known (Found by falls back to "added by" on older servers). A booked lead with no booker offers "I booked this call".
- Booked can be picked by hand in the status sheet, except on a calendar lead that does not already show booked (the server's rule).
- New client from a lead sends `leadId`, says the lead's finder and booker get credit, and refreshes the lead.
- Credit renders under Account on the client's Account tab. Staff see only "Your credit" with "Credit is private: you see only your own share."; the section is hidden when the server sends no `credits`.
- The credit editor shows the total live, requires 100 (or nobody: "Nobody gets credit for this client.") and a note; Save stays off until something changes.
- Commission split lives in App settings: owners edit (typing one share fills the other so they total 100), managers read only, staff never see it.
- The web admin has no "create client from this lead" flow, so automatic credit from a lead happens only from the app.
- A lead that books through the public booking link gets no automatic booker: the person who got the booking marks it Booked (the website's booking webhook is unchanged).


## Owner requests after 0.4.0

- New client: Assigned strategist starts with the signed-in person's email (owner, manager or anyone allowed to add clients), on the app and the web admin. Typing another email replaces it; clearing it leaves the client unassigned.

## iPhone version (2026-10-05)

Build and platform:
- iOS 27 traps at launch in any app without the UIScene life cycle. `plugins/withSceneLifecycle.js` makes AppDelegate an `ExpoReactNativeFactoryProvider` and adds `SceneDelegate: ExpoAppSceneDelegate` plus the scene manifest (Expo's SDK 57 template still lacks it). Remove the plugin once Expo's template adopts scenes.
- The project path contains a space. `plugins/withPathSpacesFix.js` quotes the two Xcode phases that split on it (expo-constants' app config phase via the Podfile, and the React Native bundle phase). A symlink to a space-free path does not help: Xcode resolves real paths.
- Bundle id `com.tekmadev.admin`, display name "Tekmadev", iPhone only (`supportsTablet: false`), `usesNonExemptEncryption: false` (to re-check against Apple's questionnaire at the first upload: the cache is AES encrypted on the phone).
- Free Apple ID installs (`scripts/ios-device.sh`) use the bundle id `com.tekmadev.admin.personal` and drop the push entitlement; a paid account is needed for push, TestFlight and Expo (EAS) iPhone builds.

Tab bar and navigation:
- iPhone uses the system tab bar (UITabBarController, Liquid Glass) through expo-router native tabs, with SF Symbols (outline, filled when selected) and the gold tint. Android keeps the floating pill.
- The bar never minimises: UIKit only finds a scroll view on the first-subview chain, and our Screen puts its header first (moving it would read the content before the header in VoiceOver). It stays put on every tab rather than on some.
- Inside native tabs each tab's safe area already includes the bar, so the tab inset and the floating + button measure from the safe area only (`NativeTabsContext`).
- App shortcuts use SF Symbols on iOS (`tray.full`, `person.crop.circle.badge.plus`, `square.and.pencil`, `chart.bar`).

Fonts, text and input:
- iOS fonts use the PostScript face per weight with `fontWeight` pinned to that face's own weight, so nothing is synthesised. Android is unchanged. Every font goes through `fontFace()` or the Text `weight`/`family` props; ESLint enforces it.
- Geist Mono on iOS: lighter than 500 uses Regular, 500 and heavier uses Medium (the same files Android's closest match picks).
- iOS display line height is 1.22 (Android 1.16): iOS cuts a short line box from the top, which shaved accented capitals.
- Markdown italics render upright on iPhone: Geist has no italic file and only Android fakes a slant.
- The iOS caret is one solid gold tint (iOS draws the caret in the selection colour, so the 30% highlight would hide it).
- Plain screens and lists shift their content for the keyboard on iOS (`automaticallyAdjustKeyboardInsets`). The black hole pull to refresh stays; the native bounce is off on screens that have it.

Lock, privacy and feedback:
- The iOS app lock is a top overlay layer, not a Modal (UIKit refuses to present a second view controller, so a Modal would not cover the image viewer or the in-app browser). Locking closes the keyboard and the in-app browser; the image viewer hides until unlock.
- "Hide content in the app switcher" on iOS is an opaque cover with the splash mark whenever the app is not active, except during our own Face ID or permission prompts. iOS cannot block screenshots.
- iPhone copy says Face ID, Touch ID or passcode, and the offer sheet shows a face icon on Face ID phones.
- iOS haptics follow the brief's map: selection, light and medium impact, success, warning and error.
- VoiceOver hides what TalkBack hides, the app under an open sheet is hidden, and the escape gesture closes a sheet.
- The edge swipe works on the blog editor; with unsaved changes or an upload running it springs back and asks "Save your changes?".

Push and updates:
- The iOS push token request gives up after 20 seconds with "could not get a push token"; a token that arrives later still registers.
- The iOS icon badge shows the bell's unread count and is cleared on sign-out.
- iPhone is never offered the APK: the update card says "Ask Shajeed I. for the latest iPhone version."

## Legal pieces for the stores (2026-10-05)

- Legal links (privacy policy, terms, open-source licenses, account deletion) live in one Legal group on the More tab for every role, not in App settings > About: easier to find, as the stores want for account deletion.
- Sign-in links the privacy policy and terms quietly at the bottom, so the privacy policy is reachable before signing in (Apple requires it inside the app).
- Legal pages open in the in-app browser; their URLs live only in `src/lib/legal.ts` (tekmadev.com /privacy, /terms, /account-deletion).
- Open-source licenses come from `scripts/gen-licenses.mjs`, run by hand and committed as JSON; each license text is stored once and copyright lines are kept per package.
- Native libraries are listed only when the Android or iOS build confirms them (Gradle resolved deps, Podfile.lock), with versions from those builds; re-run the generator after every build that changes native dependencies. Google Play services and the Install Referrer are not open source and are not listed.
- Long and medium dashes in third-party license texts are turned into ASCII hyphens to keep the no-dash rule.
- The license detail is a sheet, not a pushed screen: it keeps the list's scroll place and needs one route.

## Staff clients and demo requests (owner decisions 2026-10-05)

Contract: the website's docs/admin-api/demos.md (first drafted in the orchestrator's demos-contract.md). Capabilities: `clients.create` is now owners, managers and staff; new `demos.view` and `demos.request` (everyone) and `demos.manage` (owners and managers). Totals: owner 75, manager 72, staff 28.

- Staff may add clients. New client, its quick action, shortcut, search entry and deep link follow the capability. The form shows no money (plan names and hints only).
- A client added without a lead credits the signed-in creator as finder and booker (100%), for every role. New client says "You get the credit for this client." Creating from a lead still credits the lead's finder and booker; adding an existing client's email again keeps that client's credits.
- Demo requests need business information (name, type of business, area served, what they sell or do; optional website or socials, logo and colours, customers, what they want to see, needed by).
- Demos are a Customers segment after Leads, with Open, Ready, Mine (your open requests) and All, and the server's counts on the chips.
- Demo actions follow only the server's `can`. Mark as shown and Cancel request use HoldToConfirm (closing is permanent).
- "Mark ready to show" without a link shows "Add the demo link first." under the button, with an "Add the link" shortcut that saves the link and marks ready together. "Start building" makes the person tapping it the builder when nobody is set.
- Client and lead pages get a compact Demo card (on the client, under the stat cards) with "Request a demo". "Client wants a demo" on New client is off by default and opens the demo form for the new client.
- The demo form keeps a local draft until the server saves it, and slides up like New client. Success toast: "Demo requested."
- A lead's demo requests follow it to the client when it converts; a request made on a lead that is already a client gets that client too.
- 2026-10-05 (owner): Add a lead is first in the gold + sheet, before New client and the brief's order: adding leads is the sales team's main job, and it was hard to find at the bottom.
- 2026-10-07 (owner): Add a lead gets "They want a demo" (off by default, `demos.request`), like New client's switch: after the lead is added, the demo request opens for it instead of the lead. The website's Add lead has the same checkbox. The switch is not part of the intent, so it never changes the Idempotency-Key.

## In-app updates (owner decision 2026-10-08)

- Android updates come from inside the app: every `npm run apk` publishes the APK to a private Supabase bucket and sets the server's latest version (docs/release-signing.md). GitHub is not used: a private repo's release files need a GitHub sign-in to download, and a public one would hand the internal app to anyone.
- The download link comes from GET /me only (signed-in staff), signed for six hours. "Download" asks GET /me for a fresh link first, so a card left on screen for hours still works; offline it tries the link it has.
- Native libraries are stored compressed in the APK (`useLegacyPackaging`) to keep it under the free plan's 50 MB upload limit (about 36 MB instead of 58 MB). Installs take a little more space on the phone; nothing else changes.
- Later, once the Google Play organization account exists, Play's internal testing track replaces this for Android (updates through the Play Store). The bucket link stays as the fallback.

