// This project lives under "React Native", a path with a space. Two iOS build
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
//
// Remove this plugin if the project moves to a path without spaces or Expo
// fixes the quoting (check after each SDK upgrade: a no-op is harmless).
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
      if (phase.shellScript.includes(UNQUOTED)) phase.shellScript = phase.shellScript.replace(UNQUOTED, QUOTED);
    }
    return cfg;
  });
}

module.exports = function withPathSpacesFix(config) {
  return withQuotedBundlePhase(withQuotedPodPhase(config));
};
