#!/usr/bin/env node
/**
 * Bump the app version before every APK build (owner's rule: every update gets a
 * new version). Semver for the version name, and the Android versionCode (and the
 * iOS buildNumber, once iOS is added) always goes up by one.
 *
 *   node scripts/bump-version.mjs patch   # fixes            0.2.0 -> 0.2.1
 *   node scripts/bump-version.mjs minor   # new features      0.2.1 -> 0.3.0
 *   node scripts/bump-version.mjs major   # big releases      0.3.0 -> 1.0.0
 *
 * Writes app.json only; `expo prebuild` carries the numbers into android/.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const kind = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('Usage: node scripts/bump-version.mjs patch|minor|major');
  process.exit(1);
}

const file = new URL('../app.json', import.meta.url);
const config = JSON.parse(readFileSync(file, 'utf8'));
const expo = config.expo;

const [major, minor, patch] = String(expo.version ?? '0.0.0').split('.').map((n) => Number.parseInt(n, 10) || 0);
const next =
  kind === 'major' ? `${major + 1}.0.0` : kind === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;

expo.version = next;
expo.android = { ...expo.android, versionCode: (expo.android?.versionCode ?? 0) + 1 };
if (expo.ios) expo.ios = { ...expo.ios, buildNumber: String(Number.parseInt(expo.ios.buildNumber ?? '0', 10) + 1) };

writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`${next} (versionCode ${expo.android.versionCode})`);
