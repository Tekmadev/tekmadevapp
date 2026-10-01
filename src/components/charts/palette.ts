import type { Palette } from '@/design/tokens';

/**
 * Category colours for charts, from our palette only (never a rainbow).
 *
 * Every slot is a gold or a warm grey, so they sit close together. The order is
 * picked so neighbours differ as much as possible (the order with the largest
 * worst-case OKLab distance between adjacent slots, the ring wrap included):
 * both schemes clear a distance of 15 between any two neighbouring slices.
 * Dark mode has its own order because the same token names land on different
 * lightness steps there. Identity never rests on colour alone: every chart
 * that uses these also shows a legend with labels.
 */
type Slot = keyof Pick<Palette, 'gold' | 'goldMid' | 'goldSoft' | 'goldDeep' | 'ink3' | 'ink4' | 'ink5'>;

const LIGHT_ORDER: readonly Slot[] = ['gold', 'goldSoft', 'ink4', 'ink3', 'goldMid', 'goldDeep', 'ink5'];
const DARK_ORDER: readonly Slot[] = ['gold', 'goldSoft', 'ink3', 'ink5', 'goldDeep', 'goldMid', 'ink4'];

export const CATEGORY_SLOTS = LIGHT_ORDER.length;

export function categoryColors(colors: Palette, isDark: boolean): string[] {
  return (isDark ? DARK_ORDER : LIGHT_ORDER).map((slot) => colors[slot]);
}

/** The folded "Other" slice: quiet on purpose, it is the least specific row. */
export function otherColor(colors: Palette): string {
  return colors.lineStrong;
}
