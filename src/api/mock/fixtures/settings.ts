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

/**
 * Mutable loader settings shared by GET /me (`loader`) and GET/PUT /settings/loader,
 * so saving in the Loader screen changes what /me returns, like the real server.
 */
export const loaderState: { current: typeof LOADER_DEFAULTS_SERVER } = {
  current: { ...LOADER_DEFAULTS_SERVER },
};
