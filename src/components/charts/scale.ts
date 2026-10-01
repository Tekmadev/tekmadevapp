/**
 * Chart math, kept free of React and Skia so it can be unit tested and reused.
 *
 * Chart labels from the API are text. Nothing here parses them as dates: they
 * are shown exactly as the server sent them (see src/lib/dates.ts).
 */

import { formatCount } from '@/lib/format';

/** "3,412": the app-wide count format, re-exported as the charts' default value format. */
export { formatCount };

const trim1 = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/** Axis labels: 950 stays "950", 1200 is "1.2K", 12000 is "12K", 1250000 is "1.3M". */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  // The thresholds sit where rounding would print "1000K" or "1000M": those read "1M" and "1B".
  if (abs >= 999_950_000) return `${sign}${trim1(abs / 1_000_000_000)}B`;
  if (abs >= 999_500) return `${sign}${trim1(abs / 1_000_000)}M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)}K`;
  if (abs >= 1_000) return `${sign}${trim1(abs / 1000)}K`;
  return `${sign}${Number.isInteger(abs) ? abs : trim1(abs)}`;
}

/** Share of a total as a short percent: "42%", "<1%" for tiny non-zero shares, "0%" for none. */
export function formatShare(part: number, total: number): string {
  if (total <= 0 || part <= 0) return '0%';
  const pct = (part / total) * 100;
  if (pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

/*
 * Step sizes for gridlines. A finer set than the classic 1/2/5 keeps the
 * top gridline close to the real peak (214 gets a 240 top, not 300), so the
 * line uses most of the chart height.
 */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * A clean top for the y scale split into `ticks` equal steps.
 * niceScale(214, 3) gives { step: 80, max: 240 }. Never returns a zero step.
 * With `integer` (whole counts) the step never drops under 1, so a series
 * that peaks at 2 pageviews is labelled 1, 2, 3 and not 0.8, 1.6, 2.4.
 */
export function niceScale(maxValue: number, ticks = 3, integer = true): { step: number; max: number } {
  const target = Math.max(maxValue, 0) / ticks;
  if (target <= 0 || !Number.isFinite(target)) return { step: 1, max: ticks };
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;
  const nice = NICE_STEPS.find((s) => s >= normalized - 1e-9) ?? 10;
  let step = nice * magnitude;
  if (integer) step = Math.max(1, Math.round(step));
  return { step, max: step * ticks };
}

export type SeriesLayout = {
  xs: number[];
  ys: number[];
  /** y of the value 0 line. */
  baseline: number;
  /** Gridline y positions (bottom to top) and their values. */
  grid: { y: number; value: number }[];
  max: number;
};

export type Insets = { top: number; bottom: number; left: number; right: number };

/**
 * Places evenly spaced points (labels are categories, not timestamps) inside
 * the plot, with `ticks` gridlines above the baseline.
 * A single point sits in the middle.
 */
export function layoutSeries(values: readonly number[], width: number, height: number, insets: Insets, ticks = 3): SeriesLayout {
  const peak = values.reduce((m, v) => (Number.isFinite(v) && v > m ? v : m), 0);
  const { step, max } = niceScale(peak, ticks, values.every((v) => Number.isInteger(v)));
  const top = insets.top;
  const baseline = height - insets.bottom;
  const plotH = Math.max(baseline - top, 1);
  const left = insets.left;
  const plotW = Math.max(width - insets.left - insets.right, 1);
  const n = values.length;
  const y = (v: number) => baseline - (Math.max(0, Number.isFinite(v) ? v : 0) / max) * plotH;
  const xs = values.map((_, i) => (n === 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW));
  const ys = values.map(y);
  const grid = Array.from({ length: ticks }, (_, i) => ({ value: step * (i + 1), y: y(step * (i + 1)) }));
  return { xs, ys, baseline, grid, max };
}

/** Index of the point nearest to x for evenly spaced points. Runs on the UI thread. */
export function nearestIndex(x: number, count: number, left: number, plotWidth: number): number {
  'worklet';
  if (count <= 1) return 0;
  const t = (x - left) / plotWidth;
  const i = Math.round(t * (count - 1));
  // `<= 0` also folds Math.round's -0 into 0.
  return i <= 0 ? 0 : i > count - 1 ? count - 1 : i;
}

export type CubicSegment = { c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number };

/**
 * Monotone cubic interpolation (Fritsch and Carlson). The curve is smooth but
 * never overshoots its points, so it never dips under the baseline or invents
 * a peak the data does not have. Returns the cubic segments after the first point.
 */
export function monotoneSegments(xs: readonly number[], ys: readonly number[]): CubicSegment[] {
  const n = xs.length;
  if (n < 2) return [];
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i];
    dx.push(h);
    m.push(h === 0 ? 0 : (ys[i + 1] - ys[i]) / h);
  }
  const t: number[] = new Array<number>(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }
  const out: CubicSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    out.push({
      c1x: xs[i] + h,
      c1y: ys[i] + t[i] * h,
      c2x: xs[i + 1] - h,
      c2y: ys[i + 1] - t[i + 1] * h,
      x: xs[i + 1],
      y: ys[i + 1],
    });
  }
  return out;
}

export type Slice<T> = { label: string; count: number; isOther: boolean; items: T[] };

/**
 * Top `limit` rows by count, with everything after them folded into one
 * "Other" row (only when there is something to fold). Zero and negative
 * counts are dropped: they cannot be drawn and add nothing to a share.
 */
export function topWithOther<T extends { label: string; count: number }>(
  rows: readonly T[],
  limit = 7,
  otherLabel = 'Other',
): Slice<T>[] {
  const positive = rows.filter((r) => Number.isFinite(r.count) && r.count > 0);
  const sorted = [...positive].sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, limit).map((r) => ({ label: r.label, count: r.count, isOther: false, items: [r] }));
  const tail = sorted.slice(limit);
  if (tail.length === 0) return head;
  // A single leftover row keeps its own name instead of becoming "Other".
  if (tail.length === 1) return [...head, { label: tail[0].label, count: tail[0].count, isOther: false, items: [tail[0]] }];
  return [...head, { label: otherLabel, count: tail.reduce((s, r) => s + r.count, 0), isOther: true, items: tail }];
}

export type SummaryPoint = { label: string; value: number; title?: string };

/**
 * TalkBack summary of a series:
 * "Pageviews, last 30 days, total 3,412, peak 214 on Sep 12".
 */
export function summarizeSeries(options: {
  name: string;
  period?: string;
  data: readonly SummaryPoint[];
  formatValue?: (n: number) => string;
  /** Add the total (true for counts; false for rates or balances that do not sum). */
  withTotal?: boolean;
}): string {
  const { name, period, data, formatValue = formatCount, withTotal = true } = options;
  const head = period ? `${name}, ${period}` : name;
  if (data.length === 0) return `${head}, no data yet`;
  const total = data.reduce((s, p) => s + (Number.isFinite(p.value) ? p.value : 0), 0);
  let peak = data[0];
  for (const p of data) if (p.value > peak.value) peak = p;
  const parts = [head];
  if (withTotal) parts.push(`total ${formatValue(total)}`);
  parts.push(`peak ${formatValue(peak.value)} on ${peak.title ?? peak.label}`);
  return parts.join(', ');
}

/** "Traffic sources, total 3,412: Google 42%, Direct 28%, Other 9%". */
export function summarizeShares(name: string, rows: readonly { label: string; count: number }[], formatValue = formatCount): string {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total <= 0) return `${name}, no data yet`;
  const list = rows.map((r) => `${r.label} ${formatShare(r.count, total)}`).join(', ');
  return `${name}, total ${formatValue(total)}: ${list}`;
}
