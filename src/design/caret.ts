import { Platform, type ColorValue } from 'react-native';

import { withAlpha } from './tokens';

type Os = typeof Platform.OS;

export type CaretColors = {
  selectionColor?: ColorValue;
  cursorColor?: ColorValue;
  selectionHandleColor?: ColorValue;
};

/**
 * Caret, selection handles and selection highlight for a TextInput, in gold.
 * - Android colours the three apart: a solid caret and handles, a 30% highlight.
 * - iOS has one tint (`selectionColor`) for the caret and the handles, and draws
 *   the highlight from it with its own transparency. A 30% tint there would
 *   leave a caret that can hardly be seen, so it gets the solid colour.
 */
export function caretColors(gold: string, os: Os = Platform.OS): CaretColors {
  if (os === 'ios') return { selectionColor: gold };
  return { cursorColor: gold, selectionHandleColor: gold, selectionColor: withAlpha(gold, 0.3) };
}
