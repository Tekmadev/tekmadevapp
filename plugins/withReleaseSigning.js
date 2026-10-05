// Release APKs are signed with Tekmadev's own key instead of the debug key that
// React Native's template uses (the same public key on every developer's machine,
// so anyone could sign an "update" to the app). The key and its passwords live in
// credentials/android/ at the project root, which is gitignored and backed up by
// the owner (docs/release-signing.md):
//
//   credentials/android/keystore.properties   storeFile, storePassword, keyAlias, keyPassword
//   credentials/android/tekmadev-release.keystore
//
// android/app/build.gradle reads keystore.properties at build time (storeFile is
// relative to that file unless absolute). When the file is missing, release builds
// keep the debug key, so a fresh clone still builds; scripts/build-apk.sh warns.
//
// Keep this plugin for as long as the app is built locally. Remove it if builds
// move to EAS with remote credentials (EAS then injects its own signing config).
const { withAppBuildGradle } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const TAG = 'tekmadev-release-signing';

const LOAD_PROPERTIES = `// Tekmadev release key (plugins/withReleaseSigning.js). Without the file, release builds use the debug key.
def tekmadevSigningFile = new File(rootDir.parentFile, 'credentials/android/keystore.properties')
def tekmadevSigning = null
if (tekmadevSigningFile.exists()) {
    def props = new Properties()
    tekmadevSigningFile.withInputStream { props.load(it) }
    def store = new File(props.getProperty('storeFile', ''))
    if (!store.isAbsolute()) store = new File(tekmadevSigningFile.parentFile, store.path)
    tekmadevSigning = [
        storeFile: store,
        storePassword: props.getProperty('storePassword'),
        keyAlias: props.getProperty('keyAlias'),
        keyPassword: props.getProperty('keyPassword'),
    ]
}`;

const RELEASE_CONFIG = `        if (tekmadevSigning != null) {
            release {
                storeFile tekmadevSigning.storeFile
                storePassword tekmadevSigning.storePassword
                keyAlias tekmadevSigning.keyAlias
                keyPassword tekmadevSigning.keyPassword
            }
        }`;

// The template's release build type signs with the debug key; it is the first
// "signingConfig signingConfigs.debug" after "release {" inside buildTypes.
const RELEASE_USES_DEBUG = /(buildTypes \{[\s\S]*?\n\s*release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
const RELEASE_USES_OURS = 'signingConfig(tekmadevSigning != null ? signingConfigs.release : signingConfigs.debug)';

// Idempotent (prebuild without --clean runs this again on the same file); throws if the anchor is gone.
function merge(src, newSrc, tag, anchor, offset) {
  return mergeContents({ tag, src, newSrc, anchor, offset, comment: '//' }).contents;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withReleaseSigning: expected a Groovy android/app/build.gradle');
    let src = cfg.modResults.contents;
    src = merge(src, LOAD_PROPERTIES, `${TAG}-load`, /^android \{/, 0);
    src = merge(src, RELEASE_CONFIG, `${TAG}-config`, /^\s*signingConfigs \{/, 1);
    if (!src.includes(RELEASE_USES_OURS)) {
      if (!RELEASE_USES_DEBUG.test(src)) {
        throw new Error('withReleaseSigning: the release build type no longer uses signingConfigs.debug; update plugins/withReleaseSigning.js');
      }
      src = src.replace(RELEASE_USES_DEBUG, `$1${RELEASE_USES_OURS}`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
