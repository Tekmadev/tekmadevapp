import type { TextStyle } from 'react-native';

/**
 * Type scale. Geist and Geist Mono are embedded at build time (expo-font config
 * plugin, Android XML font families), so `fontFamily` + `fontWeight` selects the
 * right file natively and nothing loads at runtime.
 *
 * Letter spacing in the brief is given in percent of the font size; React Native
 * wants absolute values, so `tracking()` converts.
 */

export const fonts = {
  sans: 'Geist',
  mono: 'GeistMono',
} as const;

/** System font scaling is respected up to this multiplier. */
export const MAX_FONT_SCALE = 1.3;

export const tracking = (size: number, percent: number) => (size * percent) / 100;

type Variant = Pick<
  TextStyle,
  'fontFamily' | 'fontWeight' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'textTransform' | 'fontVariant'
>;

/**
 * The brief's display line height is 0.94, but Geist's natural line is 1.30em
 * (ascent 1005, descent 295 per 1000) and Android trims a short line box equally
 * from the top and the bottom, which cuts the descenders of g, p, y, j and q.
 * 1.16 is the tightest value that keeps the full descender on Android.
 */
const DISPLAY_LINE = 1.16;

const display = (size: number): Variant => ({
  fontFamily: fonts.sans,
  fontWeight: '800',
  fontSize: size,
  lineHeight: Math.round(size * DISPLAY_LINE),
  letterSpacing: tracking(size, -4),
  fontVariant: ['tabular-nums'],
});

const headline = (size: number): Variant => ({
  fontFamily: fonts.sans,
  fontWeight: '700',
  fontSize: size,
  lineHeight: Math.round(size * 1.22),
  letterSpacing: tracking(size, -2.5),
});

export const type = {
  /** Screen large titles. */
  largeTitle: display(34),
  /** KPI numbers. */
  kpi: display(40),
  kpiLarge: display(56),
  /** Big confident numbers in cards (guarantee, counts). */
  number: display(28),
  headline: headline(24),
  headlineSmall: headline(22),
  headlineLarge: headline(28),
  title: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: tracking(17, -1),
  } satisfies Variant,
  body: { fontFamily: fonts.sans, fontWeight: '400', fontSize: 15, lineHeight: 22 } satisfies Variant,
  bodyStrong: { fontFamily: fonts.sans, fontWeight: '600', fontSize: 15, lineHeight: 22 } satisfies Variant,
  /** Long-form writing surface (blog editor). */
  editor: { fontFamily: fonts.sans, fontWeight: '400', fontSize: 17, lineHeight: 28 } satisfies Variant,
  small: { fontFamily: fonts.sans, fontWeight: '400', fontSize: 13, lineHeight: 18 } satisfies Variant,
  label: { fontFamily: fonts.sans, fontWeight: '500', fontSize: 13, lineHeight: 18 } satisfies Variant,
  caption: { fontFamily: fonts.sans, fontWeight: '500', fontSize: 11, lineHeight: 14 } satisfies Variant,
  button: { fontFamily: fonts.sans, fontWeight: '600', fontSize: 15, lineHeight: 20 } satisfies Variant,
  eyebrow: {
    fontFamily: fonts.mono,
    fontWeight: '500',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: tracking(11, 18),
    textTransform: 'uppercase',
  } satisfies Variant,
  mono: { fontFamily: fonts.mono, fontWeight: '400', fontSize: 13, lineHeight: 18 } satisfies Variant,
  monoLarge: { fontFamily: fonts.mono, fontWeight: '500', fontSize: 17, lineHeight: 22 } satisfies Variant,
} as const;

export type TypeVariant = keyof typeof type;

/** Use wherever numbers are compared (tables, KPIs, money). */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
