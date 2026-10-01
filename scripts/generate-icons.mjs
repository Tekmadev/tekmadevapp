#!/usr/bin/env node
// Renders every launcher, splash and notification image from the logo paths in
// src/loader/logoPaths.ts, so the artwork has a single source of truth.
// Run: node scripts/generate-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'src/loader/logoPaths.ts'), 'utf8');
const paths = [...source.matchAll(/d: '(M[^']+)'/g)].map((m) => m[1]);
if (paths.length !== 4) throw new Error(`Expected 4 logo paths, found ${paths.length}`);

const GOLD_LIGHT = '#a17a4f';
const GOLD_DARK = '#c89c65';
const BG_DARK = '#0e0d0b';

/**
 * @param {object} o
 * @param {number} o.size output size in px
 * @param {number} o.markScale fraction of the canvas the 2400 unit viewBox occupies
 * @param {string} o.fill logo colour
 * @param {string | null} o.background canvas colour or null for transparent
 */
function svg({ size, markScale, fill, background }) {
  const box = size * markScale;
  const offset = (size - box) / 2;
  const scale = box / 2400;
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '';
  const body = paths.map((d) => `<path d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<g fill="${fill}" transform="translate(${offset} ${offset}) scale(${scale}) translate(-300 -300)">${body}</g></svg>`;
}

function render(file, options) {
  const out = join(root, file);
  mkdirSync(dirname(out), { recursive: true });
  const png = new Resvg(svg(options), { fitTo: { mode: 'original' } }).render().asPng();
  writeFileSync(out, png);
  console.log(`wrote ${file}`);
}

// Legacy square icon (also used by Expo as the app icon).
render('assets/images/icon.png', { size: 1024, markScale: 0.62, fill: GOLD_DARK, background: BG_DARK });
// Adaptive icon: the mark stays inside the 66dp safe circle of the 108dp canvas.
render('assets/images/adaptive-foreground.png', { size: 1024, markScale: 0.58, fill: GOLD_DARK, background: null });
// Themed (monochrome) icon: Android only reads the alpha channel.
render('assets/images/adaptive-monochrome.png', { size: 1024, markScale: 0.58, fill: '#ffffff', background: null });
// Splash marks (the native Android 12+ splash draws them on the theme background).
render('assets/images/splash-light.png', { size: 1024, markScale: 0.9, fill: GOLD_LIGHT, background: null });
render('assets/images/splash-dark.png', { size: 1024, markScale: 0.9, fill: GOLD_DARK, background: null });
// Notification small icon: white silhouette on transparent.
render('assets/images/notification-icon.png', { size: 96, markScale: 0.95, fill: '#ffffff', background: null });
// Shortcut icons reuse the mark.
render('assets/images/logo-gold.png', { size: 512, markScale: 0.92, fill: GOLD_DARK, background: null });
// A plain SVG copy for docs and side-by-side checks against the website.
writeFileSync(
  join(root, 'assets/brand/logo.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="300 300 2400 2400" fill="currentColor">${paths
    .map((d) => `<path d="${d}"/>`)
    .join('')}</svg>\n`,
);
console.log('wrote assets/brand/logo.svg');

// Launcher shortcut icons (long-press the app icon): a Lucide glyph in gold, inside
// the adaptive safe zone, on the dark launcher background set in app.json.
const SHORTCUTS = {
  'shortcut-inbox': 'bell',
  'shortcut-client': 'building-2',
  'shortcut-post': 'file-text',
  'shortcut-analytics': 'chart-column',
};
for (const [file, icon] of Object.entries(SHORTCUTS)) {
  const raw = readFileSync(join(root, `node_modules/lucide-static/icons/${icon}.svg`), 'utf8');
  const inner = raw.slice(raw.indexOf('>', raw.indexOf('<svg')) + 1, raw.lastIndexOf('</svg>'));
  const size = 432;
  const glyph = size * 0.42;
  const offset = (size - glyph) / 2;
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g transform="translate(${offset} ${offset}) scale(${glyph / 24})" fill="none" stroke="${GOLD_DARK}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
  writeFileSync(join(root, `assets/images/${file}.png`), new Resvg(doc).render().asPng());
  console.log(`wrote assets/images/${file}.png`);
}
