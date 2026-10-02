/**
 * Pure maths for the image viewer's pinch, pan and double tap. Every function is
 * a worklet (it runs on the UI thread inside gesture callbacks) and is unit
 * tested on the JS thread.
 *
 * Coordinates are relative to the centre of the viewer, the transform origin.
 * A content point p is drawn at t + s * p (translate t, scale s).
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
/** Below this the image counts as not zoomed (swipe down closes instead of panning). */
export const ZOOMED_EPSILON = 0.02;

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/** Contain-fit size of an image inside the box; the whole box when the size is unknown. */
export function fitSize(boxW: number, boxH: number, imageW: number | null, imageH: number | null): { width: number; height: number } {
  'worklet';
  if (!imageW || !imageH || boxW <= 0 || boxH <= 0) return { width: boxW, height: boxH };
  const ratio = Math.min(boxW / imageW, boxH / imageH);
  return { width: imageW * ratio, height: imageH * ratio };
}

/** How far the content may move from the centre at this scale before an edge comes inside the box. */
export function maxOffset(content: number, box: number, scale: number): number {
  'worklet';
  return Math.max(0, (content * scale - box) / 2);
}

/**
 * The translation that keeps the content under the fingers while scaling from
 * s0 to s1: the point under the first focal point f0 ends up under f1.
 */
export function pinchTranslate(f0: number, f1: number, t0: number, s0: number, s1: number): number {
  'worklet';
  return f1 - (s1 / s0) * (f0 - t0);
}

/** A pinch past the limits resists (the image follows at a quarter of the finger), then springs back. */
export function resistScale(raw: number): number {
  'worklet';
  if (raw < MIN_SCALE) return MIN_SCALE - (MIN_SCALE - raw) * 0.35;
  if (raw > MAX_SCALE) return MAX_SCALE + (raw - MAX_SCALE) * 0.25;
  return raw;
}

/** Double tap: zoom in on the tapped point, or back out when already zoomed. */
export function doubleTapTarget(
  focal: { x: number; y: number },
  translate: { x: number; y: number },
  scale: number,
  content: { width: number; height: number },
  box: { width: number; height: number },
): { scale: number; x: number; y: number } {
  'worklet';
  if (scale > MIN_SCALE + ZOOMED_EPSILON) return { scale: MIN_SCALE, x: 0, y: 0 };
  const next = DOUBLE_TAP_SCALE;
  const mx = maxOffset(content.width, box.width, next);
  const my = maxOffset(content.height, box.height, next);
  return {
    scale: next,
    x: clamp(pinchTranslate(focal.x, focal.x, translate.x, scale, next), -mx, mx),
    y: clamp(pinchTranslate(focal.y, focal.y, translate.y, scale, next), -my, my),
  };
}

/** Swipe down to close: far enough, or flicked fast enough. */
export function shouldDismiss(dragY: number, velocityY: number, boxH: number): boolean {
  'worklet';
  return dragY > Math.min(160, boxH * 0.18) || (velocityY > 900 && dragY > 24);
}

/** The backdrop fades as the image is dragged away (never fully, so the screen is never blank). */
export function backdropOpacity(dragY: number, boxH: number): number {
  'worklet';
  if (boxH <= 0) return 1;
  return 1 - clamp(Math.abs(dragY) / (boxH * 0.6), 0, 0.75);
}
