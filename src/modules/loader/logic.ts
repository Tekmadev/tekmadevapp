import type { LoaderSettings } from '@/api/schemas/settings';
import { formatDurationMs, formatPercent } from '@/lib/format';
import { LOADER_DEFAULTS, LOADER_KEYS, LOADER_RANGES } from '@/loader/settings';

/**
 * The Loader screen's pure parts (brief 8.14 and section 5): the six sliders,
 * their live values ("1.60s", "72%"), and draft comparison.
 */

export const SAVED_TOAST = 'Saved. Every page on the site now uses these settings.';
export const RESET_TOAST = 'Back to the original settings, live on every page.';
export const RESET_MESSAGE = 'Put the loader back to the original settings on every page?';
export const UNSAVED_NOTE = 'Not saved yet. The site still uses the saved settings.';

/** Milliseconds as seconds with two decimals: 1600 is "1.60s". */
export function formatSeconds(ms: number): string {
  return formatDurationMs(ms);
}

/** A ratio as a whole percent: 0.72 is "72%". */
export function formatRatio(ratio: number): string {
  return formatPercent(ratio);
}

export type LoaderField = {
  key: keyof LoaderSettings;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
};

const field = (key: keyof LoaderSettings, label: string, help: string, step: number, format: (v: number) => string): LoaderField => ({
  key,
  label,
  help,
  min: LOADER_RANGES[key][0],
  max: LOADER_RANGES[key][1],
  step,
  format,
});

/** The six sliders in the section 5 order, grouped the way the screen shows them. */
export const SPEED_FIELDS: readonly LoaderField[] = [
  field('beatMs', 'Page loader beat', 'One beat of the full-screen loader.', 50, formatSeconds),
  field('buttonBeatMs', 'Button beat', 'One beat inside buttons.', 50, formatSeconds),
];

export const PULL_FIELDS: readonly LoaderField[] = [
  field('innerPull', 'Inner pull', 'How small the inner hooks get at the peak. Lower pulls harder.', 0.01, formatRatio),
  field('outerPull', 'Outer pull', 'How small the outer arcs get at the peak.', 0.01, formatRatio),
  field('innerFade', 'Inner fade', 'How visible the inner hooks stay at the peak. Lower fades more.', 0.01, formatRatio),
];

export const DELAY_FIELD: LoaderField = field(
  'showAfterMs',
  'Appear delay',
  'A full-screen loader stays invisible this long, then fades in, so fast loads never flash it.',
  50,
  formatSeconds,
);

export const LOADER_FIELDS: readonly LoaderField[] = [...SPEED_FIELDS, ...PULL_FIELDS, DELAY_FIELD];

/** Same six values (compared at the server's precision: whole ms, two decimals for ratios). */
export function sameSettings(a: LoaderSettings, b: LoaderSettings): boolean {
  return LOADER_KEYS.every((key) => Math.round(a[key] * 100) === Math.round(b[key] * 100));
}

/** True when the values are the brief's original settings. */
export function isOriginal(settings: LoaderSettings): boolean {
  return sameSettings(settings, LOADER_DEFAULTS);
}

/** A copy with one value changed. */
export function withValue(settings: LoaderSettings, key: keyof LoaderSettings, value: number): LoaderSettings {
  return { ...settings, [key]: value };
}

/** "Hidden for 0.30s, then fades in." The demo's caption; a zero delay shows at once. */
export function delayCaption(showAfterMs: number): string {
  if (showAfterMs <= 0) return 'No delay: it shows at once, then fades in.';
  return `Hidden for ${formatSeconds(showAfterMs)}, then fades in.`;
}
