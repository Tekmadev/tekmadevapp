import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { newIdempotencyKey } from '@/api/client';
import { emailKeys } from '@/api/endpoints/email';
import type { Campaign, EmailOverview, Subscriber, SubscriberPage } from '@/api/schemas/email';

import { withCampaign } from './logic';

/**
 * Cache helpers for the Email screens: apply the entity a write returned, then
 * refresh what the web admin would refresh after that write (the Email page:
 * KPIs, campaigns, recent engagement; and the subscriber lists).
 */

/** Apply a change to the cached GET /email/overview (no-op when it is not cached). */
export function updateOverview(queryClient: QueryClient, change: (overview: EmailOverview) => EmailOverview) {
  queryClient.setQueryData<EmailOverview>(emailKeys.overview(), (old) => (old ? change(old) : old));
}

/** A created or updated campaign, in place (new ones on top, like the server sorts them). */
export function putCampaign(queryClient: QueryClient, campaign: Campaign) {
  updateOverview(queryClient, (o) => ({ ...o, campaigns: withCampaign(o.campaigns, campaign) }));
  void queryClient.invalidateQueries({ queryKey: emailKeys.overview() });
}

export function dropCampaign(queryClient: QueryClient, id: string) {
  updateOverview(queryClient, (o) => ({ ...o, campaigns: o.campaigns.filter((c) => c.id !== id) }));
  void queryClient.invalidateQueries({ queryKey: emailKeys.overview() });
}

type SubscriberPages = InfiniteData<SubscriberPage, string | null>;

/** Patch one subscriber in every cached list (search and status filters included). */
function mapCachedLists(queryClient: QueryClient, change: (items: Subscriber[]) => Subscriber[]) {
  queryClient.setQueriesData<SubscriberPages>({ queryKey: emailKeys.subscriberLists() }, (old) =>
    old ? { ...old, pages: old.pages.map((p) => ({ ...p, items: change(p.items) })) } : old,
  );
}

/**
 * After an unsubscribe: the row shows its new status at once, then the lists
 * (a status filter may drop it) and the KPIs (active count) refetch.
 */
export function afterUnsubscribe(queryClient: QueryClient, subscriber: Subscriber) {
  mapCachedLists(queryClient, (items) => items.map((s) => (s.id === subscriber.id ? subscriber : s)));
  void queryClient.invalidateQueries({ queryKey: emailKeys.subscriberLists() });
  void queryClient.invalidateQueries({ queryKey: emailKeys.overview() });
}

/** After an erasure: the row leaves every list at once, the detail is forgotten, lists and KPIs refetch. */
export function afterErase(queryClient: QueryClient, id: string) {
  mapCachedLists(queryClient, (items) => items.filter((s) => s.id !== id));
  queryClient.removeQueries({ queryKey: emailKeys.subscriber(id), exact: true });
  void queryClient.invalidateQueries({ queryKey: emailKeys.subscriberLists() });
  void queryClient.invalidateQueries({ queryKey: emailKeys.overview() });
}

/** The subscriber from any cached list, so a detail opened from a row has its header at once. */
export function cachedSubscriber(queryClient: QueryClient, id: string): Subscriber | undefined {
  for (const [, data] of queryClient.getQueriesData<SubscriberPages>({ queryKey: emailKeys.subscriberLists() })) {
    for (const page of data?.pages ?? []) {
      const hit = page.items.find((s) => s.id === id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * One Idempotency-Key per intent. The same payload sent again (a retry after a
 * timeout or a lost connection) reuses the key, so the server answers with the
 * first result instead of creating a duplicate; a changed payload is a new intent.
 */
export function useIntentKey(): (payload: unknown) => string {
  const [intent, setIntent] = useState<{ payload: string; key: string } | null>(null);
  return (payload: unknown) => {
    const text = JSON.stringify(payload);
    const key = intent && intent.payload === text ? intent.key : newIdempotencyKey();
    setIntent({ payload: text, key });
    return key;
  };
}
