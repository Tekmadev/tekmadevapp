import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

export type BlackHoleProps = {
  /** Rendered size in dp (the 2400 unit viewBox is scaled to this). */
  size: number;
  /** Fill colour; defaults to the theme gold. */
  color?: string;
  /** One beat in ms; defaults to the page loader `beatMs` setting. */
  beatMs?: number;
  /** Pause the beat (e.g. offscreen). Default false. */
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** STUB (replaced by the loader work): the Tekmadev black hole, UI-thread Skia. */
export function BlackHole({ size, style }: BlackHoleProps) {
  return <View style={[{ width: size, height: size }, style]} />;
}
