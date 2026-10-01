import { memo } from 'react';

import { BlackHole } from './BlackHole';
import { useLoaderSettings } from './settings';

export type ButtonSpinnerProps = {
  /** About 1.15x the button label's font size. */
  size: number;
  /** The button's text colour. */
  color: string;
};

/**
 * The black hole inside a pending button: sized to the label (about 1.15x the
 * font size) and drawn in the button's text colour, on the faster `buttonBeatMs`.
 * Decorative: the button's pending label ("Saving") is what TalkBack reads.
 */
export const ButtonSpinner = memo(function ButtonSpinner({ size, color }: ButtonSpinnerProps) {
  const { buttonBeatMs } = useLoaderSettings();
  return <BlackHole size={size} color={color} beatMs={buttonBeatMs} />;
});
