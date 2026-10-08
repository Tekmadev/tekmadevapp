#!/usr/bin/env node
// Publish a built APK for in-app updates (owner request 2026-10-08).
//   node scripts/publish-apk.mjs dist/tekmadev-admin-0.5.5.apk 0.5.5
// Run by scripts/build-apk.sh after every build (NO_PUBLISH=1 skips it).
//
// 1. Checks the server does not already offer a newer version.
// 2. Uploads the APK to the private `app-releases` bucket as
//    android/tekmadev-admin.apk (one file, replaced each time).
// 3. Writes latestVersion and apkPath into site_settings.mobile_app.
// GET /me then shows "Update available" with a signed download link to
// signed-in staff (the website's lib/admin-api/version.ts).
//
// Needs .env.release.local (gitignored) with SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (the server key). Without it, nothing is
// published and the build goes on. Never prints the key.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BUCKET = 'app-releases';
const OBJECT_PATH = 'android/tekmadev-admin.apk';
const MAX_BYTES = 50 * 1024 * 1024; // the free plan's largest upload
/**
 * SHA-256 of Tekmadev's release certificate (CN=Tekmadev Innovation Inc.,
 * docs/release-signing.md). Public, not a secret. Phones only accept updates
 * signed with it, so an APK signed with anything else (the shared debug key
 * when credentials/ is missing) is never published.
 */
const RELEASE_CERT_SHA256 = '412dde2c988d58804a11b09c4b919fdb70112b06e83aa9ec6a8f6339724b9bda';

const [apkFile, version] = process.argv.slice(2);

function done(line, code = 0) {
  console.log(line);
  process.exit(code);
}

function readEnvFile(file) {
  const out = {};
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    out[key] = value;
  }
  return out;
}

/** The newest build-tools apksigner in the Android SDK, or null. */
function findApksigner() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) return null;
  const dir = join(sdk, 'build-tools');
  if (!existsSync(dir)) return null;
  const versions = readdirSync(dir)
    .filter((v) => existsSync(join(dir, v, 'apksigner')))
    .sort((a, b) => compareVersions(b, a));
  return versions.length ? join(dir, versions[0], 'apksigner') : null;
}

/** The SHA-256 of every certificate the APK is signed with (lowercase hex). */
function signerDigests(apk) {
  const apksigner = findApksigner();
  if (!apksigner) throw new Error('apksigner not found (set ANDROID_HOME), so the signing key cannot be checked');
  const out = execFileSync(apksigner, ['verify', '--print-certs', apk], { encoding: 'utf8' });
  return [...out.matchAll(/certificate SHA-256 digest:\s*([0-9a-f]{64})/gi)].map((m) => m[1].toLowerCase());
}

/** "0.10.1" is newer than "0.9.9". */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

if (!apkFile || !/^\d+(\.\d+){0,3}$/.test(version ?? '')) done('PUBLISH_FAILED usage: publish-apk.mjs <apk file> <version>', 1);
if (!existsSync(apkFile)) done(`PUBLISH_FAILED no APK at ${apkFile}`, 1);

const envFile = resolve(process.cwd(), '.env.release.local');
if (!existsSync(envFile)) done('PUBLISH_SKIPPED (no .env.release.local, see docs/release-signing.md)');
const env = readEnvFile(envFile);
const url = (env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '';
if (!/^https:\/\/[^\s/]+$/.test(url) || !key) done('PUBLISH_SKIPPED (.env.release.local needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');

// Only an APK signed with Tekmadev's release key, and nothing else, is ever offered to phones.
let digests;
try {
  digests = signerDigests(apkFile);
} catch (err) {
  done(`PUBLISH_FAILED ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`, 1);
}
if (digests.length !== 1 || digests[0] !== RELEASE_CERT_SHA256) {
  done('PUBLISH_FAILED this APK is not signed with the Tekmadev release key (restore credentials/, see docs/release-signing.md); phones would refuse it', 1);
}

const size = statSync(apkFile).size;
if (size > MAX_BYTES) {
  done(`PUBLISH_FAILED the APK is ${(size / 1048576).toFixed(1)} MB and storage takes at most 50 MB`, 1);
}

// New secret keys (sb_secret_...) go in apikey only; the older service_role JWT also goes in Authorization.
const auth = key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

async function call(path, init) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.message || body.error || body.msg || '';
    } catch {
      // No JSON body.
    }
    throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} answered ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res;
}

try {
  // 1. What the server offers now: never go back to an older version.
  const read = await call(`/rest/v1/site_settings?key=eq.mobile_app&select=value`, { method: 'GET' });
  const rows = await read.json();
  const current = rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {};
  if (current.latestVersion && compareVersions(current.latestVersion, version) > 0) {
    done(`PUBLISH_FAILED the server already offers ${current.latestVersion}, newer than ${version}; nothing was changed`, 1);
  }

  // 2. The file, before the version, so the settings never point at an APK that is not there yet.
  await call(`/storage/v1/object/${BUCKET}/${OBJECT_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/vnd.android.package-archive', 'x-upsert': 'true', 'cache-control': 'no-cache' },
    body: readFileSync(apkFile),
  });

  // 3. The version, merged into what the row already holds (minVersion and features stay).
  const value = { ...current, latestVersion: version, apkPath: OBJECT_PATH };
  const json = { 'content-type': 'application/json', prefer: 'return=minimal' };
  if (rows.length > 0) {
    await call(`/rest/v1/site_settings?key=eq.mobile_app`, { method: 'PATCH', headers: json, body: JSON.stringify({ value }) });
  } else {
    await call(`/rest/v1/site_settings`, { method: 'POST', headers: json, body: JSON.stringify({ key: 'mobile_app', value }) });
  }
  done(`APK_PUBLISHED ${version} (${(size / 1048576).toFixed(1)} MB). Phones see "Update available" within a minute.`);
} catch (err) {
  done(`PUBLISH_FAILED ${err instanceof Error ? err.message : String(err)}`, 1);
}
