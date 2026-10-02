import { create } from 'zustand';

import { DEFAULT_ADS_RANGE, type AdsRange } from '@/api/schemas/ads';

/**
 * The Ads range chip, shared by the Ads screen and the campaign drill-down so
 * both always show the same period. Kept for the session (in memory): the app
 * opens on the brief's default, 30d.
 */
export const useAdsRange = create<{ range: AdsRange }>()(() => ({ range: DEFAULT_ADS_RANGE }));

export function setAdsRange(range: AdsRange) {
  useAdsRange.setState({ range });
}
