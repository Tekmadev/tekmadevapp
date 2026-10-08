#!/usr/bin/env bash
# Build a release APK with a new version (every build gets one).
#   scripts/build-apk.sh minor|major|launch   (minor: 0.2.0 -> 0.2.1, major: 0.2.1 -> 0.3.0)
# Needs Node, the Android SDK and JDK 17 on PATH. Output: dist/tekmadev-admin-<version>.apk
# Installs it on a connected phone when adb sees one (NO_INSTALL=1 builds only).
# Publishes it for in-app updates when .env.release.local is set up (NO_PUBLISH=1 skips that).
#
# Signing: Tekmadev's own key from credentials/android/ (docs/release-signing.md);
# without it the APK is signed with the shared debug key and a warning is printed.
# Sentry: source maps are uploaded only when .env.sentry.local (gitignored) sets
# SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT; otherwise the build skips the upload.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.sentry.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.sentry.local
  set +a
fi
if [ -z "${SENTRY_AUTH_TOKEN:-}" ] || [ -z "${SENTRY_ORG:-}" ] || [ -z "${SENTRY_PROJECT:-}" ]; then
  export SENTRY_DISABLE_AUTO_UPLOAD=true
  echo "SENTRY_UPLOAD_OFF (no token, org and project in .env.sentry.local)"
else
  echo "SENTRY_UPLOAD_ON"
fi

RELEASE_KEY=credentials/android/keystore.properties
if [ ! -f "$RELEASE_KEY" ]; then
  echo "WARNING: $RELEASE_KEY is missing, so this APK is signed with the shared debug key"
  echo "WARNING: and will not install over the app signed with Tekmadev's key. Restore credentials/ from your backup (docs/release-signing.md)."
fi

VERSION_LINE=$(node scripts/bump-version.mjs "${1:-minor}")
VERSION=${VERSION_LINE%% *}
echo "Building Tekmadev Admin $VERSION_LINE"

npx expo prebuild -p android --no-install >/dev/null
(cd android && ./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a)

mkdir -p dist
OUT="dist/tekmadev-admin-$VERSION.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo "APK_READY $OUT"

# In-app updates: upload the APK and tell the server the new version
# (scripts/publish-apk.mjs, needs .env.release.local). A failed publish never
# fails the build: the APK is still in dist/.
if [ "${NO_PUBLISH:-}" = "1" ]; then
  echo "PUBLISH_SKIPPED (NO_PUBLISH=1)"
elif [ ! -f "$RELEASE_KEY" ]; then
  echo "PUBLISH_SKIPPED (signed with the debug key: phones on Tekmadev's key would refuse it)"
else
  node scripts/publish-apk.mjs "$OUT" "$VERSION" || echo "PUBLISH_FAILED: the APK is still in $OUT"
fi

if [ "${NO_INSTALL:-}" = "1" ]; then
  echo "INSTALL_SKIPPED (NO_INSTALL=1)"
elif adb get-state >/dev/null 2>&1; then
  if INSTALL_LOG=$(adb install -r "$OUT" 2>&1); then
    echo "$INSTALL_LOG"
    adb shell monkey -p com.tekmadev.admin -c android.intent.category.LAUNCHER 1 >/dev/null && echo "APK_INSTALLED $VERSION"
  else
    echo "$INSTALL_LOG"
    if [[ "$INSTALL_LOG" == *INSTALL_FAILED_UPDATE_INCOMPATIBLE* ]]; then
      if [ -f "$RELEASE_KEY" ]; then
        echo "INSTALL_NEEDS_UNINSTALL: the app on the phone was signed with the old debug key, and this APK is"
        echo "signed with Tekmadev's own key, so Android will not update it in place. This happens once per phone."
        echo "  1. On the phone, uninstall Tekmadev Admin (long-press the icon, then Uninstall)."
        echo "     You sign in again afterwards; nothing on the server is touched."
        echo "  2. Install this same APK again (no new version needed):"
        echo "       adb install -r \"$OUT\""
      else
        echo "INSTALL_WRONG_KEY: the phone has the app signed with Tekmadev's key, and this APK has the debug key."
        echo "Do not uninstall: restore credentials/ from your backup (docs/release-signing.md) and build again."
      fi
    fi
    exit 1
  fi
else
  echo "PHONE_NOT_CONNECTED"
fi
