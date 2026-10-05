#!/usr/bin/env bash
# Build the iOS app (Debug) for a simulator, install it and open it. The JS
# comes from Metro on :8081, so start the dev server first (npx expo start).
#   scripts/ios-sim.sh ["iPhone 18 Pro" | <simulator udid>]
# The project path has a space ("React Native"): plugins/withPathSpacesFix.js
# fixes the one iOS build script that breaks on it.
set -euo pipefail
cd "$(dirname "$0")/.."
WANT="${1:-iPhone 18 Pro}"
export LANG=en_US.UTF-8
npx expo run:ios --device "$WANT" --no-bundler
echo "IOS_SIM_READY $WANT"
