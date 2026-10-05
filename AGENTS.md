# Tekmadev Admin (Android, Expo SDK 57)

The full product spec is `PROMPT.md` (the "brief"). Read the sections relevant to your task before writing code. When the brief is silent, choose what a world-class product team would choose and note the decision in `docs/decisions.md`.

## Non-negotiable rules (brief section 2)

1. **No em dashes anywhere** (UI copy, code comments, docs, commit messages). Use a colon, comma, parentheses or a new sentence. Never type the U+2014 character, and never type U+2013 either.
2. **Never name the CRM vendor.** It is always "CRM" in UI and in identifiers you create.
3. **No secrets in the APK.** Only the Supabase URL + publishable key (sign-in only), and the Sentry DSN (a public, send-only key; owner approved crash reporting 2026-10-05). The app never reads tables; everything goes through the admin API (`src/api`).
4. Owner-only UI is hidden for managers, but the server (and the mock) enforce it with 403.
5. **Never fake data.** A failed read shows `ErrorState` with Retry, never zeros. "Failed" and "empty" are different states everywhere.
6. **Money is integer cents.** Show `$77.50` (never rounded to `$78`); whole amounts may drop `.00`. Use `src/lib/money.ts`.
7. Destructive or irreversible actions confirm with `HoldToConfirm` inside a sheet.
8. Copy is plain, short, direct. Reuse the exact strings in the brief.
9. Never state build or delivery times for any Tekmadev offer.
10. The founder's public name is "Shajeed I.". Never print a full legal name.
11. Every date/time is shown in **America/Toronto** (`src/lib/dates.ts`), whatever the phone is set to. Never parse a local chart label (no offset) with `new Date()`. Never re-encode cursors or `seen` watermarks through a Date.

## Stack (pinned by Expo SDK 57: do not upgrade)

- react-native 0.86.3 (New Architecture, Hermes), React 19.2, TypeScript 6 `strict`, React Compiler on.
- expo-router 57: routes live in **`app/`** at the repo root (thin files that re-export a screen from `src/modules/...`). Tabs use `import { Tabs } from 'expo-router/js-tabs'`. Never import `@react-navigation/*`.
- react-native-reanimated **4.5.1** + react-native-worklets 0.10.1. Use `.get()` / `.set()` on shared values (React Compiler safe). `withSpring` takes `{ damping, stiffness, mass }` (use `springs` from `src/design/motion.ts`). `Easing.bezier()` returns a factory for `withTiming` only; inside worklets use `Easing.bezierFn` or `cubicBezier` from `src/loader/keyframes.ts`. Use `scheduleOnRN(fn, ...args)` from `react-native-worklets` (not `runOnJS`). Animations default to `ReduceMotion.System`.
- react-native-gesture-handler **2.32** (the `Gesture.Pan()` builder API, `GestureDetector`, `simultaneousWithExternalGesture`, `ReanimatedSwipeable` from `react-native-gesture-handler/ReanimatedSwipeable`). Hook APIs like `usePanGesture` do NOT exist in this version.
- @shopify/react-native-skia **2.6.2**: pass shared/derived values straight to props; a `transform` must be a whole derived array (`useDerivedValue(() => [{ rotate }])`), rotations in radians, `origin` for pivots, build paths with `Skia.PathBuilder` or `Skia.Path.MakeFromSVGString`. Group `opacity` is per child; use `layer` for group alpha. Keep Canvas count low; avoid re-rendering a Canvas subtree during animation.
- @shopify/flash-list 2.0.2 (no `estimatedItemSize`; ref type `FlashListRef<T>`; for a Reanimated scroll handler use `Animated.createAnimatedComponent(FlashList)`).
- TanStack Query 5 (persisted to encrypted MMKV), zustand 5 (selectors returning objects need `useShallow`), zod 4 (`z.looseObject`, `z.email()`, `z.prettifyError`), react-native-mmkv 4 (`createMMKV`, `.remove()`), supabase-js (auth only), lucide-react-native (icons; names in the brief exist, some as aliases), expo-haptics via `src/design/haptics.ts`, expo-image, react-native-keyboard-controller, qrcode-generator (pure JS QR, draw with Skia).
- **No @gorhom/bottom-sheet**: use our own `Sheet` / `ActionSheet` in `src/components/sheet`.
- **Hermes Intl**: only `DateTimeFormat` (with `timeZone` and `formatToParts`) and `NumberFormat` exist. There is no `PluralRules`, `RelativeTimeFormat`, `ListFormat`. Use helpers in `src/lib`.
- Library API notes (checked against the installed versions, though they mention newer ones too) live in the orchestrator's scratchpad: `/private/tmp/claude-501/-Users-shajeed-Coding-Projects-React-Native/4508bcb4-6cb6-44a4-9120-f440cc1cb6c5/scratchpad/research/*.md` (expo-core, anim, skia, data, ui-native). Where they say GH 3 / Reanimated 4.7 / Skia 2.13, remember this project is on GH 2.32 / Reanimated 4.5.1 / Skia 2.6.2. When unsure, read the installed `.d.ts` in `node_modules`.

## Layout

```
app/                      routes only (re-export screens); app/(app)/(tabs) are the 5 tabs
src/api/                  client.ts (typed client), errors.ts, query.ts, types.ts
  schemas/<domain>.ts     zod schemas (validation only: no transforms/defaults) + this domain's metaFragment
  endpoints/<domain>.ts   typed functions + query keys for the domain
  mock/                   router.ts helpers, index.ts transport, controls.ts (dev failure injection)
    fixtures/<domain>.ts  realistic data + metaFixture fragment
    routes/<domain>.ts    MockRoute[] for the domain (registered in routes/index.ts)
src/auth/                 session store (useSession, useMe, useRole, useIsOwner), supabase, mock auth
src/design/               tokens.ts, theme.tsx (useTheme), typography.ts, motion.ts, haptics.ts
src/components/           the design-system kit (Text, Icon, PressableScale, Screen, Card, ...); sheet/ for sheets
src/loader/               black hole loader (keyframes.ts math, settings.ts, Skia components)
src/modules/<module>/     module.ts manifest + screens/hooks/components for that feature
src/modules/registry.ts   MODULES, TABS, visibility helpers (tabs/More/search/quick actions are generated from it)
src/lib/                  env, storage (encrypted MMKV), prefs, connectivity, notice (toasts), deeplinks, money, dates
docs/                     plan.md, decisions.md, api-requests.md
```

## Conventions

- **TypeScript strict, no `any`** in app code. Import with the `@/` alias (`@/components/Text`).
- **All UI reads the theme**: `const { colors, tones, isDark } = useTheme()`. Never hardcode a colour; use tokens from `src/design/tokens.ts` (`space`, `radius`, `layout`). Typography via `<Text variant="...">` (`largeTitle`, `kpi`, `headline`, `title`, `body`, `label`, `eyebrow`, `mono`, ...). Every text is `<Text>` from `@/components/Text` (it caps font scale at 1.3).
- Tappables use `PressableScale` (0.97 press, light haptic) and have at least a 48dp touch target and an `accessibilityLabel` when icon-only.
- Motion: springs from `springs` (`default`, `snappy`, `soft`), fades `fade(ms)` with `easeStandard`. Enter animation `enterPull(index)` (stagger 30ms, first 8). Respect reduced motion: `useReduceMotion()` (no staggers, parallax, count-ups when on).
- Haptics only through `haptics.*` from `src/design/haptics.ts`.
- Toasts: `notice.ok(message)` / `notice.err(message)` from `src/lib/notice.ts`.
- Server state: TanStack Query. Query keys start with the domain name (`['clients', ...]`). Use `queryOptions()` helpers exported from `src/api/endpoints/<domain>.ts`. Every create POST passes an `idempotencyKey` (`newIdempotencyKey()` once per user intent, reused on retry). Optimistic updates only where the outcome is certain (mark read, mute, task status); anything touching money, Stripe, emails or invites waits for the server.
- API errors are `ApiError` (`message` is ready to show; `fields` maps inline form errors). Use `errorMessage(e)` and `fieldErrors(e)`.
- Never edit `android/` (it is generated by prebuild). Native config goes in `app.json` or `plugins/`.
- Do not install or upgrade packages unless your task says so (parallel agents share package.json). If you need one, say so in your report.
- Do not run `expo prebuild`, Gradle, `adb`, or touch the emulator unless your task says so. The orchestrator builds and screenshots.
- Stay inside the files your task assigns. If you need a change in a shared file, describe it in your report instead of editing it.

## Commands

Always start a shell with the project env (Node 22.23 via nvm, Android SDK, JDK 17):

```bash
source /private/tmp/claude-501/-Users-shajeed-Coding-Projects-React-Native/4508bcb4-6cb6-44a4-9120-f440cc1cb6c5/scratchpad/env.sh
npx tsc --noEmit -p .                 # typecheck (other agents may be mid-edit: filter output to your files)
npx jest <path>                       # unit tests (jest-expo preset)
npx expo lint                         # lint
```

Typed routes are generated into `.expo/types/router.d.ts` by the running Metro server. Valid `Href`s are the files under `app/`.
