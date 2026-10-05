import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  availableWeight,
  buildTypeScale,
  displayLine,
  faceOf,
  fontFace,
  iosFaceName,
  numericWeight,
  tracking,
  type,
  typeSpecs,
  variantFace,
  type FontWeight,
  type TypeStyle,
  type TypeVariant,
} from '../typography';

/** The PostScript name (name ID 6) of a TrueType file, read from its name table. */
function postScriptName(file: string): string {
  const data = readFileSync(file);
  const tables = data.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const at = 12 + i * 16;
    if (data.toString('latin1', at, at + 4) !== 'name') continue;
    const name = data.readUInt32BE(at + 8);
    const count = data.readUInt16BE(name + 2);
    const strings = name + data.readUInt16BE(name + 4);
    for (let r = 0; r < count; r++) {
      const rec = name + 6 + r * 12;
      if (data.readUInt16BE(rec + 6) !== 6) continue;
      const platform = data.readUInt16BE(rec);
      const length = data.readUInt16BE(rec + 8);
      const offset = strings + data.readUInt16BE(rec + 10);
      const bytes = data.subarray(offset, offset + length);
      if (platform === 3) return Buffer.from(bytes).swap16().toString('utf16le');
      return bytes.toString('latin1');
    }
  }
  throw new Error(`No PostScript name in ${file}`);
}

const FONT_DIR = join(__dirname, '../../../assets/fonts');
const EMBEDDED = readdirSync(FONT_DIR)
  .filter((f) => f.endsWith('.ttf'))
  .map((f) => postScriptName(join(FONT_DIR, f)))
  .sort();

describe('numericWeight', () => {
  it('reads numbers, numeric strings and named weights', () => {
    expect(numericWeight(600)).toBe(600);
    expect(numericWeight('800')).toBe(800);
    expect(numericWeight('normal')).toBe(400);
    expect(numericWeight('regular')).toBe(400);
    expect(numericWeight('bold')).toBe(700);
    expect(numericWeight('medium')).toBe(500);
    expect(numericWeight('semibold')).toBe(600);
    expect(numericWeight('heavy')).toBe(800);
    expect(numericWeight('black')).toBe(900);
    expect(numericWeight('thin')).toBe(200);
    expect(numericWeight('condensedBold')).toBe(700);
  });

  it('treats a missing weight as regular', () => {
    expect(numericWeight(undefined)).toBe(400);
  });
});

describe('availableWeight', () => {
  it('maps Geist below 400 to 400 and keeps 400 to 900', () => {
    expect(availableWeight('sans', '100')).toBe(400);
    expect(availableWeight('sans', 'light')).toBe(400);
    for (const w of [400, 500, 600, 700, 800, 900] as const) expect(availableWeight('sans', w)).toBe(w);
  });

  it('maps Geist Mono lighter to 400 and heavier to 500', () => {
    expect(availableWeight('mono', '300')).toBe(400);
    expect(availableWeight('mono', '400')).toBe(400);
    expect(availableWeight('mono', '500')).toBe(500);
    expect(availableWeight('mono', '600')).toBe(500);
    expect(availableWeight('mono', 'bold')).toBe(500);
    expect(availableWeight('mono', '900')).toBe(500);
  });
});

describe('iosFaceName', () => {
  it('names one PostScript face per Geist weight', () => {
    expect(iosFaceName('sans', '400')).toBe('Geist-Regular');
    expect(iosFaceName('sans', '500')).toBe('Geist-Medium');
    expect(iosFaceName('sans', '600')).toBe('Geist-SemiBold');
    expect(iosFaceName('sans', '700')).toBe('Geist-Bold');
    expect(iosFaceName('sans', '800')).toBe('Geist-ExtraBold');
    expect(iosFaceName('sans', '900')).toBe('Geist-Black');
    expect(iosFaceName('mono', '400')).toBe('GeistMono-Regular');
    expect(iosFaceName('mono', '500')).toBe('GeistMono-Medium');
  });

  it('only names faces that are embedded (the PostScript names in assets/fonts)', () => {
    const named = new Set<string>();
    for (const w of ['100', '400', '500', '600', '700', '800', '900'] as const) {
      named.add(iosFaceName('sans', w));
      named.add(iosFaceName('mono', w));
    }
    expect([...named].sort()).toEqual(EMBEDDED);
  });
});

describe('fontFace', () => {
  it('iOS: the PostScript face with the weight pinned to that face', () => {
    expect(fontFace('sans', '600', 'ios')).toEqual({ fontFamily: 'Geist-SemiBold', fontWeight: '600' });
    expect(fontFace('sans', 'bold', 'ios')).toEqual({ fontFamily: 'Geist-Bold', fontWeight: '700' });
    expect(fontFace('sans', 300, 'ios')).toEqual({ fontFamily: 'Geist-Regular', fontWeight: '400' });
    expect(fontFace('sans', undefined, 'ios')).toEqual({ fontFamily: 'Geist-Regular', fontWeight: '400' });
    expect(fontFace('mono', '700', 'ios')).toEqual({ fontFamily: 'GeistMono-Medium', fontWeight: '500' });
    expect(fontFace('mono', undefined, 'ios')).toEqual({ fontFamily: 'GeistMono-Regular', fontWeight: '400' });
  });

  it('Android: the XML family with the weight as given', () => {
    expect(fontFace('sans', '600', 'android')).toEqual({ fontFamily: 'Geist', fontWeight: '600' });
    expect(fontFace('mono', '700', 'android')).toEqual({ fontFamily: 'GeistMono', fontWeight: '700' });
    expect(fontFace('sans', 'bold', 'android')).toEqual({ fontFamily: 'Geist', fontWeight: 'bold' });
  });

  it('Android: no weight sets only the family (the weight is inherited, as before)', () => {
    expect(fontFace('mono', undefined, 'android')).toEqual({ fontFamily: 'GeistMono' });
  });
});

/** The Android type scale exactly as it was before the iOS work. */
function previousAndroidScale(): Record<TypeVariant, TypeStyle> {
  const display = (size: number): TypeStyle => ({
    fontFamily: 'Geist',
    fontWeight: '800',
    fontSize: size,
    lineHeight: Math.round(size * 1.16),
    letterSpacing: tracking(size, -4),
    fontVariant: ['tabular-nums'],
  });
  const headline = (size: number): TypeStyle => ({
    fontFamily: 'Geist',
    fontWeight: '700',
    fontSize: size,
    lineHeight: Math.round(size * 1.22),
    letterSpacing: tracking(size, -2.5),
  });
  return {
    largeTitle: display(34),
    kpi: display(40),
    kpiLarge: display(56),
    number: display(28),
    headline: headline(24),
    headlineSmall: headline(22),
    headlineLarge: headline(28),
    title: { fontFamily: 'Geist', fontWeight: '600', fontSize: 17, lineHeight: 22, letterSpacing: tracking(17, -1) },
    body: { fontFamily: 'Geist', fontWeight: '400', fontSize: 15, lineHeight: 22 },
    bodyStrong: { fontFamily: 'Geist', fontWeight: '600', fontSize: 15, lineHeight: 22 },
    editor: { fontFamily: 'Geist', fontWeight: '400', fontSize: 17, lineHeight: 28 },
    small: { fontFamily: 'Geist', fontWeight: '400', fontSize: 13, lineHeight: 18 },
    label: { fontFamily: 'Geist', fontWeight: '500', fontSize: 13, lineHeight: 18 },
    caption: { fontFamily: 'Geist', fontWeight: '500', fontSize: 11, lineHeight: 14 },
    button: { fontFamily: 'Geist', fontWeight: '600', fontSize: 15, lineHeight: 20 },
    eyebrow: {
      fontFamily: 'GeistMono',
      fontWeight: '500',
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: tracking(11, 18),
      textTransform: 'uppercase',
    },
    mono: { fontFamily: 'GeistMono', fontWeight: '400', fontSize: 13, lineHeight: 18 },
    monoLarge: { fontFamily: 'GeistMono', fontWeight: '500', fontSize: 17, lineHeight: 22 },
  };
}

describe('the type scale', () => {
  it('is unchanged on Android', () => {
    expect(buildTypeScale('android')).toEqual(previousAndroidScale());
  });

  it('uses an embedded PostScript face on iOS, with the weight of that face', () => {
    const ios = buildTypeScale('ios');
    const specs = typeSpecs('ios');
    for (const key of Object.keys(ios) as TypeVariant[]) {
      const style = ios[key];
      expect(EMBEDDED).toContain(style.fontFamily);
      expect(style.fontFamily).toBe(iosFaceName(specs[key].family, specs[key].weight));
      expect(style.fontWeight).toBe(`${availableWeight(specs[key].family, specs[key].weight)}`);
    }
    expect(ios.largeTitle.fontFamily).toBe('Geist-ExtraBold');
    expect(ios.title.fontFamily).toBe('Geist-SemiBold');
    expect(ios.eyebrow.fontFamily).toBe('GeistMono-Medium');
    expect(ios.mono.fontFamily).toBe('GeistMono-Regular');
  });

  it('keeps sizes and spacing the same on both platforms, except the display line', () => {
    const ios = buildTypeScale('ios');
    const android = buildTypeScale('android');
    for (const key of Object.keys(ios) as TypeVariant[]) {
      expect(ios[key].fontSize).toBe(android[key].fontSize);
      expect(ios[key].letterSpacing).toBe(android[key].letterSpacing);
      expect(ios[key].textTransform).toBe(android[key].textTransform);
    }
    expect(ios.body.lineHeight).toBe(android.body.lineHeight);
    expect(ios.headline.lineHeight).toBe(android.headline.lineHeight);
  });

  it('gives iOS display text a 1.22 line, so the top of accented capitals is not cut', () => {
    expect(displayLine('ios')).toBe(1.22);
    expect(displayLine('android')).toBe(1.16);
    expect(buildTypeScale('ios').largeTitle.lineHeight).toBe(Math.round(34 * 1.22));
    expect(buildTypeScale('ios').kpi.lineHeight).toBe(Math.round(40 * 1.22));
  });

  it('exports the scale of the platform it runs on (iOS under jest-expo)', () => {
    expect(type).toEqual(buildTypeScale('ios'));
    expect(faceOf('body')).toEqual({ fontFamily: 'Geist-Regular', fontWeight: '400' });
  });
});

describe('variantFace', () => {
  const cases: [TypeVariant, { family?: 'sans' | 'mono'; weight?: FontWeight }, object, object][] = [
    ['label', { weight: '600' }, { fontFamily: 'Geist-SemiBold', fontWeight: '600' }, { fontFamily: 'Geist', fontWeight: '600' }],
    ['caption', { weight: '700' }, { fontFamily: 'Geist-Bold', fontWeight: '700' }, { fontFamily: 'Geist', fontWeight: '700' }],
    // A code span takes the line's weight: body 400, a title heading 600 (Geist Mono stops at 500).
    ['body', { family: 'mono' }, { fontFamily: 'GeistMono-Regular', fontWeight: '400' }, { fontFamily: 'GeistMono', fontWeight: '400' }],
    ['title', { family: 'mono' }, { fontFamily: 'GeistMono-Medium', fontWeight: '500' }, { fontFamily: 'GeistMono', fontWeight: '600' }],
    ['editor', { family: 'mono', weight: '700' }, { fontFamily: 'GeistMono-Medium', fontWeight: '500' }, { fontFamily: 'GeistMono', fontWeight: '700' }],
    ['eyebrow', { family: 'sans' }, { fontFamily: 'Geist-Medium', fontWeight: '500' }, { fontFamily: 'Geist', fontWeight: '500' }],
  ];

  it.each(cases)('%s with %j', (variant, override, ios, android) => {
    expect(variantFace(variant, override, 'ios')).toEqual(ios);
    expect(variantFace(variant, override, 'android')).toEqual(android);
  });
});
