/**
 * Character count state for "42/60". A soft limit (meta title: aim for 60 or
 * fewer) may be passed while typing; a hard maxLength cannot, so reaching it
 * shows as "near".
 */

export type CountState = 'normal' | 'near' | 'over';

/** How close counts as near: the last 10% of the limit, at least 3 characters. */
export function nearThreshold(limit: number): number {
  return Math.max(3, Math.ceil(limit * 0.1));
}

export function countState(length: number, limit: number): CountState {
  if (length > limit) return 'over';
  if (length >= limit - nearThreshold(limit)) return 'near';
  return 'normal';
}
