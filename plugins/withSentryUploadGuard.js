// Sentry's build steps upload source maps (Android and iOS) and debug symbols (iOS)
// after every release bundle, and fail the build when they cannot (no auth token).
// The token lives only on the owner's Mac (.env.sentry.local, docs/release-signing.md),
// so every other build must skip the upload instead of failing.
//
// scripts/build-apk.sh and scripts/ios-device.sh already set SENTRY_DISABLE_AUTO_UPLOAD
// when the token is missing. This plugin applies the same rule inside the native
// builds, so Gradle, xcodebuild, Xcode and `expo run` behave the same way when started
// directly: no SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT in the environment, no upload.
//
// - iOS: ios/.xcode.env (sourced by "Bundle React Native code and images" and by
//   "Upload Debug Symbols to Sentry") exports SENTRY_DISABLE_AUTO_UPLOAD=true.
// - Android: android/app/build.gradle turns off sentry.gradle's upload switch
//   (shouldSentryAutoUploadGeneral, the closure it checks for SENTRY_DISABLE_AUTO_UPLOAD).
//
// Remove it together with @sentry/react-native, or if builds move to EAS with the
// token stored as an EAS secret. Check after each Sentry upgrade that sentry.gradle
// still defines shouldSentryAutoUploadGeneral (a stale name fails loudly: the upload
// runs and the build stops on the missing token).
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const TAG = 'tekmadev-sentry-upload-guard';

const XCODE_ENV = `# Upload to Sentry only when the build has a token, org and project (.env.sentry.local).
if [ -z "$SENTRY_AUTH_TOKEN" ] || [ -z "$SENTRY_ORG" ] || [ -z "$SENTRY_PROJECT" ]; then
  export SENTRY_DISABLE_AUTO_UPLOAD=true
fi`;

const GRADLE = `// Upload to Sentry only when the build has a token, org and project (.env.sentry.local).
if (!System.getenv('SENTRY_AUTH_TOKEN') || !System.getenv('SENTRY_ORG') || !System.getenv('SENTRY_PROJECT')) {
    project.ext.shouldSentryAutoUploadGeneral = { -> false }
}`;

// Appends the block at the end of the file, replacing an older copy (prebuild without
// --clean runs this again on the same file).
function upsertBlock(src, body, comment) {
  const begin = `${comment} @generated begin ${TAG}`;
  const end = `${comment} @generated end ${TAG}`;
  let kept = src;
  const from = src.indexOf(begin);
  if (from !== -1) {
    const to = src.indexOf(end, from);
    kept = src.slice(0, from) + (to === -1 ? '' : src.slice(to + end.length));
  }
  return `${kept.trimEnd()}\n\n${begin} (plugins/withSentryUploadGuard.js)\n${body}\n${end}\n`;
}

function withXcodeEnvGuard(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, '.xcode.env');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      fs.writeFileSync(file, upsertBlock(current, XCODE_ENV, '#'));
      return cfg;
    },
  ]);
}

function withGradleGuard(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withSentryUploadGuard: expected a Groovy android/app/build.gradle');
    // At the end of the file, so it runs after sentry.gradle (applied above "android {") defines the switch.
    cfg.modResults.contents = upsertBlock(cfg.modResults.contents, GRADLE, '//');
    return cfg;
  });
}

module.exports = function withSentryUploadGuard(config) {
  return withGradleGuard(withXcodeEnvGuard(config));
};
