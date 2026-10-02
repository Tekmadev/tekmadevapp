import { LOADER_DEFAULTS, LOADER_KEYS, LOADER_RANGES } from '@/loader/settings';

import {
  delayCaption,
  formatRatio,
  formatSeconds,
  isOriginal,
  LOADER_FIELDS,
  RESET_MESSAGE,
  RESET_TOAST,
  SAVED_TOAST,
  sameSettings,
  withValue,
} from '../logic';

describe('loader screen logic', () => {
  it('formats live values like the brief', () => {
    expect(formatSeconds(1600)).toBe('1.60s');
    expect(formatSeconds(300)).toBe('0.30s');
    expect(formatSeconds(1050)).toBe('1.05s');
    expect(formatRatio(0.72)).toBe('72%');
    expect(formatRatio(0.9)).toBe('90%');
  });

  it('has the six sliders of section 5, in order, with the section 5 ranges', () => {
    expect(LOADER_FIELDS.map((f) => f.key)).toEqual(LOADER_KEYS);
    for (const f of LOADER_FIELDS) {
      expect([f.min, f.max]).toEqual([...LOADER_RANGES[f.key]]);
      expect(f.help.length).toBeGreaterThan(0);
      // Whole steps from min reach max exactly.
      const steps = (f.max - f.min) / f.step;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
    }
  });

  it('compares drafts at the server precision', () => {
    const a = { ...LOADER_DEFAULTS };
    expect(sameSettings(a, { ...a })).toBe(true);
    expect(sameSettings(a, { ...a, innerPull: 0.72 + 1e-12 })).toBe(true);
    expect(sameSettings(a, withValue(a, 'innerPull', 0.71))).toBe(false);
    expect(sameSettings(a, withValue(a, 'beatMs', 1650))).toBe(false);
  });

  it('knows the original settings', () => {
    expect(isOriginal(LOADER_DEFAULTS)).toBe(true);
    expect(isOriginal(withValue(LOADER_DEFAULTS, 'showAfterMs', 0))).toBe(false);
  });

  it('withValue does not touch the source', () => {
    const a = { ...LOADER_DEFAULTS };
    const b = withValue(a, 'outerPull', 0.8);
    expect(a.outerPull).toBe(0.9);
    expect(b.outerPull).toBe(0.8);
  });

  it('captions the delay demo', () => {
    expect(delayCaption(300)).toBe('Hidden for 0.30s, then fades in.');
    expect(delayCaption(0)).toBe('No delay: it shows at once, then fades in.');
  });

  it('uses the brief copy word for word', () => {
    expect(SAVED_TOAST).toBe('Saved. Every page on the site now uses these settings.');
    expect(RESET_TOAST).toBe('Back to the original settings, live on every page.');
    expect(RESET_MESSAGE).toBe('Put the loader back to the original settings on every page?');
  });
});
