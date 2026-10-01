/**
 * Pure geometry for the bottom sheet. Every function is a worklet so gestures
 * can call it on the UI thread, and plain enough to unit test.
 *
 * Positions are `translateY` offsets of the sheet from its tallest resting
 * place: 0 is fully open, larger numbers are lower on the screen.
 */

/** Sheets never cover more than this share of the window. */
export const MAX_SHEET_FRACTION = 0.92;
/** Gap kept between the status bar and the top of a full-height sheet. */
export const SHEET_TOP_GAP = 8;
/** The smallest snap point we accept, as a share of the window. */
const MIN_SNAP_FRACTION = 0.1;

/** How far a released drag keeps travelling (seconds of its velocity) when picking a snap point. */
export const PROJECTION_S = 0.1;
/** A downward fling faster than this (dp/s) near the lowest snap point closes the sheet. */
export const CLOSE_VELOCITY = 1100;
/** Dragging further than this below the lowest snap point closes the sheet... */
export const CLOSE_DISTANCE_MAX = 160;
/** ...or this share of the visible sheet, whichever is smaller. */
export const CLOSE_DISTANCE_FRACTION = 0.3;
/** A release moving up faster than this (dp/s) never closes, even past the distance. */
export const CLOSE_CANCEL_VELOCITY = -300;

export function maxSheetHeight(windowHeight: number, topInset: number): number {
  'worklet';
  return Math.max(0, Math.min(windowHeight * MAX_SHEET_FRACTION, windowHeight - topInset - SHEET_TOP_GAP));
}

/**
 * Snap points (fractions of the window height) to sheet heights in dp,
 * clamped to the allowed range, de-duplicated and sorted from shortest to tallest.
 */
export function snapHeights(points: readonly number[], windowHeight: number, maxHeight: number): number[] {
  'worklet';
  const minHeight = Math.min(windowHeight * MIN_SNAP_FRACTION, maxHeight);
  const heights: number[] = [];
  for (const p of points) {
    if (!Number.isFinite(p)) continue;
    const h = Math.round(Math.min(maxHeight, Math.max(minHeight, p * windowHeight)));
    if (!heights.includes(h)) heights.push(h);
  }
  if (heights.length === 0) heights.push(Math.round(maxHeight));
  return heights.sort((a, b) => a - b);
}

/** Resting offsets for each height, sorted from the top (0) down. */
export function snapOffsets(heights: readonly number[]): number[] {
  'worklet';
  if (heights.length === 0) return [0];
  const tallest = Math.max(...heights);
  return heights.map((h) => tallest - h).sort((a, b) => a - b);
}

/**
 * Rubber band: resistance that grows with distance and never passes `limit`.
 * Small pulls move about half as far as the finger.
 */
export function rubberBand(distance: number, limit: number): number {
  'worklet';
  if (distance <= 0 || limit <= 0) return 0;
  return (1 - 1 / ((distance * 0.55) / limit + 1)) * limit;
}

/** Index of the value closest to `target`. */
export function nearestIndex(values: readonly number[], target: number): number {
  'worklet';
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i] - target) < Math.abs(values[best] - target)) best = i;
  }
  return best;
}

/**
 * Where a raw drag position may go: above the top snap point it rubber-bands
 * (or stops, for a scroll body that takes over), and when the sheet cannot be
 * dismissed it resists below the lowest snap point.
 */
export function limitDrag(
  raw: number,
  offsets: readonly number[],
  canDismiss: boolean,
  rubberAboveTop: boolean,
  rubberLimit: number,
): number {
  'worklet';
  const top = offsets[0] ?? 0;
  const lowest = offsets[offsets.length - 1] ?? 0;
  if (raw < top) return rubberAboveTop ? top - rubberBand(top - raw, rubberLimit) : top;
  if (!canDismiss && raw > lowest) return lowest + rubberBand(raw - lowest, rubberLimit);
  return raw;
}

export type SettleResult = { close: true } | { close: false; index: number; target: number };

/**
 * What a released drag does: close (fast fling down near the bottom, or dragged
 * far enough below the lowest snap point) or settle on the nearest snap point,
 * taking a little of the release velocity into account.
 */
export function settleDrag(
  position: number,
  velocity: number,
  offsets: readonly number[],
  sheetHeight: number,
  canDismiss: boolean,
): SettleResult {
  'worklet';
  const lowest = offsets[offsets.length - 1] ?? 0;
  if (canDismiss) {
    const visible = Math.max(1, sheetHeight - lowest);
    const pastDistance = position - lowest > Math.min(visible * CLOSE_DISTANCE_FRACTION, CLOSE_DISTANCE_MAX);
    const flung = velocity > CLOSE_VELOCITY && position > lowest - 8;
    if ((pastDistance && velocity > CLOSE_CANCEL_VELOCITY) || flung) return { close: true };
  }
  const index = nearestIndex(offsets, position + velocity * PROJECTION_S);
  return { close: false, index, target: offsets[index] ?? 0 };
}
