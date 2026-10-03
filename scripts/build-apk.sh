#!/usr/bin/env bash
# Build a release APK with a new version (every build gets one).
#   scripts/build-apk.sh patch|minor|major
# Needs Node, the Android SDK and JDK 17 on PATH. Output: dist/tekmadev-admin-<version>.apk
# Installs it on a connected phone when adb sees one.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION_LINE=$(node scripts/bump-version.mjs "${1:-patch}")
VERSION=${VERSION_LINE%% *}
echo "Building Tekmadev Admin $VERSION_LINE"

npx expo prebuild -p android --no-install >/dev/null
(cd android && ./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a)

mkdir -p dist
OUT="dist/tekmadev-admin-$VERSION.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo "APK_READY $OUT"

if adb get-state >/dev/null 2>&1; then
  adb install -r "$OUT" && adb shell monkey -p com.tekmadev.admin -c android.intent.category.LAUNCHER 1 >/dev/null && echo "APK_INSTALLED $VERSION"
else
  echo "PHONE_NOT_CONNECTED"
fi
