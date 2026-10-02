# Tekmadev Admin: build plan

The spec is [PROMPT.md](../PROMPT.md). This file records the phases, the folder layout and the libraries (with the versions actually installed). Decisions made where the brief is silent live in [decisions.md](decisions.md). Server contract gaps live in [api-requests.md](api-requests.md).

## Phases (brief section 13)

| # | Phase | Scope | Status |
|---|---|---|---|
| 1 | Foundation | Project setup, tokens, fonts, theme switching, component Kit (both themes), the black hole loader (all variants, reduced motion, settings), splash and boot, sign in and session, API client with the mock adapter and fixtures for every endpoint, module registry, tabs, deep link mapper | Done |
| 2 | Daily driver | Home, Inbox (full), Clients (list, new, detail with every section, templates), global search, quick actions, app shortcuts, More | Done (owner checked) |
| 3 | Customers and insights | Leads, Free tools, Subscriptions, Analytics, Ads | Built; on-device check by the owner |
| 4 | Marketing | Blog (incl. the editor), Email, Links, CRM sync | Planned |
| 5 | Sales and settings | Pricing, Coupons, Loader, Test mode, Team, Profile, App settings | Planned |
| 6 | Push and security | FCM, channels, device registration, biometric lock, FLAG_SECURE, update checks | Needs the owner's `google-services.json` for the FCM part |
| 7 | Live API switch-over | Flip `EXPO_PUBLIC_API_MODE=live`, run every screen on real data, fix schema drift | Waits for the owner to say the API is live |
| 8 | Automation foundations | Module flags, ApprovalCard, JobProgress, hidden `/assistant` route, extensible deep links | Foundations land in phase 1 and 2; finished in 8 |

Each phase ends with: typecheck and lint clean, unit tests green, a static review against the brief, and a short report with a checklist the owner runs on his phone (from phase 2 on, the owner does the on-device checks to save build time).

## Folder layout

```
app/                      Expo Router routes (thin: each file re-exports a screen from src/modules)
  _layout.tsx             providers, boot splash, auth-guarded root stack
  +native-intent.tsx      rewrites incoming /admin deep links to app routes
  sign-in.tsx, update-required.tsx
  (app)/_layout.tsx       signed-in native stack
  (app)/(tabs)/           Home, Inbox, Customers, Marketing (owner), More
  (app)/...               every pushed screen (clients/[id], blog/[id], pricing, ...)
src/
  api/                    typed client, errors, query client, zod schemas, endpoints per domain
    mock/                 mock transport, fixtures and routes per domain (same contract as live)
  auth/                   supabase client, mock auth, session store, sign-in, update screen
  design/                 tokens, theme provider, typography, motion presets, haptics map
  components/             the design-system kit (+ sheet/, form/, charts/, automation/)
  loader/                 the black hole loader (keyframe math, settings, Skia variants, boot splash)
  modules/<module>/       one folder per feature: module.ts manifest, screens, hooks, components
  modules/registry.ts     tabs, More, search, quick actions and shortcuts are generated from here
  lib/                    env, encrypted storage, prefs, connectivity, notices, deep links, money, dates
plugins/                  local config plugins (launcher label)
scripts/                  icon generation from the logo paths
docs/                     plan, decisions, API requests, screenshots
```

## Libraries (installed versions)

Expo SDK 57 pins most native versions; everything native was installed with `npx expo install`.

| Concern | Library | Version |
|---|---|---|
| Framework | expo / react-native / react | 57.0.26 / 0.86.3 / 19.2.3 (New Architecture, Hermes, React Compiler) |
| Navigation | expo-router (JS tabs + native stack) | 57.0.24 |
| Animation | react-native-reanimated / react-native-worklets | 4.5.1 / 0.10.1 |
| Gestures | react-native-gesture-handler | 2.32 |
| Drawing, charts | @shopify/react-native-skia (charts are hand-rolled Skia paths) | 2.6.2 |
| Lists | @shopify/flash-list | 2.0.2 |
| Server state | @tanstack/react-query + persist client + async storage persister | 5.104 |
| Local state | zustand | 5.0.15 |
| Storage | react-native-mmkv (AES-256, key in the Android Keystore via expo-secure-store) | 4.3.2 |
| Auth | @supabase/supabase-js (sign-in and token refresh only) | 2.117 |
| Bottom sheets | our own (`src/components/sheet`), see decisions | |
| Icons | lucide-react-native | 1.49 |
| Fonts | Geist 400 to 900 and Geist Mono 400/500, embedded at build time (expo-font plugin) | @expo-google-fonts 0.4 |
| Haptics, images, browser | expo-haptics, expo-image, expo-web-browser | 57.x |
| Push | expo-notifications (+ FCM once the owner provides google-services.json) | 57.0.21 |
| Biometrics, privacy | expo-local-authentication, expo-screen-capture | 57.x |
| Shortcuts | expo-quick-actions (dynamic Android shortcuts) | 6.0.2 |
| Keyboard | react-native-keyboard-controller | 1.21.9 |
| Validation | zod | 4.6.5 |
| Dates | Intl.DateTimeFormat with `timeZone` + `formatToParts` (Hermes), helpers in `src/lib/dates.ts` | |
| QR codes | qrcode-generator, drawn with Skia | 2.0.4 |
| Tests | jest + jest-expo | 29 / 57 |

## Tooling on this machine

- Node 22.23 (via nvm; `.nvmrc` says 22). React Native 0.86 needs Node 22.13 or newer.
- JDK 17, Android SDK platform 36, build-tools 36, NDK 27.1.12297006.
- Emulator: `Tekmadev_API35` (Android 15, Pixel 7 profile).
- Debug APK: `cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a`.
