import { queryOptions } from '@tanstack/react-query';

import { api } from '../client';
import { DEFAULT_ADS_RANGE, zAdsRefreshResult, zAdsReport, type AdsRange, type AdsRefreshResult, type AdsReport } from '../schemas/ads';

/**
 * Typed endpoints and query keys for the "ads" domain (owner only, brief 8.10).
 * A manager gets 403 from the server; the module is hidden for them anyway.
 */

export const adsKeys = {
  all: ['ads'] as const,
  range: (range: AdsRange) => ['ads', range] as const,
};

/** GET /ads?range=: Meta's numbers, the site's outcomes, per-day series, campaigns and ads. */
export function getAds(range: AdsRange = DEFAULT_ADS_RANGE, signal?: AbortSignal) {
  return api.get<AdsReport>('/ads', { query: { range }, schema: zAdsReport, signal });
}

/**
 * POST /ads/refresh: a long server job (up to 2 minutes) that pulls fresh rows
 * from Meta. On success invalidate `adsKeys.all`; a failure is a 502 `upstream`
 * whose message is ready for the toast (the inbox gets the full reason).
 */
export function refreshAds(signal?: AbortSignal) {
  return api.post<AdsRefreshResult>('/ads/refresh', {}, { schema: zAdsRefreshResult, timeout: 'long', signal });
}

export function adsQuery(range: AdsRange = DEFAULT_ADS_RANGE) {
  return queryOptions({
    queryKey: adsKeys.range(range),
    queryFn: ({ signal }) => getAds(range, signal),
  });
}
