#!/usr/bin/env node
/**
 * Builds the data behind More > Open-source licenses (the stores expect the app
 * to credit the open-source code it ships). Run it by hand after installing or
 * upgrading packages, and after a release build so the native versions are fresh:
 *
 *   node scripts/gen-licenses.mjs
 *
 * What it reads:
 * - package-lock.json: every package that is not dev-only (`dev: true` is left
 *   out). Platform-only binaries (lock entries with `os` or `cpu`, such as the
 *   lightningcss or Sentry CLI builds for one OS) are build tools that never ship
 *   in the app, and skipping them keeps the output the same on every machine.
 * - node_modules/<name>/package.json for the version and `license`, and the
 *   package's LICENSE, LICENCE, UNLICENSE, COPYING and NOTICE files.
 * - The fonts (Geist and Geist Mono, SIL Open Font License 1.1).
 * - Native libraries that ship inside the Android and iOS builds but are not npm
 *   packages (NATIVE below). Each one is listed only when the build confirms it:
 *   the resolved Gradle dependencies of the last Android build
 *   (android/app/build/outputs/sdk-dependencies/<variant>/sdkDependencies.txt),
 *   ios/Podfile.lock, the Swift packages an Expo module bundles in its prebuilt
 *   iOS framework (spm.config.json), or what react-native itself compiles in.
 *
 * License texts are stored once and packages point to them. Leading copyright
 * lines move into the package's own `notice`, so the hundreds of MIT files that
 * differ only by their copyright line share one text.
 *
 * Writes src/modules/appSettings/licenses/licenses.json (committed).
 */
import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = 'src/modules/appSettings/licenses/licenses.json';

const LICENSE_FILE = /^(un)?(licen[cs]e|copying|notice)([.\-_].*)?$/i;
/** A leading line that is a title or a copyright statement, not license terms. */
const HEADER_LINE =
  /^(#+\s*)?(\(?(the\s+)?[\w.\- ]{0,30}licen[cs]e[\w.\-, ()]{0,30}\)?:?|copyright\b.*|\(c\)\s.*|©.*|all rights reserved\.?|-+)$/i;
const COPYRIGHT_LINE = /copyright|\(c\)|©|rights reserved/i;
// Built from char codes so this file never holds the characters themselves.
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const EM_DASH = new RegExp(String.fromCharCode(0x2014), 'g');
const EN_DASH = new RegExp(String.fromCharCode(0x2013), 'g');

const warnings = [];
const warn = (message) => warnings.push(message);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const exists = (path) => existsSync(join(ROOT, path));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

/**
 * Line endings, trailing spaces and runs of blank lines, made consistent. Long
 * and medium dashes become ASCII hyphens: the app shows neither (house rule), and
 * the change is typographic only.
 */
function normalize(text) {
  return text
    .replace(BOM, '')
    .replace(EM_DASH, '--')
    .replace(EN_DASH, '-')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splits leading title and copyright paragraphs off a license file: copyright lines become the notice. */
function splitNotice(text) {
  const paragraphs = text.split('\n\n');
  const notice = [];
  let start = 0;
  for (; start < paragraphs.length - 1; start++) {
    const lines = paragraphs[start].split('\n').map((line) => line.trim());
    if (!lines.every((line) => HEADER_LINE.test(line))) break;
    for (const line of lines) if (COPYRIGHT_LINE.test(line)) notice.push(line);
  }
  return { notice, body: paragraphs.slice(start).join('\n\n') };
}

// Every text is stored once; equal texts (ignoring how lines are wrapped) share an index.
const texts = [];
const textIndex = new Map();
function addText(text) {
  const key = text.replace(/\s+/g, ' ').trim();
  let index = textIndex.get(key);
  if (index === undefined) {
    index = texts.length;
    texts.push(text);
    textIndex.set(key, index);
  }
  return index;
}

/** The SPDX id or expression a package.json declares. */
function licenseOf(pkg, lockEntry) {
  const raw = pkg.license ?? pkg.licenses ?? lockEntry.license;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.type === 'string') return raw.type;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((entry) => (typeof entry === 'string' ? entry : entry?.type)).filter(Boolean).join(' OR ');
  }
  return 'UNKNOWN';
}

/** The standard text for the first id in an expression we have one for ("(MIT OR Apache-2.0)" gives MIT). */
function standardText(expression) {
  for (const id of expression.replace(/[()]/g, ' ').split(/\s+(?:OR|AND|WITH)\s+|\s+/i)) {
    if (STANDARD[id]) return { id, text: STANDARD[id] };
  }
  return null;
}

/** LICENSE first, NOTICE last, the rest by name. */
function fileRank(name) {
  if (/^notice/i.test(name)) return 2;
  if (/^(un)?licen[cs]e$|^(un)?licen[cs]e\.(md|txt)$/i.test(name)) return 0;
  return 1;
}

function licenseFiles(dir) {
  return readdirSync(dir)
    .filter((name) => LICENSE_FILE.test(name) && statSync(join(dir, name)).isFile())
    .sort((a, b) => fileRank(a) - fileRank(b) || a.localeCompare(b));
}

function npmPackages() {
  const lock = readJson(join(ROOT, 'package-lock.json'));
  const seen = new Set();
  const out = [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path || entry.dev || entry.link || entry.os || entry.cpu) continue;
    const dir = join(ROOT, path);
    const manifest = join(dir, 'package.json');
    if (!existsSync(manifest)) {
      if (!entry.optional) warn(`Not installed: ${path} (run npm install, then this script again)`);
      continue;
    }
    const pkg = readJson(manifest);
    const name = pkg.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const version = pkg.version ?? entry.version ?? '';
    const id = `${name}@${version}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const license = licenseOf(pkg, entry);
    const notice = [];
    const ids = [];
    for (const file of licenseFiles(dir)) {
      const text = normalize(readFileSync(join(dir, file), 'utf8'));
      if (!text) continue;
      const split = splitNotice(text);
      notice.push(...split.notice);
      ids.push(addText(split.body));
    }
    if (!ids.length) {
      const standard = standardText(license);
      notice.push(`No license file in this package. Its package.json says ${license}.`);
      if (standard) ids.push(addText(standard.text));
      else warn(`No license text for ${id} (${license})`);
    }
    if (license === 'UNKNOWN') warn(`No license declared by ${id}`);
    out.push(entry_({ name, version, license, kind: 'npm', notice, texts: ids }));
  }
  return out;
}

/** One output row, with empty fields left out so the file stays small. */
function entry_({ name, version, license, kind, by, platforms, notice, texts: ids }) {
  const row = { name };
  if (version) row.version = version;
  row.license = license;
  row.kind = kind;
  if (by) row.by = by;
  if (platforms?.length) row.platforms = platforms;
  const lines = [...new Set(notice ?? [])];
  if (lines.length) row.notice = lines.join('\n');
  row.texts = [...new Set(ids)];
  return row;
}

// ---------------------------------------------------------------------------
// Fonts

function fonts() {
  const out = [];
  for (const [name, pkg] of [
    ['Geist', '@expo-google-fonts/geist'],
    ['Geist Mono', '@expo-google-fonts/geist-mono'],
  ]) {
    const dir = `node_modules/${pkg}`;
    let notice = ['Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git)'];
    let body = OFL_1_1;
    if (exists(`${dir}/LICENSE_FONT`)) {
      const split = splitNotice(normalize(read(`${dir}/LICENSE_FONT`)));
      if (split.notice.length) notice = split.notice;
      body = split.body;
    } else {
      warn(`${pkg}/LICENSE_FONT not found: using the standard OFL 1.1 text`);
    }
    const version = exists(`${dir}/metadata.json`) ? readJson(join(ROOT, dir, 'metadata.json')).version : undefined;
    out.push(entry_({ name, version, license: 'OFL-1.1', kind: 'font', by: 'Vercel', notice, texts: [addText(body)] }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Native libraries

const META = 'Copyright (c) Meta Platforms, Inc. and affiliates.';
const AOSP = 'Copyright (C) The Android Open Source Project';

/**
 * Native libraries inside the builds that are not npm packages. `from` lists the
 * evidence: a Gradle coordinate the Android build resolved (`maven`), a pod in
 * ios/Podfile.lock (`pod`), a Swift package bundled in an Expo module's prebuilt
 * iOS framework (`spm`: [npm package, product]), a library react-native compiles
 * into both apps (`rn`: key in react-native/gradle/libs.versions.toml), or an npm
 * package that carries the native binaries (`npm`). `version: false` hides the
 * version when the evidence is a wrapper with its own numbering.
 *
 * Not listed: Google Play services and the Play Install Referrer library (not
 * open source), and small jars whose license could not be confirmed offline
 * (device-year-class, pika-api, jsr305, checker-compat-qual,
 * animal-sniffer-annotations). Add them here once checked.
 */
const NATIVE = [
  // Bundled by React Native on both platforms.
  { name: 'Hermes', by: 'Meta', license: 'MIT', notice: META, text: 'MIT', from: [{ maven: 'com.facebook.hermes:hermes-android' }, { pod: 'hermes-engine' }] },
  { name: 'Folly', by: 'Meta', license: 'Apache-2.0', notice: META, text: 'Apache-2.0', from: [{ rn: 'folly' }] },
  { name: 'glog', by: 'Google', license: 'BSD-3-Clause', notice: 'Copyright (c) 2008, Google Inc. All rights reserved.', text: 'BSD-3-Clause', from: [{ rn: 'glog' }] },
  { name: 'double-conversion', by: 'Google', license: 'BSD-3-Clause', notice: 'Copyright 2006-2011, the V8 project authors. All rights reserved.', text: 'BSD-3-Clause', from: [{ rn: 'doubleconversion' }] },
  { name: '{fmt}', license: 'MIT', notice: 'Copyright (c) 2012 - present, Victor Zverovich and {fmt} contributors', text: 'MIT', from: [{ rn: 'fmt' }] },
  { name: 'fast_float', license: 'Apache-2.0 OR BSL-1.0 OR MIT', notice: 'Copyright (c) 2021 The fast_float authors. Used under the MIT License.', text: 'MIT', from: [{ rn: 'fastFloat' }] },
  { name: 'Boost C++ Libraries', license: 'BSL-1.0', text: 'BSL-1.0', from: [{ rn: 'boost' }] },
  { name: 'fbjni', by: 'Meta', license: 'Apache-2.0', notice: META, text: 'Apache-2.0', from: [{ maven: 'com.facebook.fbjni:fbjni' }] },
  { name: 'SoLoader', by: 'Meta', license: 'Apache-2.0', notice: META, text: 'Apache-2.0', from: [{ maven: 'com.facebook.soloader:soloader' }] },
  { name: 'Fresco', by: 'Meta', license: 'MIT', notice: META, text: 'MIT', from: [{ maven: 'com.facebook.fresco:fresco' }] },
  { name: 'Infer annotations', by: 'Meta', license: 'MIT', notice: META, text: 'MIT', from: [{ maven: 'com.facebook.infer.annotation:infer-annotation' }] },
  { name: 'Bolts', by: 'Meta', license: 'BSD-3-Clause', notice: 'Copyright (c) 2013-present, Facebook, Inc. All rights reserved.', text: 'BSD-3-Clause', from: [{ maven: 'com.parse.bolts:bolts-tasks' }] },

  // Graphics and images.
  { name: 'Skia', by: 'Google', license: 'BSD-3-Clause', notice: 'Copyright (c) 2011 Google Inc. All rights reserved.', text: 'BSD-3-Clause', from: [{ npm: 'react-native-skia-android', field: 'skia.version', platform: 'android' }, { npm: 'react-native-skia-apple-ios', field: 'skia.version', platform: 'ios' }] },
  { name: 'libwebp', by: 'Google', license: 'BSD-3-Clause', notice: 'Copyright (c) 2010, Google Inc. All rights reserved.', text: 'BSD-3-Clause', version: false, from: [{ maven: 'com.facebook.fresco:webpsupport' }, { spm: ['expo-image', 'SDWebImageWebPCoder'] }, { pod: 'libwebp' }] },
  { name: 'libavif', by: 'Alliance for Open Media', license: 'BSD-2-Clause', notice: 'Copyright 2019 Joe Drago. All rights reserved.', text: 'BSD-2-Clause', from: [{ maven: 'org.aomedia.avif.android:avif' }, { spm: ['expo-image', 'libavif'] }, { pod: 'libavif' }] },
  {
    name: 'Glide',
    by: 'Google',
    license: 'BSD-2-Clause AND MIT AND Apache-2.0',
    notice: [
      'Copyright 2014 Google, Inc. All rights reserved.',
      'GIF decoder: Copyright (c) 2013 Xcellent Creations, Inc. (MIT)',
      'Disk LRU cache: Copyright (C) 2011 The Android Open Source Project (Apache-2.0)',
    ],
    text: ['BSD-2-Clause', 'MIT', 'Apache-2.0'],
    from: [{ maven: 'com.github.bumptech.glide:glide' }],
  },
  { name: 'Glide Transformations', by: 'Wasabeef', license: 'Apache-2.0', notice: 'Copyright (C) 2020 Wasabeef', text: 'Apache-2.0', from: [{ maven: 'jp.wasabeef:glide-transformations' }] },
  { name: 'APNG4Android', license: 'Apache-2.0', notice: 'Copyright (c) Zhou Pengfei and the APNG4Android contributors', text: 'Apache-2.0', from: [{ maven: 'com.github.penfeizhou.android.animation:glide-plugin' }] },
  { name: 'AndroidSVG', license: 'Apache-2.0', notice: 'Copyright 2013 Paul LeBeau, Cave Rock Software Ltd.', text: 'Apache-2.0', from: [{ maven: 'com.caverock:androidsvg-aar' }] },
  { name: 'BlurView', license: 'Apache-2.0', notice: 'Copyright 2016 Dmitry Saviuk', text: 'Apache-2.0', from: [{ maven: 'com.github.Dimezis:BlurView' }] },
  { name: 'Android Image Cropper', license: 'Apache-2.0', notice: 'Copyright (c) the Android Image Cropper authors', text: 'Apache-2.0', from: [{ maven: 'com.vanniktech:android-image-cropper' }] },
  { name: 'SDWebImage', license: 'MIT', notice: 'Copyright (c) 2009-2020 Olivier Poitrey rs@dailymotion.com', text: 'MIT', from: [{ spm: ['expo-image', 'SDWebImage'] }, { pod: 'SDWebImage' }] },
  { name: 'SDWebImageAVIFCoder', license: 'MIT', notice: 'Copyright (c) the SDWebImage contributors', text: 'MIT', from: [{ spm: ['expo-image', 'SDWebImageAVIFCoder'] }, { pod: 'SDWebImageAVIFCoder' }] },
  { name: 'SDWebImageSVGCoder', license: 'MIT', notice: 'Copyright (c) the SDWebImage contributors', text: 'MIT', from: [{ spm: ['expo-image', 'SDWebImageSVGCoder'] }, { pod: 'SDWebImageSVGCoder' }] },
  { name: 'SDWebImageWebPCoder', license: 'MIT', notice: 'Copyright (c) the SDWebImage contributors', text: 'MIT', from: [{ spm: ['expo-image', 'SDWebImageWebPCoder'] }, { pod: 'SDWebImageWebPCoder' }] },

  // Storage, networking, compression.
  { name: 'MMKV', by: 'Tencent', license: 'BSD-3-Clause', notice: 'Copyright (C) 2018 THL A29 Limited, a Tencent company. All rights reserved.', text: 'BSD-3-Clause', from: [{ maven: 'io.github.zhongwuzw:mmkv' }, { pod: 'MMKVCore' }] },
  { name: 'OkHttp', by: 'Square', license: 'Apache-2.0', notice: 'Copyright 2019 Square, Inc.', text: 'Apache-2.0', from: [{ maven: 'com.squareup.okhttp3:okhttp' }] },
  { name: 'Okio', by: 'Square', license: 'Apache-2.0', notice: 'Copyright 2013 Square, Inc.', text: 'Apache-2.0', from: [{ maven: 'com.squareup.okio:okio' }] },
  { name: 'zstd-kmp', by: 'Square', license: 'Apache-2.0', notice: 'Copyright (c) Square, Inc.', text: 'Apache-2.0', from: [{ maven: 'com.squareup.zstd:zstd-kmp' }] },
  { name: 'Zstandard', by: 'Meta', license: 'BSD-3-Clause', notice: 'Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved. Used under the BSD license.', text: 'BSD-3-Clause', version: false, from: [{ maven: 'com.squareup.zstd:zstd-kmp' }] },
  { name: 'Brotli', by: 'Google', license: 'MIT', notice: 'Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.', text: 'MIT', from: [{ maven: 'org.brotli:dec' }] },
  { name: 'Apache Commons Codec', license: 'Apache-2.0', notice: 'Copyright The Apache Software Foundation. This product includes software developed at The Apache Software Foundation (https://www.apache.org/).', text: 'Apache-2.0', from: [{ maven: 'commons-codec:commons-codec' }] },
  { name: 'Apache Commons IO', license: 'Apache-2.0', notice: 'Copyright The Apache Software Foundation. This product includes software developed at The Apache Software Foundation (https://www.apache.org/).', text: 'Apache-2.0', from: [{ maven: 'commons-io:commons-io' }] },

  // Google and JetBrains libraries for Android.
  { name: 'AndroidX (Jetpack) libraries', by: 'Google', license: 'Apache-2.0', notice: AOSP, text: 'Apache-2.0', version: false, from: [{ maven: 'androidx.core:core' }] },
  { name: 'Material Components for Android', by: 'Google', license: 'Apache-2.0', notice: AOSP, text: 'Apache-2.0', from: [{ maven: 'com.google.android.material:material' }] },
  { name: 'Firebase Cloud Messaging', by: 'Google', license: 'Apache-2.0', notice: 'Copyright Google LLC. Includes the Firebase common, installations and data transport libraries.', text: 'Apache-2.0', from: [{ maven: 'com.google.firebase:firebase-messaging' }] },
  { name: 'Guava', by: 'Google', license: 'Apache-2.0', notice: 'Copyright (C) The Guava Authors', text: 'Apache-2.0', from: [{ maven: 'com.google.guava:guava' }] },
  { name: 'Protocol Buffers (Java Lite)', by: 'Google', license: 'BSD-3-Clause', notice: 'Copyright 2008 Google Inc. All rights reserved.', text: 'BSD-3-Clause', from: [{ maven: 'com.google.protobuf:protobuf-javalite' }] },
  { name: 'Gson', by: 'Google', license: 'Apache-2.0', notice: 'Copyright 2008 Google Inc.', text: 'Apache-2.0', from: [{ maven: 'com.google.code.gson:gson' }] },
  { name: 'Error Prone annotations', by: 'Google', license: 'Apache-2.0', notice: 'Copyright The Error Prone Authors', text: 'Apache-2.0', from: [{ maven: 'com.google.errorprone:error_prone_annotations' }] },
  { name: 'J2ObjC annotations', by: 'Google', license: 'Apache-2.0', notice: 'Copyright Google Inc.', text: 'Apache-2.0', from: [{ maven: 'com.google.j2objc:j2objc-annotations' }] },
  { name: 'JSpecify', license: 'Apache-2.0', notice: 'Copyright The JSpecify Authors', text: 'Apache-2.0', from: [{ maven: 'org.jspecify:jspecify' }] },
  { name: 'javax.inject', license: 'Apache-2.0', notice: 'Copyright (C) 2009 The JSR-330 Expert Group', text: 'Apache-2.0', from: [{ maven: 'javax.inject:javax.inject' }] },
  { name: 'Kotlin standard library', by: 'JetBrains', license: 'Apache-2.0', notice: 'Copyright JetBrains s.r.o. and Kotlin Programming Language contributors.', text: 'Apache-2.0', from: [{ maven: 'org.jetbrains.kotlin:kotlin-stdlib' }] },
  { name: 'kotlinx.coroutines', by: 'JetBrains', license: 'Apache-2.0', notice: 'Copyright JetBrains s.r.o. and contributors.', text: 'Apache-2.0', from: [{ maven: 'org.jetbrains.kotlinx:kotlinx-coroutines-core' }] },
  { name: 'kotlinx.serialization', by: 'JetBrains', license: 'Apache-2.0', notice: 'Copyright JetBrains s.r.o. and contributors.', text: 'Apache-2.0', from: [{ maven: 'org.jetbrains.kotlinx:kotlinx-serialization-core' }] },
  { name: 'JetBrains Java annotations', by: 'JetBrains', license: 'Apache-2.0', notice: 'Copyright JetBrains s.r.o.', text: 'Apache-2.0', from: [{ maven: 'org.jetbrains:annotations' }] },
  { name: 'ShortcutBadger', license: 'Apache-2.0', notice: 'Copyright 2014 Leo Lin', text: 'Apache-2.0', from: [{ maven: 'me.leolin:ShortcutBadger' }] },

  // Crash reporting (listed once a build includes it).
  { name: 'Sentry SDK for Android', by: 'Sentry', license: 'MIT', notice: 'Copyright (c) 2019 Sentry', text: 'MIT', from: [{ maven: 'io.sentry:sentry-android-core' }] },
  { name: 'Sentry Native SDK', by: 'Sentry', license: 'MIT', notice: 'Copyright (c) 2019 Sentry (https://sentry.io) and individual contributors.', text: 'MIT', from: [{ maven: 'io.sentry:sentry-native-ndk' }] },
  { name: 'Sentry SDK for Cocoa', by: 'Sentry', license: 'MIT', notice: 'Copyright (c) 2015 Sentry', text: 'MIT', from: [{ pod: 'Sentry' }] },
];

/** Resolved Gradle dependencies of the last Android build ("group:artifact" to version). */
function gradleDependencies() {
  for (const variant of ['release', 'debug']) {
    const file = `android/app/build/outputs/sdk-dependencies/${variant}/sdkDependencies.txt`;
    if (!exists(file)) continue;
    const map = new Map();
    for (const m of read(file).matchAll(/groupId: "([^"]+)"\s+artifactId: "([^"]+)"\s+version: "([^"]+)"/g)) {
      map.set(`${m[1]}:${m[2]}`, m[3]);
    }
    return map;
  }
  warn('No Android build found (android/app/build/outputs/sdk-dependencies): Android libraries are listed unverified, without versions. Build a release APK, then run this again.');
  return null;
}

/** Pods in ios/Podfile.lock (name to version). */
function pods() {
  if (!exists('ios/Podfile.lock')) {
    warn('No ios/Podfile.lock: iOS libraries are listed unverified. Run pod install, then this again.');
    return null;
  }
  const map = new Map();
  const section = read('ios/Podfile.lock').split(/\n(?=\S)/).find((block) => block.startsWith('PODS:')) ?? '';
  for (const m of section.matchAll(/^ {2}- "?([^\s/(]+)(?:\/\S+)? \(([^)]+)\)/gm)) {
    if (!map.has(m[1])) map.set(m[1], m[2]);
  }
  return map;
}

/** The versions react-native builds its bundled C++ libraries at. */
function reactNativeVersions() {
  const file = 'node_modules/react-native/gradle/libs.versions.toml';
  if (!exists(file)) return null;
  const map = new Map();
  const section = read(file).split(/^\[/m).find((block) => block.startsWith('versions]')) ?? '';
  for (const m of section.matchAll(/^(\w+)\s*=\s*"([^"]+)"/gm)) map.set(m[1], m[2]);
  return map;
}

/** Swift packages an Expo module bundles into its prebuilt iOS framework, when the iOS app uses that module. */
function spmVersion(pkg, product, podMap) {
  const file = `node_modules/${pkg}/spm.config.json`;
  if (!exists(file) || !podMap) return { ok: podMap ? false : null };
  for (const p of readJson(join(ROOT, file)).products ?? []) {
    if (!podMap.has(p.podName)) continue;
    const dep = (p.spmPackages ?? []).find((d) => d.productName === product);
    if (dep) return { ok: true, version: dep.version?.exact ?? dep.version?.from };
  }
  return { ok: false };
}

function field(obj, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), obj);
}

function nativeLibraries() {
  const gradle = gradleDependencies();
  const podMap = pods();
  const rn = reactNativeVersions();
  const out = [];
  const skipped = [];

  for (const lib of NATIVE) {
    const found = []; // { platform, version }
    let unknown = false;
    for (const ev of lib.from) {
      if (ev.maven) {
        if (!gradle) unknown = true;
        else if (gradle.has(ev.maven)) found.push({ platform: 'android', version: gradle.get(ev.maven) });
      } else if (ev.pod) {
        if (!podMap) unknown = true;
        else if (podMap.has(ev.pod)) found.push({ platform: 'ios', version: podMap.get(ev.pod) });
      } else if (ev.spm) {
        const result = spmVersion(ev.spm[0], ev.spm[1], podMap);
        if (result.ok === null) unknown = true;
        else if (result.ok) found.push({ platform: 'ios', version: result.version });
      } else if (ev.rn) {
        if (rn?.has(ev.rn)) {
          // Boost writes 1_83_0.
          const version = rn.get(ev.rn).replace(/_/g, '.');
          found.push({ platform: 'android', version }, { platform: 'ios', version });
        }
      } else if (ev.npm) {
        const manifest = `node_modules/${ev.npm}/package.json`;
        if (exists(manifest)) {
          const pkg = readJson(join(ROOT, manifest));
          found.push({ platform: ev.platform, version: String(field(pkg, ev.field ?? 'version') ?? '') });
        }
      }
    }

    if (!found.length && !unknown) {
      skipped.push(lib.name);
      continue;
    }
    if (!found.length) warn(`Unverified (no build files to check): ${lib.name}`);

    // One platform once, the first version found for it.
    const byPlatform = new Map();
    // JitPack tags read "version-3.1.0".
    for (const f of found) if (!byPlatform.has(f.platform)) byPlatform.set(f.platform, f.version?.replace(/^version-/, ''));
    const platforms = ['android', 'ios'].filter((p) => byPlatform.has(p));
    const versions = [...new Set([...byPlatform.values()].filter(Boolean))];
    let version;
    if (lib.version !== false && versions.length === 1) version = versions[0];
    else if (lib.version !== false && versions.length > 1) {
      version = platforms.map((p) => `${p === 'ios' ? 'iOS' : 'Android'} ${byPlatform.get(p)}`).join(', ');
    }

    const textIds = (Array.isArray(lib.text) ? lib.text : [lib.text]).map((id) => {
      if (!STANDARD[id]) throw new Error(`No standard text for ${id} (${lib.name})`);
      return addText(STANDARD[id]);
    });
    out.push(
      entry_({
        name: lib.name,
        version,
        license: lib.license,
        kind: 'native',
        by: lib.by,
        platforms,
        notice: lib.notice ? [lib.notice].flat() : [],
        texts: textIds,
      }),
    );
  }
  if (skipped.length) console.log(`Native libraries not in this build: ${skipped.join(', ')}`);
  return out;
}

// ---------------------------------------------------------------------------

const KIND_ORDER = { font: 0, native: 1, npm: 2 };
const sortName = (name) => name.replace(/^[^a-z0-9]+/i, '').toLowerCase();

function main() {
  const rows = [...fonts(), ...nativeLibraries(), ...npmPackages()];
  rows.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      sortName(a.name).localeCompare(sortName(b.name), 'en') ||
      (a.version ?? '').localeCompare(b.version ?? '', 'en', { numeric: true }),
  );

  // Texts in first-use order, so a re-run with the same inputs writes the same file.
  const order = new Map();
  for (const row of rows) for (const id of row.texts) if (!order.has(id)) order.set(id, order.size);
  for (const row of rows) row.texts = row.texts.map((id) => order.get(id));
  const orderedTexts = [...order.keys()].map((id) => texts[id]);

  const counts = { fonts: 0, native: 0, npm: 0 };
  for (const row of rows) counts[row.kind === 'font' ? 'fonts' : row.kind] += 1;

  // One package per line keeps diffs readable.
  const json = [
    '{',
    `  "note": ${JSON.stringify('Generated by scripts/gen-licenses.mjs. Do not edit by hand: run node scripts/gen-licenses.mjs.')},`,
    `  "counts": ${JSON.stringify(counts)},`,
    '  "packages": [',
    rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n'),
    '  ],',
    '  "texts": [',
    orderedTexts.map((text) => `    ${JSON.stringify(text)}`).join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
  writeFileSync(join(ROOT, OUT), json);

  for (const message of warnings) console.warn(`warning: ${message}`);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
  console.log(
    `${OUT}: ${rows.length} entries (${counts.npm} npm packages, ${counts.native} native libraries, ${counts.fonts} fonts), ` +
      `${orderedTexts.length} license texts, ${kb} KB`,
  );
}

// ---------------------------------------------------------------------------
// Standard license texts, for the native libraries and for packages that ship
// without a license file. Copyright lines live in each entry's notice.

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const ISC = `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

const BSD_CLAUSES = `Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.`;

const BSD_DISCLAIMER = `THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

const BSD_2_CLAUSE = `${BSD_CLAUSES}

${BSD_DISCLAIMER}`;

const BSD_3_CLAUSE = `${BSD_CLAUSES}

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

${BSD_DISCLAIMER}`;

const BSL_1_0 = `Boost Software License - Version 1.0 - August 17th, 2003

Permission is hereby granted, free of charge, to any person or organization
obtaining a copy of the software and accompanying documentation covered by
this license (the "Software") to use, reproduce, display, distribute,
execute, and transmit the Software, and to prepare derivative works of the
Software, and to permit third-parties to whom the Software is furnished to
do so, all subject to the following:

The copyright notices in the Software and this entire statement, including
the above license grant, this restriction and the following disclaimer,
must be included in all copies of the Software, in whole or in part, and
all derivative works of the Software, unless such copies or derivative
works are solely in the form of machine-executable object code generated by
a source language processor.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT
SHALL THE COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE
FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.`;

const APACHE_2_0 = `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.`;

const OFL_1_1 = `-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.`;

const STANDARD = {
  MIT,
  ISC,
  'BSD-2-Clause': BSD_2_CLAUSE,
  'BSD-3-Clause': BSD_3_CLAUSE,
  'BSL-1.0': BSL_1_0,
  'Apache-2.0': APACHE_2_0,
  'OFL-1.1': OFL_1_1,
};

main();
