#!/usr/bin/env node
/**
 * Bump the app version before every APK build (owner's rule: every update gets a
 * new version). The Android versionCode (and the iOS buildNumber, once iOS is
 * added) always goes up by one. The owner's numbering:
 *
 *   node scripts/bump-version.mjs minor    # small update (fixes, tweaks)   0.2.0 -> 0.2.1
 *   node scripts/bump-version.mjs major    # big update (new features)      0.2.1 -> 0.3.0
 *   node scripts/bump-version.mjs launch   # the official launch            0.3.0 -> 1.0.0
 *
 * ("patch" is accepted as another name for minor.)
 * Writes app.json only; `expo prebuild` carries the numbers into android/.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const arg = process.argv[2] ?? 'minor';
const kind = arg === 'patch' ? 'minor' : arg;
if (!['minor', 'major', 'launch'].includes(kind)) {
  console.error('Usage: node scripts/bump-version.mjs minor|major|launch');
  process.exit(1);
}

const file = new URL('../app.json', import.meta.url);
const config = JSON.parse(readFileSync(file, 'utf8'));
const expo = config.expo;

const [major, minor, patch] = String(expo.version ?? '0.0.0').split('.').map((n) => Number.parseInt(n, 10) || 0);
const next =
  kind === 'launch' ? `${major + 1}.0.0` : kind === 'major' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;

expo.version = next;
expo.android = { ...expo.android, versionCode: (expo.android?.versionCode ?? 0) + 1 };
if (expo.ios) expo.ios = { ...expo.ios, buildNumber: String(Number.parseInt(expo.ios.buildNumber ?? '0', 10) + 1) };

writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`${next} (versionCode ${expo.android.versionCode})`);
