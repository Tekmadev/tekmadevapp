import { Canvas, ColorMatrix, Fill, FractalNoise } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';

export type GrainProps = {
  /** Strength of the grain (default 0.05, the brief's "about 5%"). */
  opacity?: number;
  /** Fixed so the grain is identical on every render and every launch. */
  seed?: number;
  style?: StyleProp<ViewStyle>;
};

/** "#rrggbb" to 0..1 channels. */
function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/**
 * A colour matrix that turns grey noise into specks of `ink` whose alpha follows
 * the noise. Multiply in light mode darkens where the noise is dark; screen in
 * dark mode lightens where it is light. A view cannot blend with what is under
 * it on Android, so the two blend modes are reproduced as alpha: dark specks
 * (light) or warm light specks (dark). The noise's contrast is tripled first so
 * the grain reads at a 5% average instead of washing out.
 */
function grainMatrix(ink: string, opacity: number, dark: boolean): number[] {
  const [r, g, b] = channels(ink);
  // alpha = opacity * 2 * (0.5 + 3 * (lum - 0.5)), or its inverse for multiply.
  const k = (dark ? 2 : -2) * opacity;
  const t = (dark ? -2 : 4) * opacity;
  return [0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, k, k, k, 0, t];
}

/**
 * A very light film grain over its parent (absolutely fills it, ignores touches).
 * Drawn once by Skia and never animated: the canvas only redraws when the theme
 * changes. For the splash, sign-in and the Home header.
 */
export const Grain = memo(function Grain({ opacity = 0.05, seed = 7, style }: GrainProps) {
  const { colors, isDark } = useTheme();
  const matrix = useMemo(() => grainMatrix(colors.ink, opacity, isDark), [colors.ink, opacity, isDark]);
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[StyleSheet.absoluteFill, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill>
          <FractalNoise freqX={0.85} freqY={0.85} octaves={2} seed={seed} />
          <ColorMatrix matrix={matrix} />
        </Fill>
      </Canvas>
    </View>
  );
});
