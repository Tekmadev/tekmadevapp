#!/usr/bin/env bash
# Build a Release iOS app and install it on a connected iPhone, signed with a
# FREE Apple ID (Xcode "Personal Team"). No paid Apple Developer account needed.
#   scripts/ios-device.sh            (the only connected iPhone)
#   scripts/ios-device.sh <device id from: xcrun devicectl list devices>
#
# Before the first run (once):
#   1. Xcode > Settings > Accounts > + > Apple ID: sign in with your Apple ID.
#   2. Plug the iPhone into the Mac, unlock it, tap Trust.
#   3. iPhone: Settings > Privacy & Security > Developer Mode > On (it restarts).
# After the first install: iPhone > Settings > General > VPN & Device
# Management > your Apple ID > Trust. Free installs stop opening after 7 days:
# run this again to renew.
#
# Free signing limits: no push notifications (the aps-environment entitlement
# is dropped for this build) and a separate bundle id
# (com.tekmadev.admin.personal), so the real one, com.tekmadev.admin, stays
# free for the paid account and the App Store. The JS is bundled into the app
# (Release), so it runs without the dev server, against the API in .env.
#
# Sentry: source maps and debug symbols are uploaded only when .env.sentry.local
# (gitignored, docs/release-signing.md) sets SENTRY_AUTH_TOKEN, SENTRY_ORG and
# SENTRY_PROJECT; otherwise the build skips the upload.
set -euo pipefail
cd "$(dirname "$0")/.."
BUNDLE_ID="com.tekmadev.admin.personal"

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

# The team: the Personal Team of the Apple ID signed in to Xcode.
TEAM=$(defaults export com.apple.dt.Xcode - 2>/dev/null | plutil -extract IDEProvisioningTeamByIdentifier json -o - - 2>/dev/null | node -e '
  let data = ""; process.stdin.on("data", (c) => (data += c)).on("end", () => {
    let teams = [];
    try { teams = Object.values(JSON.parse(data)).flat(); } catch {}
    const pick = teams.find((t) => t.isFreeProvisioningTeam) || teams[0];
    if (pick) console.log(pick.teamID);
  });
' || true)
if [ -z "$TEAM" ]; then
  echo "NO_TEAM: sign in to Xcode first (Xcode > Settings > Accounts > + > Apple ID), then run this again."
  exit 1
fi

DEVICE="${1:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(xcrun devicectl list devices --json-output /dev/stdout 2>/dev/null | node -e '
    let data = ""; process.stdin.on("data", (c) => (data += c)).on("end", () => {
      const s = data.slice(data.indexOf("{"));
      let devices = [];
      try { devices = JSON.parse(s).result.devices; } catch {}
      const phones = devices.filter((d) => d.hardwareProperties?.platform === "iOS" && d.connectionProperties?.tunnelState !== "unavailable");
      if (phones[0]) console.log(phones[0].hardwareProperties.udid);
    });
  ' || true)
fi
if [ -z "$DEVICE" ]; then
  echo "NO_DEVICE: plug in the iPhone, unlock it and tap Trust, then run this again."
  exit 1
fi

if [ ! -d ios/Pods ]; then
  (cd ios && LANG=en_US.UTF-8 pod install)
fi

echo "Building Release for iPhone $DEVICE, team $TEAM, bundle id $BUNDLE_ID"
xcodebuild \
  -workspace ios/TekmadevAdmin.xcworkspace \
  -scheme TekmadevAdmin \
  -configuration Release \
  -destination "id=$DEVICE" \
  -derivedDataPath ios/build-device \
  -allowProvisioningUpdates \
  -quiet \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Automatic \
  PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  CODE_SIGN_ENTITLEMENTS="" \
  build

APP="ios/build-device/Build/Products/Release-iphoneos/TekmadevAdmin.app"
xcrun devicectl device install app --device "$DEVICE" "$APP"
xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE_ID" || echo "Installed. If it does not open: iPhone > Settings > General > VPN & Device Management > Trust, then tap the app."
echo "IOS_DEVICE_READY $DEVICE"
