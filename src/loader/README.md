# The black hole loader

The Tekmadev logo as a loader (brief section 5). The inner hooks spin a full turn clockwise while the outer arcs spin half a turn counterclockwise, everything is pulled toward the centre at the peak, then released into the logo to rest. It must match the website frame for frame, so the motion lives in one place (`keyframes.ts`) and every variant draws from it.

Import from `@/loader`.

## Which one to use

| Component | Where | Size | Beat | Colour |
|---|---|---|---|---|
| `PageLoader` | A screen or section with nothing to show yet | 72dp (`size`) | `beatMs` | gold |
| `ButtonSpinner` | Inside a pending button, left of the pending label | about 1.15x the label font size | `buttonBeatMs` | the button's text colour |
| `InlineLoader` | Row-level work, e.g. a row being saved | 14 to 16dp (default 16) | `buttonBeatMs` | gold (or `color`) |
| `PullToRefreshIndicator` | Inside `Screen`'s pull to refresh slot | 36dp | `beatMs` while refreshing | gold |
| `TopProgress` | Under a header while a visible screen refetches | 2dp hairline, full width | none | gold |
| `BootSplash` | Once, at the root, over the navigator at cold start | matches the native splash | `beatMs` while waiting | gold on `bg` |
| `BreathingMark` | The sign-in hero | any | one soft beat every 6s | gold (or `color`) |
| `BlackHole` | The raw animated mark, for anything not covered above | any | `beatMs` (or `beatMs` prop) | gold (or `color`) |
| `LogoMark` | Static mark: EmptyState watermark, avatars, the QR centre | any | none | gold (or `color`) |

Rules of thumb:

- Each animated mark is its own Skia canvas (a GPU surface). Never put one per row in a list; use a single `PageLoader` or `TopProgress`, and `LogoMark` (plain SVG) wherever the mark does not move.
- `PageLoader` stays invisible for `showAfterMs` and then fades in over 250ms, so a fast load never flashes it. Mount it as soon as you are loading; do not add your own delay.
- `ButtonSpinner` is decorative. The button's pending label ("Saving") is what TalkBack reads.
- `TopProgress` is for background refetches only (data already on screen). A first load uses `PageLoader` or a skeleton.

## How it runs

- `keyframes.ts` is the spec as pure math: `beatFrame(p, params)` gives the pose of every piece at progress `p` of one beat, with `cubic-bezier(0.55, 0, 0.2, 1)` applied per segment like CSS keyframes. It is unit tested against a reference solver.
- `pose.ts` turns a pose into Skia transforms (radians, pivot on the logo centre `1500, 1500`).
- `MarkCanvas.tsx` is the one scene everyone draws: the four paths, parsed once at module scope, the outer arcs and the inner hooks in their own groups.
- A Reanimated frame callback advances the beat on the UI thread. Every pose is a derived value, so there is no JS work and no React render per frame, and a busy JS thread never stutters the loader. During the rest part of each beat the progress holds still, so the canvas does not redraw an identical logo.

## Settings: from the server to the UI thread

1. `GET /me` returns `loader` (beatMs, buttonBeatMs, innerPull, outerPull, innerFade, showAfterMs), tuned by the owner in the web admin (Admin, Loader) or the app (More, Loader).
2. `src/auth/session.ts` calls `useLoaderStore.getState().apply(me.loader)` whenever `/me` lands, and with the cached `/me` at boot.
3. `apply` clamps every value to its range (non-numbers fall back to the default, see `settings.ts`) and caches the result in encrypted MMKV, so the next cold start, the boot splash included, uses the owner's values before `/me` answers.
4. Components read `useLoaderSettings()`. The Loader screen should call `useLoaderStore.getState().preview(values)` while the owner drags a slider, and `preview(null)` when it saves or leaves; a preview wins over the saved values everywhere, live.
5. Each animated component copies the values into shared values. The next frame on the UI thread uses them, mid beat, so dragging a slider never restarts or janks the beat.

## Reduced motion

When Android "Remove animations" is on (`useReduceMotion()`, live):

- Every animated mark stops rotating and scaling. All four paths fade together instead: opacity 1, 0.4, 1 over 1.6s, ease-in-out, forever.
- `TopProgress` shows a still 85% bar while active, then fades.
- `PullToRefreshIndicator` fades the whole logo in with the pull, pulses while refreshing, and fades out.
- `BootSplash` has no pull together and no slide: the mark pulses while waiting, then the overlay fades out in 250ms.
- `BreathingMark` is the still logo.

Our own timings pass `ReduceMotion.Never` on purpose: with the default `ReduceMotion.System`, Reanimated would jump them to the end and freeze the pulse that replaces the motion.

## Boot splash

- Render it once at the root, absolutely filling the window, above the navigator, until `onFinish` runs. `ready` is "session restore and `/me` are done".
- The native Android 12+ splash draws `splash-*.png` at 112dp (app.json `imageWidth`), and the mark fills 90% of that image (`scripts/generate-icons.mjs`). `BootSplash` draws the mark at exactly that size (`SPLASH_MARK_SIZE`, 100.8dp for the 2400 unit viewBox), centred in the window, on the same `bg`. Change all three together.
- expo-splash-screen fades the native splash out over about 400ms on top of us, so its still mark melts into our pieces being pulled together (soft spring, 500ms).
- If `ready` is still false after that, the mark beats as the black hole. Once ready (and the pull together is done), the mark shrinks and slides into the Home header while the overlay fades, about 450ms. With `exitTo="header"` (the default) it lands as a 28dp mark at the 16dp gutter, centred on the header row. A beat in progress finishes on the way; no new one starts. Touches pass through as soon as the exit starts. `onFinish` runs exactly once.
- Signed out, pass `exitTo="center"` (the mark fades in place over the sign-in screen), or a window point and size (`{ x, y, size }`) to land exactly on the sign-in hero mark.

## Pull to refresh contract

`PullToRefreshIndicator` takes `pull` (a shared value: 0 at rest, 1 at the trigger point, above 1 for overpull) and `refreshing`. While pulling, the scattered pieces come together in proportion to the pull and lock at 1 with one medium haptic (re-armed below 0.85). On `refreshing` it beats; when `refreshing` turns false it shrinks away on a spring, then stays hidden until `pull` is back near 0. If the caller plays the lock haptic itself, pass `lockHaptic={false}` so it does not fire twice.

## Files

- `keyframes.ts`: beat, reduced motion and scatter math (worklets). Tested in `__tests__/keyframes.test.ts`.
- `settings.ts`: defaults, ranges, clamping, the settings store. Tested in `__tests__/settings.test.ts`.
- `logoPaths.ts`: the four paths, byte for byte from the brief. `scripts/generate-icons.mjs` reads it too.
- `pose.ts`: poses to Skia transforms, bleed and pull helpers. Tested in `__tests__/pose.test.ts`, including the geometry constants measured from the paths.
- `MarkCanvas.tsx`: the shared Skia scene.
- One file per component listed above, and `index.ts`.
