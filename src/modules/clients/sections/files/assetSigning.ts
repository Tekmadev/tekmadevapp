import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { signAsset } from '@/api/endpoints/clients';
import type { Asset, SignedAsset } from '@/api/schemas/clients';
import { toDate } from '@/lib/dates';

import { patchBundle } from './shared';

/**
 * File URLs are signed and expire. Before a file is shown or opened, an expired
 * URL is swapped for a fresh one (POST /assets/:id/sign) and the cached bundle
 * is patched, so every other view of that file uses the fresh URL too.
 */

/** Treat a URL as expired a little early, so it never runs out mid-download. */
export const EXPIRY_MARGIN_MS = 30_000;

export function isExpired(expiresAt: string, now: number = Date.now()): boolean {
  const at = toDate(expiresAt);
  return !at || at.getTime() - EXPIRY_MARGIN_MS <= now;
}

/** Signed URLs live in memory only (never persisted: they expire). */
export const assetSignKey = (assetId: string) => ['clients', 'asset-sign', assetId] as const;

async function signAndPatch(queryClient: QueryClient, clientId: string, assetId: string): Promise<SignedAsset> {
  const signed = await signAsset(assetId);
  patchBundle(queryClient, clientId, (bundle) => ({
    ...bundle,
    assets: bundle.assets.map((a) => (a.id === assetId ? { ...a, url: signed.url, thumbnailUrl: signed.thumbnailUrl, expiresAt: signed.expiresAt } : a)),
  }));
  return signed;
}

/** A fresh signature for one file: reused until it is about to expire. */
export function signedAssetQuery(queryClient: QueryClient, clientId: string, assetId: string) {
  return queryOptions({
    queryKey: assetSignKey(assetId),
    queryFn: () => signAndPatch(queryClient, clientId, assetId),
    staleTime: (query) => {
      const at = query.state.data ? toDate(query.state.data.expiresAt) : null;
      return at ? Math.max(0, at.getTime() - EXPIRY_MARGIN_MS - Date.now()) : 0;
    },
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    meta: { persist: false },
  });
}

/** The URL to open right now: the cached one while valid, otherwise a fresh signature. */
export async function freshAssetUrl(queryClient: QueryClient, clientId: string, asset: Asset): Promise<string> {
  if (!isExpired(asset.expiresAt)) return asset.url;
  const signed = await queryClient.fetchQuery({ ...signedAssetQuery(queryClient, clientId, asset.id), staleTime: 0 });
  return signed.url;
}
