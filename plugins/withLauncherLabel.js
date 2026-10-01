// The app is called "Tekmadev Admin" (settings, recents, store listing), but the
// launcher shows the shorter "Tekmadev". Android reads the launcher label from the
// main activity, so we give that activity its own string resource.
const { withAndroidManifest, withStringsXml, AndroidConfig } = require('expo/config-plugins');

const LABEL_KEY = 'launcher_label';

function withLauncherLabel(config, { label = 'Tekmadev' } = {}) {
  config = withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: LABEL_KEY, translatable: 'false' }, _: label }],
      cfg.modResults,
    );
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:label'] = `@string/${LABEL_KEY}`;
    return cfg;
  });

  return config;
}

module.exports = withLauncherLabel;
