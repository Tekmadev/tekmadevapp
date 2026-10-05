import { forwardRef } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import type { Palette, Tone } from '@/design/tokens';
import {
  MAX_FONT_SCALE,
  tabular as tabularStyle,
  type,
  variantFace,
  type FontFamilyName,
  type FontWeight,
  type TypeVariant,
} from '@/design/typography';

export type TextColor = keyof Pick<
  Palette,
  'ink' | 'ink2' | 'ink3' | 'ink4' | 'ink5' | 'gold' | 'goldDeep' | 'goldMid' | 'signal' | 'onInk'
>;

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  /** A palette colour name (default ink; eyebrow defaults to ink3). */
  color?: TextColor;
  /** Use a status tone's text colour instead of a palette colour. */
  tone?: Tone;
  align?: TextStyle['textAlign'];
  /** Tabular figures (for anything compared: money, counts, tables). */
  tabular?: boolean;
  /** The variant's weight, overridden. Never pass fontWeight in `style`: iOS needs a face per weight. */
  weight?: FontWeight;
  /** The variant's family, overridden ('mono' for code inside running text). */
  family?: FontFamilyName;
};

/**
 * The only Text in the app. Applies the type scale, theme colours and the
 * 1.3x font-scale cap so layouts never clip at large system font sizes.
 * A `weight` or `family` override is resolved per platform (typography.ts).
 */
export const Text = forwardRef<RNText, TextProps>(function Text(
  { variant = 'body', color, tone, align, tabular, weight, family, style, maxFontSizeMultiplier, ...rest },
  ref,
) {
  const { colors, tones } = useTheme();
  const fallback: TextColor = variant === 'eyebrow' ? 'ink3' : 'ink';
  const resolved = tone ? tones[tone].text : colors[color ?? fallback];
  const face = weight !== undefined || family !== undefined ? variantFace(variant, { family, weight }) : null;
  return (
    <RNText
      ref={ref}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE}
      style={[
        type[variant],
        { color: resolved, includeFontPadding: false },
        align ? { textAlign: align } : null,
        tabular ? tabularStyle : null,
        face,
        style,
      ]}
      {...rest}
    />
  );
});
