// iOS 27 stops any app at launch that has not adopted the UIScene life cycle
// (UIKit traps in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
// Expo SDK 57 ships the pieces (ExpoAppSceneDelegate, ExpoReactNativeFactoryProvider)
// but its project template still creates the window in the app delegate. This
// plugin adopts the scene life cycle the way those classes expect:
//
// - AppDelegate conforms to ExpoReactNativeFactoryProvider and only creates the
//   React Native factory; it no longer creates the window or starts React Native.
// - SceneDelegate (a subclass of ExpoAppSceneDelegate, declared in AppDelegate.swift
//   so no new file has to be added to the Xcode project) creates the window from
//   the scene and starts React Native into it, and forwards URLs, universal links,
//   quick actions and life-cycle events back to the app delegate.
// - Info.plist declares the scene configuration.
//
// Remove it once Expo's template adopts the scene life cycle itself (a future SDK).
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const CLASS_DECL = 'class AppDelegate: ExpoAppDelegate {';
const CLASS_DECL_SCENE = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';
const START_BLOCK = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/;
const START_NOTE =
  '    // The window is created and React Native started by SceneDelegate (the UIScene life cycle,\n' +
  '    // required by iOS 27). See plugins/withSceneLifecycle.js.\n';
const SCENE_DELEGATE = `
// The app's UIWindowSceneDelegate (UIApplicationSceneManifest in Info.plist). See plugins/withSceneLifecycle.js.
class SceneDelegate: ExpoAppSceneDelegate {}
`;

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle: expected a Swift AppDelegate');
    }
    let src = cfg.modResults.contents;
    if (src.includes(CLASS_DECL_SCENE)) return cfg; // already applied
    if (!src.includes(CLASS_DECL) || !START_BLOCK.test(src)) {
      throw new Error('withSceneLifecycle: the AppDelegate template changed; update plugins/withSceneLifecycle.js');
    }
    src = src.replace(CLASS_DECL, CLASS_DECL_SCENE).replace(START_BLOCK, START_NOTE);
    cfg.modResults.contents = src.trimEnd() + '\n' + SCENE_DELEGATE;
    return cfg;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneManifest(withSceneAppDelegate(config));
};
