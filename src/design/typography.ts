import { Platform, type TextStyle } from 'react-native';

/**
 * Type scale and font faces. Geist and Geist Mono are embedded at build time by
 * the expo-font config plugin, so nothing loads at runtime and the first frame
 * already has the right type.
 *
 * The two platforms name the files differently:
 * - Android registers each family as an XML font family, so `fontFamily: 'Geist'`
 *   plus `fontWeight` selects the right file.
 * - iOS registers every file as its own face, so `fontFamily` must be the face's
 *   PostScript name ("Geist-SemiBold"). `fontWeight` is then pinned to that
 *   face's own weight: React Native picks the closest weight inside the face's
 *   family, so a stale weight from another style could otherwise land on a
 *   different file, and a missing file would fall back to the system font.
 *
 * So every font in the app goes through `fontFace()` (or the `weight` and
 * `family` props of <Text>, or a `type` variant, which are already resolved).
 * An ESLint rule keeps raw `fontFamily` and `fontWeight` out of the rest of src.
 *
 * Letter spacing in the brief is given in percent of the font size; React Native
 * wants absolute values, so `tracking()` converts.
 */

export type FontFamilyName = 'sans' | 'mono';
export type FontWeight = NonNullable<TextStyle['fontWeight']>;
/** The style keys a font face sets. */
export type FontFace = Pick<TextStyle, 'fontFamily' | 'fontWeight'>;
type Os = typeof Platform.OS;

/** Android XML font family names (app.json, expo-font plugin). */
export const fonts = {
  sans: 'Geist',
  mono: 'GeistMono',
} as const;

/** The weights that have a file, per family. */
type SansWeight = 400 | 500 | 600 | 700 | 800 | 900;
type MonoWeight = 400 | 500;

/** iOS PostScript names, one per embedded file (read from the files' name tables). */
const IOS_FACES: { sans: Record<SansWeight, string>; mono: Record<MonoWeight, string> } = {
  sans: {
    400: 'Geist-Regular',
    500: 'Geist-Medium',
    600: 'Geist-SemiBold',
    700: 'Geist-Bold',
    800: 'Geist-ExtraBold',
    900: 'Geist-Black',
  },
  mono: {
    400: 'GeistMono-Regular',
    500: 'GeistMono-Medium',
  },
};

/** React Native's named weights as numbers (iOS maps them the same way). */
const NAMED_WEIGHTS: Partial<Record<string, number>> = {
  normal: 400,
  regular: 400,
  condensed: 400,
  bold: 700,
  condensedBold: 700,
  ultralight: 100,
  thin: 200,
  light: 300,
  medium: 500,
  semibold: 600,
  heavy: 800,
  black: 900,
};

/** Any React Native font weight as a number from 100 to 900 (missing or unknown: 400). */
export function numericWeight(weight: FontWeight | undefined): number {
  if (weight === undefined) return 400;
  const value = typeof weight === 'number' ? weight : (NAMED_WEIGHTS[weight] ?? Number(weight));
  if (!Number.isFinite(value)) return 400;
  return Math.min(900, Math.max(100, Math.round(value / 100) * 100));
}

/**
 * The weight a family really has a file for. Geist has 400 to 900, so anything
 * lighter is 400. Geist Mono has only 400 and 500: lighter is 400, heavier is
 * 500 (the same files Android's closest-weight match lands on).
 */
export function availableWeight(family: 'sans', weight: FontWeight | undefined): SansWeight;
export function availableWeight(family: 'mono', weight: FontWeight | undefined): MonoWeight;
export function availableWeight(family: FontFamilyName, weight: FontWeight | undefined): SansWeight | MonoWeight;
export function availableWeight(family: FontFamilyName, weight: FontWeight | undefined): SansWeight | MonoWeight {
  const w = numericWeight(weight);
  if (family === 'mono') return w >= 500 ? 500 : 400;
  return Math.max(400, w) as SansWeight;
}

/** The iOS PostScript name for a family at a weight (snapped to a file that exists). */
export function iosFaceName(family: FontFamilyName, weight: FontWeight | undefined): string {
  return family === 'mono' ? IOS_FACES.mono[availableWeight('mono', weight)] : IOS_FACES.sans[availableWeight('sans', weight)];
}

/**
 * The style that draws `family` at `weight` on this platform.
 * - iOS: the PostScript face, with `fontWeight` pinned to that face's weight
 *   (so nothing else can pick another file and nothing is synthesised).
 * - Android: unchanged, the XML family plus the weight as given (no weight:
 *   only the family, so the weight is inherited as before).
 */
export function fontFace(family: FontFamilyName, weight?: FontWeight, os: Os = Platform.OS): FontFace {
  if (os === 'ios') {
    const w = family === 'mono' ? availableWeight('mono', weight) : availableWeight('sans', weight);
    return { fontFamily: iosFaceName(family, weight), fontWeight: `${w}` };
  }
  return weight === undefined ? { fontFamily: fonts[family] } : { fontFamily: fonts[family], fontWeight: weight };
}

/** System font scaling is respected up to this multiplier. */
export const MAX_FONT_SCALE = 1.3;

export const tracking = (size: number, percent: number) => (size * percent) / 100;

/** A variant as written: a family and a weight rather than platform font names. */
export type TypeSpec = {
  family: FontFamilyName;
  weight: FontWeight;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: TextStyle['textTransform'];
  fontVariant?: TextStyle['fontVariant'];
};

/** A variant as applied: the spec with its family and weight resolved for this platform. */
export type TypeStyle = Omit<TypeSpec, 'family' | 'weight'> & { fontFamily: string; fontWeight: FontWeight };

/**
 * Display line height. The brief says 0.94, but Geist's natural line is 1.30em
 * (ascent 1005, descent 295 per 1000) and a shorter line box clips glyphs:
 * - Android trims it equally from the top and the bottom, which cut the
 *   descenders of g, p, y, j and q. 1.16 is the tightest line that keeps them.
 * - iOS anchors the text to the bottom of the box and cuts the top instead,
 *   which at 1.16 shaves the accents of capitals (É and Á reach 0.915em).
 *   1.22, the headline line, keeps them.
 */
export function displayLine(os: Os = Platform.OS): number {
  return os === 'ios' ? 1.22 : 1.16;
}

function scale(os: Os) {
  const line = displayLine(os);
  const display = (size: number): TypeSpec => ({
    family: 'sans',
    weight: '800',
    fontSize: size,
    lineHeight: Math.round(size * line),
    letterSpacing: tracking(size, -4),
    fontVariant: ['tabular-nums'],
  });
  const headline = (size: number): TypeSpec => ({
    family: 'sans',
    weight: '700',
    fontSize: size,
    lineHeight: Math.round(size * 1.22),
    letterSpacing: tracking(size, -2.5),
  });

  return {
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
    title: { family: 'sans', weight: '600', fontSize: 17, lineHeight: 22, letterSpacing: tracking(17, -1) },
    body: { family: 'sans', weight: '400', fontSize: 15, lineHeight: 22 },
    bodyStrong: { family: 'sans', weight: '600', fontSize: 15, lineHeight: 22 },
    /** Long-form writing surface (blog editor). */
    editor: { family: 'sans', weight: '400', fontSize: 17, lineHeight: 28 },
    small: { family: 'sans', weight: '400', fontSize: 13, lineHeight: 18 },
    label: { family: 'sans', weight: '500', fontSize: 13, lineHeight: 18 },
    caption: { family: 'sans', weight: '500', fontSize: 11, lineHeight: 14 },
    button: { family: 'sans', weight: '600', fontSize: 15, lineHeight: 20 },
    eyebrow: {
      family: 'mono',
      weight: '500',
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: tracking(11, 18),
      textTransform: 'uppercase',
    },
    mono: { family: 'mono', weight: '400', fontSize: 13, lineHeight: 18 },
    monoLarge: { family: 'mono', weight: '500', fontSize: 17, lineHeight: 22 },
  } satisfies Record<string, TypeSpec>;
}

export type TypeVariant = keyof ReturnType<typeof scale>;

/** The type scale as written (family and weight per variant), for a platform. */
export function typeSpecs(os: Os = Platform.OS): Record<TypeVariant, TypeSpec> {
  return scale(os);
}

/** A spec resolved for a platform. Both keys are always set, so a variant never inherits a font. */
function resolve({ family, weight, ...rest }: TypeSpec, os: Os): TypeStyle {
  const face = fontFace(family, weight, os);
  return { ...rest, fontFamily: face.fontFamily ?? fonts[family], fontWeight: face.fontWeight ?? weight };
}

/** The type scale resolved for a platform (`type` is this platform's). */
export function buildTypeScale(os: Os = Platform.OS): Record<TypeVariant, TypeStyle> {
  const specs = typeSpecs(os);
  const out = {} as Record<TypeVariant, TypeStyle>;
  for (const key of Object.keys(specs) as TypeVariant[]) out[key] = resolve(specs[key], os);
  return out;
}

/** This platform's type scale as written (the family and weight each variant starts from). */
export const typeSpec: Readonly<Record<TypeVariant, TypeSpec>> = typeSpecs();

/** This platform's type scale, ready for `style` (TextInputs spread a variant's keys from here). */
export const type: Readonly<Record<TypeVariant, TypeStyle>> = buildTypeScale();

/**
 * A variant's face with its family or weight overridden (the `family` and
 * `weight` props of <Text>, inline bold and code spans).
 */
export function variantFace(
  variant: TypeVariant,
  override: { family?: FontFamilyName; weight?: FontWeight },
  os: Os = Platform.OS,
): FontFace {
  const spec = os === Platform.OS ? typeSpec[variant] : typeSpecs(os)[variant];
  return fontFace(override.family ?? spec.family, override.weight ?? spec.weight, os);
}

/** A variant's own face (family and weight), for a TextInput that sets the rest itself. */
export function faceOf(variant: TypeVariant): FontFace {
  return { fontFamily: type[variant].fontFamily, fontWeight: type[variant].fontWeight };
}

/** Use wherever numbers are compared (tables, KPIs, money). */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
