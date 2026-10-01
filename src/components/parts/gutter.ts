import { createContext, use } from 'react';

/**
 * The side padding the enclosing screen applies to its content (16 in a padded
 * Screen, 0 elsewhere). Edge-to-edge rows (FilterChips, ScrollTabs) cancel it
 * with a negative margin, so they bleed to the screen edges wherever they sit.
 */
export const GutterContext = createContext(0);

export function useGutter(): number {
  return use(GutterContext);
}
