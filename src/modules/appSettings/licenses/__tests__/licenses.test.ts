import {
  entryA11yLabel,
  entrySubtitle,
  entryTexts,
  licenseData,
  licenseRows,
  platformLabel,
  type LicenseEntry,
} from '../data';

const { packages, texts, counts } = licenseData;

describe('licenses.json', () => {
  it('loads, with the counts it reports', () => {
    expect(packages.length).toBeGreaterThan(500);
    expect(texts.length).toBeGreaterThan(0);
    expect(counts.npm + counts.native + counts.fonts).toBe(packages.length);
    expect(packages.filter((p) => p.kind === 'npm')).toHaveLength(counts.npm);
  });

  it('gives every package a name and a license name', () => {
    for (const p of packages) {
      expect({ name: p.name, ok: p.name.trim().length > 0 }).toEqual({ name: p.name, ok: true });
      expect({ name: p.name, license: p.license.trim().length > 0 && p.license !== 'UNKNOWN' }).toEqual({
        name: p.name,
        license: true,
      });
    }
  });

  it('points every package at one or more real license texts', () => {
    for (const p of packages) {
      const valid = p.texts.length > 0 && p.texts.every((i) => Number.isInteger(i) && i >= 0 && i < texts.length);
      expect({ name: p.name, valid }).toEqual({ name: p.name, valid: true });
    }
  });

  it('has no empty text, and every text is used', () => {
    for (const text of texts) expect(text.trim().length).toBeGreaterThan(0);
    const used = new Set(packages.flatMap((p) => p.texts));
    expect(used.size).toBe(texts.length);
  });

  it('stores each text once', () => {
    const keys = texts.map((t) => t.replace(/\s+/g, ' ').trim());
    expect(new Set(keys).size).toBe(texts.length);
  });

  it('lists the Geist fonts with the SIL Open Font License', () => {
    for (const name of ['Geist', 'Geist Mono']) {
      const font = packages.find((p) => p.name === name && p.kind === 'font');
      expect(font?.license).toBe('OFL-1.1');
      expect(font?.by).toBe('Vercel');
      expect(entryTexts(font as LicenseEntry).join('\n')).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
  });

  it('lists the native libraries react-native always ships', () => {
    const hermes = packages.find((p) => p.name === 'Hermes');
    expect(hermes).toMatchObject({ kind: 'native', license: 'MIT', platforms: ['android', 'ios'] });
    expect(packages.find((p) => p.name === 'react-native' && p.kind === 'npm')?.license).toBe('MIT');
  });

  it('leaves dev-only packages out', () => {
    for (const name of ['jest', 'eslint', '@types/jest']) {
      expect(packages.find((p) => p.name === name && p.kind === 'npm')).toBeUndefined();
    }
  });

  it('holds no long or medium dashes (house rule)', () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
    expect(texts.some((t) => dashes.test(t))).toBe(false);
    expect(packages.some((p) => dashes.test(JSON.stringify(p)))).toBe(false);
  });
});

describe('licenseRows', () => {
  const rows = licenseRows();

  it('puts native libraries and fonts first, then the npm packages, under two headings', () => {
    const headers = rows.filter((r) => r.type === 'header');
    expect(headers.map((h) => h.title)).toEqual(['Native libraries and fonts', 'JavaScript packages']);
    expect(headers.map((h) => h.count)).toEqual([counts.native + counts.fonts, counts.npm]);
    expect(rows).toHaveLength(packages.length + 2);
    expect(rows[0]?.type).toBe('header');
  });

  it('gives every row a unique key', () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe('row copy', () => {
  const okhttp: LicenseEntry = { name: 'OkHttp', version: '4.9.2', license: 'Apache-2.0', kind: 'native', platforms: ['android'], texts: [0] };

  it('formats the line under a name', () => {
    expect(entrySubtitle(okhttp)).toBe('4.9.2 · Apache-2.0 · Android');
    expect(entrySubtitle({ name: 'zod', version: '4.6.5', license: 'MIT', kind: 'npm', texts: [0] })).toBe('4.6.5 · MIT');
    expect(entrySubtitle({ name: 'Geist', version: 'v5', license: 'OFL-1.1', kind: 'font', texts: [0] })).toBe('v5 · OFL-1.1 · Font');
  });

  it('names the platforms', () => {
    expect(platformLabel(['android', 'ios'])).toBe('Android and iOS');
    expect(platformLabel(['ios'])).toBe('iOS');
    expect(platformLabel(undefined)).toBeNull();
  });

  it('reads a row out without symbols', () => {
    expect(entryA11yLabel(okhttp)).toBe('OkHttp, version 4.9.2, Apache-2.0, Android');
  });
});
