/**
 * Slider step math. These run on the UI thread inside the pan gesture, so each
 * one is a worklet; they are plain functions in tests.
 *
 * A slider position is a step index from 0 to stepCount. Values are rebuilt from
 * the index and rounded to the step's decimals, so 0.5 + 22 * 0.01 is 0.72, not
 * 0.7200000000000001.
 */

export function stepDecimals(step: number): number {
  'worklet';
  if (!Number.isFinite(step) || Math.floor(step) === step) return 0;
  const text = String(step);
  const e = text.indexOf('e-');
  if (e >= 0) return Number(text.slice(e + 2));
  const dot = text.indexOf('.');
  return dot >= 0 ? text.length - dot - 1 : 0;
}

export function stepCount(min: number, max: number, step: number): number {
  'worklet';
  if (!(max > min) || !(step > 0)) return 0;
  return Math.max(1, Math.round((max - min) / step));
}

export function valueAtIndex(index: number, min: number, max: number, step: number): number {
  'worklet';
  const factor = Math.pow(10, stepDecimals(step));
  const raw = min + index * step;
  const rounded = Math.round(raw * factor) / factor;
  return Math.min(max, Math.max(min, rounded));
}

export function indexOfValue(value: number, min: number, max: number, step: number): number {
  'worklet';
  const count = stepCount(min, max, step);
  if (count === 0 || !Number.isFinite(value)) return 0;
  return Math.min(count, Math.max(0, Math.round((value - min) / step)));
}

/** The step nearest to a 0..1 position along the track. */
export function indexAtRatio(ratio: number, count: number): number {
  'worklet';
  const r = Math.min(1, Math.max(0, ratio));
  return Math.round(r * count);
}
