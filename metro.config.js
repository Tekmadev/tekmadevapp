// Expo's default Metro config plus Sentry's additions (src/lib/monitoring.ts): a Debug ID
// in every bundle and source map, so crash reports match the uploaded source maps, and
// Sentry's own frames collapsed in LogBox.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
