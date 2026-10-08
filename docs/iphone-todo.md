# What is left for iPhone (2026-10-07)

Two separate tracks. Track A gets the iPhone staff working now, in Safari, with
no Apple account. Track B is the real iPhone app, which waits on the Apple
Developer account.

Sentry is paused (owner, 2026-10-07): the app ships with it off until the
owner creates an account. Nothing to do for iPhone there.

---

## A. Staff on iPhone today: the website's lead pages

Where: the website worktree
`/Users/shajeed/Coding/Projects/NextJS/tekmadev3/.worktrees/admin-api-v1`,
branch `staff-management`. Work only there, never in the owner's main checkout.

Status: built by the leads workspace workflow (2026-10-06), **not committed**
(about 48 files: `lib/leads-web.ts`, `lib/leads-ui.ts`,
`app/admin/(dashboard)/leads/[id]/`, `components/admin/leads/*`,
`components/admin/MobileTabBar.tsx`, `RefreshOnResume.tsx`, the web manifest,
error screens, Sidebar and layout edits, `leads/actions.ts`). The uncommitted
files also hold the website's "They want a demo" checkbox on Add lead
(2026-10-07), which ships with them. Typecheck was clean on 2026-10-07.

What it gives staff: the lead page (tap to call, text or email), logging
calls, emails, DMs and meetings, follow-ups, status, "I booked this call", the
demo card, a phone tab bar, and adding the site to the home screen like an app.

### Steps to finish

1. Fix the open review findings below. Check each one against the current code
   first: two were fixed already, and a few were never confirmed.
2. Run the checks: `npx tsc --noEmit -p .`, `next build`, and the harnesses in
   the session scratchpad (leadswebtest, leadstest, staffmgmttest,
   clientstest, sectionstest, demostest).
3. Screenshots at iPhone size (375 and 430 wide): Leads, a lead page, Add
   lead, the menu, the follow-ups view.
4. Commit on `staff-management`, push it for a preview, give the owner a test
   checklist, and the owner pushes it to main.

### Open review findings (from run wf_e49fae4f-4d4)

Already fixed: `timeline-drops-touch-after-show-older`, `qualifier-literals`.

Medium:
- **claim-booking-precondition-ui-only** (`lib/leads-web.ts`): "I booked this
  call" is only guarded in the UI. The server must read the lead first and
  refuse when it is not booked, or when someone else already has the booking
  credit, before writing. Add a harness case: a claim on a won lead is
  refused.
- **due-view-defaults-to-mine** (`lib/leads-web.ts`): the follow-ups view
  shows only mine by default; the app shows everyone's. Match the app (a
  "Show only mine" option, `who=mine`), and point Overview's "Open
  follow-ups" at `?view=due&who=mine`.
- **IPH-1** (`components/admin/leads/PendingLogBanner.tsx`): on phones the
  "log what happened" banner must sit above the tab bar (fixed, safe area,
  hidden while typing) and the list needs bottom padding so it can scroll
  clear.
- **IPH-2** (`app/admin/(dashboard)/notifications/page.tsx`): filter chips and
  small buttons need 44px tap targets (`min-h-11`).
- **IPH-3** (`components/portal/ui.tsx`): `inputCls` uses `sm:text-sm`, so
  iPhone Safari zooms into inputs. Use `lg:text-sm` (fixes every admin and
  portal form).

Low:
- **follow-up-count capability** (`lib/leads-web.ts`, two duplicate findings):
  the follow-up count needs `activity.own` and `leads.view`; gate the Overview
  panel the same way.
- **IPH-4** (`components/admin/Sidebar.tsx`): raise the phone top bar to z-40.
- **IPH-5** (`PendingLogBanner.tsx`): `break-words` on the banner text.
- **IPH-6** (`app/admin/(dashboard)/profile/page.tsx`): 16px inputs on phones
  (`lg:text-sm`) and a 44px save button.
- **IPH-7** (`app/admin/(dashboard)/clients/[id]/page.tsx`): the sticky
  section nav must stick below the phone top bar.
- **IPH-8** (`components/admin/leads/LeadRow.tsx`): at 375px the name is too
  squeezed; move the badges under the name or hide the avatar below `sm`.
- **IPH-9** (`components/admin/leads/outreach/LogTouchForm.tsx`): a changed
  follow-up counts as unsaved.
- **IPH-10** (`components/admin/DesktopAlertsToggle.tsx`): drop the
  `"standalone" in navigator` check.
- **dup-status-rule** (`components/admin/leads/outreach/outreach-logic.ts`):
  reuse `CALENDAR_STATUS_HINT` and `statusChoiceBlock` from `lib/leads-ui.ts`.
- **dup-idempotency-key**: one `webIdempotencyKey()` helper for Add lead and
  Log touch.
- **dead-code** (`lib/leads-ui.ts` and others): remove unused helpers;
  MobileTabBar `active: onList && view !== "due"`.
- **admin-ui-kit-mismatch** (`app/admin/(dashboard)/leads/page.tsx`): one UI
  kit per page (admin PageHeader and Panel).
- **error-screen-duplication** (`app/admin/(dashboard)/error.tsx`): share one
  retry hook.
- **menu-haspopup-dialog** (`components/admin/Sidebar.tsx`): use
  `aria-expanded` and `aria-controls` instead of `aria-haspopup="dialog"`.
- **inbox-vs-notifications** (`components/admin/MobileTabBar.tsx`): one word
  for the inbox across the web admin.
- **row-call-label** (`LeadRow.tsx`): the call button's label says who:
  "Call <name>, <phone>".
- **stale-list-retry-loop** (`components/admin/leads/LeadListMore.tsx`): a
  stale list should refresh the page, not retry forever.
- **not-recorded-copy** (`lib/leads-web.ts`): no "Try again in a moment" when
  the booking credit could not be recorded.
- **skeleton-reduced-motion** (`leads/[id]/loading.tsx`): `motion-safe:animate-pulse`.

### Also waiting on the owner (website)

- Approve the privacy policy changes (Section 12, the app and team members),
  then push `staff-management` to main.
- On the day it goes live, move `legalDates.lastUpdated` and
  `accountDeletionEffective` in `config/site.ts` to that date (both say
  2026-10-07 now; production's privacy version is 2026-10-06).
- Done: the demo tables are in Supabase (checked 2026-10-07).

---

## B. The iPhone app itself (needs the Apple account)

The app already runs on iPhone in the simulator and with a free Apple ID
(`scripts/ios-device.sh`, bundle id `com.tekmadev.admin.personal`, no push).
Staff phones need the paid account.

### Owner steps (in order)

1. **D-U-N-S number** for Tekmadev Innovation Inc. (free). **Done 2026-10-07.** Apple's lookup:
   https://developer.apple.com/enroll/duns-lookup/ (sign in with an Apple ID).
   Look the company up first; if it is not there, request one with the exact
   legal name and address from the incorporation papers. About 5 business
   days, then up to 2 more for Apple to receive it. The same number serves
   the Google Play organization account.
2. **Apple Developer Program, as an organization** (US$99 a year; **submitted 2026-10-07, being processed**), with the
   same legal name and address, the website tekmadev.com, and ideally an
   @tekmadev.com email. Apple's review can take days to weeks.
3. **Staff list**: each staff member's Apple ID email, for TestFlight.
4. **A test login for Apple's reviewers** (the owner creates it; never in
   chat).

### Build steps (Claude, once the account exists)

- App Store Connect app record for `com.tekmadev.admin`, display name
  "Tekmadev".
- Push: an APNs key in the Apple account, wired to Expo push, and the push
  entitlement back on (the personal build drops it). Test the badge and the
  20-second token timeout on a real phone.
- First build with EAS or an Xcode archive; keep `plugins/withSceneLifecycle.js`
  and `plugins/withPathSpacesFix.js` (see docs/decisions.md, iPhone version).
- Answer the export questionnaire (`usesNonExemptEncryption` is false today;
  re-check because the cache is AES encrypted on the phone).
- TestFlight for staff: internal testers must be App Store Connect users;
  external testers only need an email invite, but the first build gets a short
  beta review.
- App Store privacy answers, matching the privacy policy's Section 12.
- Change the update card copy ("Ask Shajeed I. for the latest iPhone
  version.") to point at TestFlight.
- Later, for keeps: a private (custom) app through Apple Business Manager, or
  a public listing.
- Regenerate the open-source licenses after the first real iOS build
  (`npm run licenses`, Podfile.lock versions).
