// This project lives under "React Native", a path with a space. Four iOS build
// phases break on it, and every other one quotes its paths:
//
// 1. expo-constants' "Generate app.config" (Pods project) runs
//      bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"
//    (the path splits at the space: "React: is a directory"), and the script
//    then runs `basename $PROJECT_DIR` unquoted, which would skip writing
//    app.config, so a Release build would ship without Constants.expoConfig.
//    The Podfile's post_install rewrites that phase to quote the path and pass
//    PROJECT_DIR and PROJECT_ROOT in a form the script reads correctly.
// 2. "Bundle React Native code and images" (the app project) runs the path of
//    react-native-xcode.sh from a backtick substitution, unquoted. It is
//    rewritten to run it as "$(...)".
// 3. With @sentry/react-native, its plugin rewrites that same line to
//      /bin/sh `<path of sentry-xcode.sh>` `<path of react-native-xcode.sh>`
//    Both substitutions are quoted, and react-native-xcode.sh is passed relative
//    to ios/ (../node_modules/...): with uploads off, sentry-xcode.sh runs it as
//    `/bin/sh -c "$1"`, which would split an absolute path at the space again.
// 4. Sentry's "Upload Debug Symbols to Sentry" phase runs
//      /bin/sh `<path of sentry-xcode-debug-files.sh>`
//    and is rewritten to /bin/sh "$(...)".
//
// Expo applies Xcode mods in reverse plugin order, so this plugin must be listed
// before @sentry/react-native in app.json to see (and quote) what Sentry adds.
// It throws when the order is wrong.
//
// Remove this plugin if the project moves to a path without spaces or Expo and
// Sentry fix the quoting (check after each SDK upgrade: a no-op is harmless).
const { withPodfile, withXcodeProject } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const RUBY = `
    # tekmadev: quote expo-constants' app.config phase (path with a space, plugins/withPathSpacesFix.js)
    installer.pods_project.targets.each do |target|
      target.shell_script_build_phases.each do |phase|
        next unless phase.shell_script.include?('scripts/get-app-config-ios.sh')
        phase.shell_script = 'bash -l -c "PROJECT_DIR=/Pods PROJECT_ROOT=\\"$PODS_ROOT/../..\\" \\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\""'
      end
    end
`;

// The bundling phase's last line, as stored in project.pbxproj (escaped), and its quoted form.
const RN_XCODE = String.raw`\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\"`;
const UNQUOTED = '`' + RN_XCODE + '`';
const QUOTED = String.raw`\"$(` + RN_XCODE + String.raw`)\"`;

// The same line after Sentry's plugin (3), and its quoted form.
const SENTRY_XCODE = String.raw`\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'\"`;
const RN_XCODE_RELATIVE = String.raw`\"$NODE_BINARY\" --print \"require('path').relative(process.cwd(), require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh')\"`;
const SENTRY_UNQUOTED = '/bin/sh `' + SENTRY_XCODE + '` `' + RN_XCODE + '`';
const SENTRY_QUOTED = String.raw`/bin/sh \"$(` + SENTRY_XCODE + String.raw`)\" \"$(` + RN_XCODE_RELATIVE + String.raw`)\"`;

// Sentry's debug symbols phase (4), and its quoted form.
const DEBUG_FILES = '${NODE_BINARY:-node}' + String.raw` --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode-debug-files.sh'\"`;
const DEBUG_FILES_UNQUOTED = '/bin/sh `' + DEBUG_FILES + '`';
const DEBUG_FILES_QUOTED = String.raw`/bin/sh \"$(` + DEBUG_FILES + String.raw`)\"`;

const FIXES = [
  [SENTRY_UNQUOTED, SENTRY_QUOTED], // before UNQUOTED: it contains it
  [UNQUOTED, QUOTED],
  [DEBUG_FILES_UNQUOTED, DEBUG_FILES_QUOTED],
];

function withQuotedPodPhase(config) {
  return withPodfile(config, (cfg) => {
    const result = mergeContents({
      tag: 'tekmadev-path-spaces-fix',
      src: cfg.modResults.contents,
      newSrc: RUBY,
      anchor: /post_install do \|installer\|/,
      offset: 1,
      comment: '#',
    });
    if (!result.didMerge && !result.didClear && !cfg.modResults.contents.includes('tekmadev-path-spaces-fix')) {
      throw new Error('withPathSpacesFix: could not find "post_install do |installer|" in the Podfile');
    }
    cfg.modResults.contents = result.contents;
    return cfg;
  });
}

function withQuotedBundlePhase(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const phase of Object.values(phases)) {
      if (typeof phase !== 'object' || typeof phase.shellScript !== 'string') continue;
      for (const [unquoted, quoted] of FIXES) {
        // A function, so "$" in the shell code is never read as a replacement pattern.
        if (phase.shellScript.includes(unquoted)) phase.shellScript = phase.shellScript.replace(unquoted, () => quoted);
      }
    }
    return cfg;
  });
}

// Plugin entries are a name or [name, props]; names are compared as written in app.json.
function assertListedBeforeSentry(config) {
  const names = (config.plugins ?? []).map((entry) => (Array.isArray(entry) ? entry[0] : entry));
  const self = names.findIndex((name) => typeof name === 'string' && name.endsWith('withPathSpacesFix.js'));
  const sentry = names.findIndex((name) => typeof name === 'string' && name.startsWith('@sentry/react-native'));
  if (self !== -1 && sentry !== -1 && self > sentry) {
    throw new Error('withPathSpacesFix: list it before @sentry/react-native in app.json "plugins" (see the comment at the top)');
  }
}

module.exports = function withPathSpacesFix(config) {
  assertListedBeforeSentry(config);
  return withQuotedBundlePhase(withQuotedPodPhase(config));
};
