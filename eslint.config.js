// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/**
 * Fonts are resolved per platform in src/design/typography.ts: Android takes the
 * family plus a weight, iOS needs the PostScript name of each weight's file. A
 * raw fontFamily or fontWeight anywhere else would render the system font (or
 * the wrong weight) on iPhone.
 */
const FONT_RULE = [
  'error',
  {
    selector: "Property[key.name='fontFamily']",
    message: 'Use a type variant, the family prop of <Text>, or fontFace() from @/design/typography (iOS needs a face per weight).',
  },
  {
    selector: "Property[key.name='fontWeight']",
    message: 'Use the weight prop of <Text>, or fontFace() from @/design/typography (iOS needs a face per weight).',
  },
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*', 'node_modules/*', 'coverage/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    ignores: ['src/design/typography.ts', '**/__tests__/**'],
    rules: { 'no-restricted-syntax': FONT_RULE },
  },
]);
