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
- **Sensitive media permissions are blocked** (READ_MEDIA_*, DETECT_SCREEN_CAPTURE, RECORD_AUDIO). Saving a QR code to Photos uses MediaStore, which needs no read permission on Android 11+.
- **Auth modes**: `EXPO_PUBLIC_AUTH_MODE=mock` signs in against fixture staff accounts (owner and manager, plus a portal user that `/me` rejects). `supabase` uses the real Tekmadev project. With real Supabase sign-in and the mock API, `EXPO_PUBLIC_MOCK_OWNER_EMAILS` lists which real emails the mock `/me` treats as owners. Without that, a real account is rejected with "That account is not allowed here.", like the server would.
- **TanStack persistence uses the async storage persister** (the sync persister is deprecated in 5.104). It is backed by synchronous MMKV, so restore is effectively instant.
- **The mock transport behaves like the server**: same envelope, status codes, error codes and messages, owner-only 403s, idempotency keys honoured (a repeated key returns the first response), opaque cursors, microsecond timestamps, and in-memory state that mutations change. Dev-only controls (Kit screen) can fail requests, go offline, expire tokens and force a 426.

### Motion and UI
- **Our own bottom sheet** instead of `@gorhom/bottom-sheet`. Version 5.2.14 crashes on any Dimensions change with this worklets version (keyboard show/hide included) and has several open Android bugs. Ours is built on Reanimated, Gesture Handler and keyboard-controller, rendered in a root portal (same window, so FLAG_SECURE covers it), and closes on Android back.
- **Hermes Intl is limited** (only DateTimeFormat and NumberFormat), so plurals and relative times are small hand-written helpers rather than Intl.PluralRules / RelativeTimeFormat polyfills.
- **The loader keyframe math is pure, unit-tested code** (`src/loader/keyframes.ts`) shared by every variant. Its CSS cubic-bezier solver runs as a worklet on the UI thread.
