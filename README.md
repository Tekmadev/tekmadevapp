# Tekmadev Admin

The Tekmadev web admin panel as a native Android app (Expo SDK 57, React Native 0.86). The full spec is [PROMPT.md](PROMPT.md); progress and choices live in [docs/plan.md](docs/plan.md), [docs/decisions.md](docs/decisions.md) and [docs/api-requests.md](docs/api-requests.md).

## Run it

```bash
nvm use                      # Node 22.13 or newer
npm install
cp .env.example .env         # mock API and mock sign-in by default
npx expo prebuild -p android
cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a && cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
npx expo start
```

Mock sign-in (dev builds show these as chips under the form):

| Role | Email | Password |
|---|---|---|
| Owner | owner@tekmadev.test | tekmadev-owner |
| Manager | manager@tekmadev.test | tekmadev-manager |

## Checks

```bash
npx tsc --noEmit -p .
npx eslint .
npx jest
```

## Release APK

Every build gets a new version (versionCode always up by one). Small updates bump the last digit, big updates the middle one, and the first digit is for the official launch:

```bash
npm run apk -- minor    # small update: 0.2.0 -> 0.2.1
npm run apk -- major    # big update: 0.2.1 -> 0.3.0
npm run apk -- launch   # official launch: 0.3.0 -> 1.0.0
```

The APK lands in `dist/tekmadev-admin-<version>.apk` and installs on a connected phone. `google-services.json` (Firebase, not in git) must be in the project root.

## Switching to the live API

Set `EXPO_PUBLIC_API_MODE=live` (and `EXPO_PUBLIC_AUTH_MODE=supabase` with the project URL and publishable key) in `.env`, then rebuild the JS bundle. Every response is validated with zod in dev builds and schema drift is logged.

## Hidden Kit screen

Every component in every state, both themes: Settings, About, tap the version 7 times. In dev builds you can also open `tekmadev-admin://kit`.
