import { clampLoaderSettings, LOADER_DEFAULTS, LOADER_KEYS, LOADER_RANGES } from '@/loader/settings';

// settings.ts caches values in MMKV. The MMKV package swaps in its own in-memory
// store under Jest, but it still imports the native Nitro bridge first, so stub that.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: () => {
      throw new Error('Nitro is not available in tests');
    },
  },
}));

/** The table in brief section 5, written out again so a typo in settings.ts fails here. */
const BRIEF = {
  beatMs: { def: 1600, min: 800, max: 3000 },
  buttonBeatMs: { def: 1100, min: 600, max: 2000 },
  innerPull: { def: 0.72, min: 0.5, max: 1 },
  outerPull: { def: 0.9, min: 0.75, max: 1 },
  innerFade: { def: 0.7, min: 0.2, max: 1 },
  showAfterMs: { def: 300, min: 0, max: 1500 },
} as const;

describe('loader settings table', () => {
  it('matches the brief defaults and ranges', () => {
    expect([...LOADER_KEYS].sort()).toEqual(Object.keys(BRIEF).sort());
    for (const key of LOADER_KEYS) {
      expect(LOADER_DEFAULTS[key]).toBe(BRIEF[key].def);
      expect(LOADER_RANGES[key]).toEqual([BRIEF[key].min, BRIEF[key].max]);
    }
  });
});

describe('clampLoaderSettings', () => {
  it('falls back to the defaults for missing or non-object input', () => {
    for (const raw of [undefined, null, 'fast', 42, true, [], {}]) {
      expect(clampLoaderSettings(raw)).toEqual(LOADER_DEFAULTS);
    }
  });

  it('keeps in-range values as they are', () => {
    const tuned = { beatMs: 2000, buttonBeatMs: 900, innerPull: 0.6, outerPull: 0.8, innerFade: 0.5, showAfterMs: 0 };
    expect(clampLoaderSettings(tuned)).toEqual(tuned);
  });

  it('keeps the exact range ends', () => {
    const low = Object.fromEntries(LOADER_KEYS.map((k) => [k, BRIEF[k].min]));
    const high = Object.fromEntries(LOADER_KEYS.map((k) => [k, BRIEF[k].max]));
    expect(clampLoaderSettings(low)).toEqual(low);
    expect(clampLoaderSettings(high)).toEqual(high);
  });

  it('clamps values below the range to the minimum', () => {
    const out = clampLoaderSettings({ beatMs: 100, buttonBeatMs: -5, innerPull: 0, outerPull: 0.1, innerFade: -1, showAfterMs: -300 });
    for (const key of LOADER_KEYS) expect(out[key]).toBe(BRIEF[key].min);
  });

  it('clamps values above the range to the maximum', () => {
    const out = clampLoaderSettings({ beatMs: 99_999, buttonBeatMs: 5000, innerPull: 1.4, outerPull: 2, innerFade: 7, showAfterMs: 10_000 });
    for (const key of LOADER_KEYS) expect(out[key]).toBe(BRIEF[key].max);
  });

  it('replaces non-numbers with the default, key by key', () => {
    const out = clampLoaderSettings({
      beatMs: '1200',
      buttonBeatMs: null,
      innerPull: NaN,
      outerPull: Infinity,
      innerFade: -Infinity,
      showAfterMs: { value: 500 },
    });
    expect(out).toEqual(LOADER_DEFAULTS);
  });

  it('mixes valid, invalid and missing keys', () => {
    expect(clampLoaderSettings({ beatMs: 2400, innerPull: 'hard', showAfterMs: 5000 })).toEqual({
      ...LOADER_DEFAULTS,
      beatMs: 2400,
      showAfterMs: 1500,
    });
  });

  it('drops keys it does not know', () => {
    const out = clampLoaderSettings({ beatMs: 1700, colour: 'gold', speed: 3 });
    expect(Object.keys(out).sort()).toEqual([...LOADER_KEYS].sort());
    expect(out).toEqual({ ...LOADER_DEFAULTS, beatMs: 1700 });
  });

  it('returns a fresh object and never changes the defaults', () => {
    const before = { ...LOADER_DEFAULTS };
    const out = clampLoaderSettings({ beatMs: 900 });
    out.innerFade = 0.3;
    expect(LOADER_DEFAULTS).toEqual(before);
    expect(clampLoaderSettings(undefined)).not.toBe(LOADER_DEFAULTS);
  });
});
