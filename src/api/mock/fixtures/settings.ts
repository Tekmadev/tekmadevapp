/** Fixtures for the "settings" domain (loader settings). */

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture = {};

export const LOADER_DEFAULTS_SERVER = {
  beatMs: 1600,
  buttonBeatMs: 1100,
  innerPull: 0.72,
  outerPull: 0.9,
  innerFade: 0.7,
  showAfterMs: 300,
};

export type ServerLoaderSettings = typeof LOADER_DEFAULTS_SERVER;
export type LoaderKey = keyof ServerLoaderSettings;

/**
 * The server's own copy of the section 5 ranges (it does not trust the app).
 * `decimals` is how finely each value is stored: whole milliseconds, two decimals for ratios.
 */
export const LOADER_RANGES_SERVER: Record<LoaderKey, { min: number; max: number; decimals: number }> = {
  beatMs: { min: 800, max: 3000, decimals: 0 },
  buttonBeatMs: { min: 600, max: 2000, decimals: 0 },
  innerPull: { min: 0.5, max: 1, decimals: 2 },
  outerPull: { min: 0.75, max: 1, decimals: 2 },
  innerFade: { min: 0.2, max: 1, decimals: 2 },
  showAfterMs: { min: 0, max: 1500, decimals: 0 },
};

export const LOADER_KEYS_SERVER = Object.keys(LOADER_DEFAULTS_SERVER) as LoaderKey[];

/** Saving `beatMs` of exactly this value makes the fake database fail (code `db`), so the error state can be seen. */
export const LOADER_DB_FAIL_BEAT_MS = 2999;

/**
 * Mutable loader settings shared by GET /me (`loader`) and GET/PUT /settings/loader,
 * so saving in the Loader screen changes what /me returns, like the real server.
 */
export const loaderState: { current: ServerLoaderSettings } = {
  current: { ...LOADER_DEFAULTS_SERVER },
};
