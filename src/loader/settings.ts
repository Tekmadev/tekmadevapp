import { create } from 'zustand';

import type { LoaderSettings } from '@/api/schemas/session';
import { readJSON, storage, StorageKeys, writeJSON } from '@/lib/storage';

/**
 * Loader settings from GET /me (`loader`), tuned by the owner in Admin, Loader.
 * Anything out of range is clamped to the range; non-numbers become the default.
 */

export const LOADER_DEFAULTS: LoaderSettings = {
  beatMs: 1600,
  buttonBeatMs: 1100,
  innerPull: 0.72,
  outerPull: 0.9,
  innerFade: 0.7,
  showAfterMs: 300,
};

export const LOADER_RANGES: Record<keyof LoaderSettings, readonly [number, number]> = {
  beatMs: [800, 3000],
  buttonBeatMs: [600, 2000],
  innerPull: [0.5, 1],
  outerPull: [0.75, 1],
  innerFade: [0.2, 1],
  showAfterMs: [0, 1500],
};

export const LOADER_KEYS = Object.keys(LOADER_DEFAULTS) as (keyof LoaderSettings)[];

export function clampLoaderSettings(raw: unknown): LoaderSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...LOADER_DEFAULTS };
  for (const key of LOADER_KEYS) {
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const [min, max] = LOADER_RANGES[key];
    out[key] = Math.min(max, Math.max(min, value));
  }
  return out;
}

type LoaderStore = {
  settings: LoaderSettings;
  /** Apply values from the server (clamped) and cache them for the next cold start. */
  apply: (raw: unknown) => void;
  /** Live preview while the owner drags sliders (not persisted). */
  preview: (settings: LoaderSettings | null) => void;
  previewing: LoaderSettings | null;
};

export const useLoaderStore = create<LoaderStore>()((set) => ({
  settings: clampLoaderSettings(readJSON(storage, StorageKeys.loaderSettings)),
  previewing: null,
  apply: (raw) => {
    const settings = clampLoaderSettings(raw);
    writeJSON(storage, StorageKeys.loaderSettings, settings);
    set({ settings });
  },
  preview: (previewing) => set({ previewing }),
}));

/** The settings every loader should use right now (a live preview wins). */
export function useLoaderSettings(): LoaderSettings {
  return useLoaderStore((s) => s.previewing ?? s.settings);
}
