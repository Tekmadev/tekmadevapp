/**
 * Number and text formatting for the UI (money lives in money.ts, dates in dates.ts).
 *
 * Hermes on Android only has Intl.NumberFormat and Intl.DateTimeFormat, so plurals,
 * compact numbers and percentages are small hand-written helpers. Compact and percent
 * output is built here rather than with NumberFormat options (`notation`, `style:
 * 'percent'`) so the text is the same on every Android version and in tests.
 */

const counts = new Map<number, Intl.NumberFormat>();

/** en-CA grouping with a fixed number of decimals, cached per precision. */
function grouped(fractionDigits: number): Intl.NumberFormat {
  let f = counts.get(fractionDigits);
  if (!f) {
    f = new Intl.NumberFormat('en-CA', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    counts.set(fractionDigits, f);
  }
  return f;
}

/**
 * Round half away from zero to `digits` decimals. The pre-round to 6 places removes
 * binary noise first (0.145 * 100 is 14.499999999999998, which should still round
 * to 15). Never returns -0, so nothing prints as "-0".
 */
function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = Math.abs(value) * factor;
  const clean = scaled < 1e9 ? Math.round(scaled * 1e6) / 1e6 : scaled;
  const rounded = Math.round(clean) / factor;
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/** 1204 → "1,204". Rounds to a whole number. Not a number → "". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '';
  return grouped(0).format(roundTo(n, 0));
}

const COMPACT_UNITS = [
  { size: 1e9, suffix: 'B' },
  { size: 1e6, suffix: 'M' },
  { size: 1e3, suffix: 'K' },
] as const;

/**
 * Charts and tight spaces: 12_400 → "12.4K", 1_000 → "1K", 2_500_000 → "2.5M".
 * One decimal at most (".0" dropped), like formatCentsCompact. Under 1,000 it is
 * the plain count. Never use it where the exact number matters.
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  for (let i = 0; i < COMPACT_UNITS.length; i++) {
    const unit = COMPACT_UNITS[i];
    if (abs < unit.size) continue;
    const value = roundTo(abs / unit.size, 1);
    // 999_960 rounds to 1000.0K: say "1M" instead (the bigger unit is the previous entry).
    if (value >= 1000 && i > 0) return `${sign}${roundTo(abs / COMPACT_UNITS[i - 1].size, 1)}${COMPACT_UNITS[i - 1].suffix}`;
    return `${sign}${value}${unit.suffix}`;
  }
  const whole = roundTo(abs, 0);
  // 999.6 rounds up to 1,000: show it as "1K", not "1,000".
  if (whole >= 1000) return `${sign}1K`;
  return `${sign}${formatCount(whole)}`;
}

/** A ratio as a percent: 0.12 → "12%", formatPercent(0.725, 1) → "72.5%". Not a number → "". */
export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '';
  const d = Math.max(0, Math.min(4, Math.floor(digits)));
  return `${grouped(d).format(roundTo(ratio * 100, d))}%`;
}

export type ChangeDirection = 'up' | 'down' | 'flat';

/** Which way a change ratio points once rounded to a whole percent (for trend chip tones). */
export function changeDirection(changeRatio: number | null | undefined): ChangeDirection {
  if (changeRatio == null || !Number.isFinite(changeRatio)) return 'flat';
  const pct = roundTo(changeRatio * 100, 0);
  if (pct > 0) return 'up';
  if (pct < 0) return 'down';
  return 'flat';
}

/**
 * A period-over-period change: 0.12 → "Up 12%", -0.03 → "Down 3%", 0.001 → "No change".
 * Returns "" when there is nothing to compare against (null, NaN, Infinity), so the
 * screen can say "Nothing in the period before" instead of a made-up number.
 */
export function formatChange(changeRatio: number | null | undefined): string {
  if (changeRatio == null || !Number.isFinite(changeRatio)) return '';
  const direction = changeDirection(changeRatio);
  if (direction === 'flat') return 'No change';
  return `${direction === 'up' ? 'Up' : 'Down'} ${formatPercent(Math.abs(changeRatio))}`;
}

/** English plural without Intl.PluralRules: only exactly one (or minus one) is singular. */
export function plural(n: number, one: string, many: string): string {
  return Math.abs(n) === 1 ? one : many;
}

/** "3 times", "1 time", "1,204 times". */
export function countLabel(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${plural(n, one, many)}`;
}

/** Loader sliders: 1600 → "1.60s", 300 → "0.30s". Not a number → "". */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  return `${roundTo(ms / 1000, 2).toFixed(2)}s`;
}

/** Elapsed time for long jobs: 7_000 → "0:07", 65_000 → "1:05", 3_725_000 → "1:02:05". */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * File sizes in decimal units, like Android's own file manager: 1_200_000 → "1.2 MB".
 * One decimal under 10 (".0" dropped), whole numbers above. Invalid or negative → "".
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  let shown = roundTo(value, value < 10 ? 1 : 0);
  // 999.6 KB rounds to 1000 KB: move up a unit ("1 MB").
  if (shown >= 1000 && unit < BYTE_UNITS.length - 1) {
    unit += 1;
    shown = 1;
  }
  return `${shown} ${BYTE_UNITS[unit]}`;
}

/**
 * North American numbers as "(905) 555-0142". Accepts E.164 ("+19055550142") and
 * the usual typed forms ("905-555-0142", "1 905 555 0142"). Anything else (other
 * countries, extensions, letters) is returned as given, trimmed.
 */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return '';
  const text = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(text)) return text;
  let digits = text.replace(/\D/g, '');
  if (text.startsWith('+')) {
    // With a "+", the country code must be 1.
    if (digits.length !== 11 || !digits.startsWith('1')) return text;
    digits = digits.slice(1);
  } else if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  // NANP: 10 digits, area code and exchange never start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return text;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Characters that never start a word for initials ("(Ottawa)", "@maya", "-").
const NOT_INITIAL = /["'`()[\]{}<>.,;:!?@#$%^&*_+=|\\/~-]/g;

/**
 * Two-letter avatar initials: "Anna Park" → "AP", "Shajeed I." → "SI", "Maya" → "M".
 * An email (when there is no name) uses its local part: "maya.chen@x.com" → "MC".
 */
export function initials(name: string | null | undefined): string {
  if (!name) return '';
  let text = name.trim();
  if (/^\S+@\S+$/.test(text)) text = text.slice(0, text.indexOf('@')).replace(/[._+-]+/g, ' ');
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(NOT_INITIAL, ''))
    .filter(Boolean);
  if (words.length === 0) return '';
  // Array.from keeps surrogate pairs (emoji, rare scripts) whole.
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/** Cut text to at most `max` characters, ending with "…" when cut. Counts code points, not UTF-16 units. */
export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  if (!(max > 0)) return '';
  if (text.length <= max) return text;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, Math.max(0, Math.floor(max) - 1))
    .join('')
    .trimEnd()}…`;
}
