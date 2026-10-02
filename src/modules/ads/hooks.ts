import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { adsKeys, adsQuery, refreshAds } from '@/api/endpoints/ads';
import { notificationKeys } from '@/api/endpoints/notifications';
import { sessionKeys } from '@/api/endpoints/session';
import type { AdsReport } from '@/api/schemas/ads';
import { useJobRunner } from '@/components/automation/useJobRunner';
import { layout, space } from '@/design/tokens';
import { notice } from '@/lib/notice';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';

import { gridColumns, isMetaRefusal, pulledMessage, pullFailureMessage } from './logic';
import { useAdsRange } from './rangeStore';

/**
 * GET /ads for the shared range. Switching ranges keeps the previous range on
 * screen (dimmed, with the gold hairline) until the new one lands, so nothing
 * jumps. Refetches on screen focus; app resume is TanStack's focus manager.
 */
export function useAdsReport() {
  const range = useAdsRange((s) => s.range);
  const query = useQuery({ ...adsQuery(range), placeholderData: keepPreviousData });
  useRefreshOnFocus([adsKeys.all, sessionKeys.meta]);
  return { range, query };
}

/**
 * A campaign's name from whichever Ads range is already in the cache, so the drill-down
 * has its title at once, even for a range in which the campaign spent nothing.
 */
export function cachedCampaignName(queryClient: QueryClient, campaignId: string): string | undefined {
  for (const [, report] of queryClient.getQueriesData<AdsReport>({ queryKey: adsKeys.all })) {
    if (!report?.connected) continue;
    const found = report.campaigns.find((c) => c.id === campaignId);
    if (found) return found.name;
  }
  return undefined;
}

export type MetaPull = {
  /** True from the tap until the refetch after the job has landed. */
  running: boolean;
  startedAt: number | null;
  start: () => Promise<void>;
};

/**
 * "Refresh from Meta": POST /ads/refresh as a long job (120s timeout, never
 * retried). One at a time; leaving the screen stops waiting (the server's
 * job keeps going and the screen refetches when it opens again).
 *
 * Success toasts "Pulled {n} ad-day rows from Meta."; a refusal toasts the
 * brief's message with a way into the Inbox, where the reason is. Either way
 * every Ads range is refetched (the sync line and the numbers changed), and a
 * refusal also refreshes the bell, since the server bumped its inbox row.
 */
export function useMetaPull(): MetaPull {
  const queryClient = useQueryClient();
  const job = useJobRunner((signal) => refreshAds(signal));
  const [settling, setSettling] = useState(false);
  const startJob = job.start;

  const start = async () => {
    const outcome = await startJob();
    if (outcome.status === 'busy' || outcome.status === 'cancelled') return;

    let refused = false;
    if (outcome.status === 'done') {
      notice.ok(pulledMessage(outcome.result.rowsUpserted));
    } else {
      refused = isMetaRefusal(outcome.error);
      const message = pullFailureMessage(outcome.error, outcome.timedOut);
      if (message) {
        notice.err(message, refused ? { action: { label: 'Open Inbox', onPress: () => router.push('/inbox') } } : undefined);
      }
    }

    setSettling(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adsKeys.all }),
        // The bell and the Inbox rows: "Open Inbox" must show the bumped "Meta pull failed" row, not a list cached a moment ago.
        refused ? queryClient.invalidateQueries({ queryKey: notificationKeys.summary() }) : null,
        refused ? queryClient.invalidateQueries({ queryKey: notificationKeys.lists() }) : null,
      ]);
    } finally {
      setSettling(false);
    }
  };

  return { running: job.running || settling, startedAt: job.startedAt, start };
}

/* ---------- layout ---------- */

/** Screen gutters (2 x 16), card borders (2 x 1) and card padding (2 x 16): what a card's content loses. */
const CARD_CHROME = layout.gutter * 2 + 2 + space[4] * 2;

/**
 * Columns for the KPI panels: two, or one when the widest figure (exact money
 * included) would not fit half the card at this width and font scale.
 */
export function useKpiColumns(texts: readonly string[]): number {
  const { width, fontScale } = useWindowDimensions();
  // `number` variant: Geist 800 at 28sp, -4% tracking.
  return gridColumns({ width: width - CARD_CHROME, fontScale, texts, fontSize: 28, tracking: -0.04, gap: space[4], max: 2 });
}

/** Columns for the campaign and ad cards' metric grid: three, fewer when a value would not fit whole. */
export function useMetricColumns(texts: readonly string[]): number {
  const { width, fontScale } = useWindowDimensions();
  // `title` variant: Geist 600 at 17sp, -1% tracking.
  return gridColumns({ width: width - CARD_CHROME, fontScale, texts, fontSize: 17, tracking: -0.01, gap: space[3], max: 3 });
}
