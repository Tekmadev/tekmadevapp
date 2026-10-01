import { z } from 'zod';

import { zRole } from '../types';

/** Loader tuning, set by the owner in Admin, Loader (section 5). Clamp before use. */
export const zLoaderSettings = z.object({
  beatMs: z.number(),
  buttonBeatMs: z.number(),
  innerPull: z.number(),
  outerPull: z.number(),
  innerFade: z.number(),
  showAfterMs: z.number(),
});
export type LoaderSettings = z.infer<typeof zLoaderSettings>;

export const zMe = z.object({
  user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable() }),
  role: zRole,
  /** Server feature flags; a module with `feature` stays hidden until listed here. */
  features: z.array(z.string()),
  timezone: z.literal('America/Toronto'),
  /** Raw values from the server; the app clamps them (src/loader/settings.ts). */
  loader: z.object({
    beatMs: z.unknown(),
    buttonBeatMs: z.unknown(),
    innerPull: z.unknown(),
    outerPull: z.unknown(),
    innerFade: z.unknown(),
    showAfterMs: z.unknown(),
  }).partial(),
  testModeConfigured: z.boolean(),
  app: z.object({ latestVersion: z.string(), minVersion: z.string(), apkUrl: z.string().nullable() }),
});
export type Me = z.infer<typeof zMe>;

export const zSearchResultType = z.enum(['client', 'lead', 'subscriber', 'post', 'coupon', 'link']);
export type SearchResultType = z.infer<typeof zSearchResultType>;
export const zSearchResults = z.object({
  results: z.array(
    z.object({
      type: zSearchResultType,
      id: z.string(),
      title: z.string(),
      subtitle: z.string(),
      /** A web admin path (starts with /admin), mapped with src/lib/deeplinks.ts. */
      url: z.string(),
    }),
  ),
});
export type SearchResults = z.infer<typeof zSearchResults>;
export type SearchResult = SearchResults['results'][number];

export const zDeviceRegistration = z.object({ id: z.string() });

export const zProfileUpdate = z.object({ name: z.string().nullable() });
