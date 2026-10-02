import { router, useLocalSearchParams } from 'expo-router';

import { BillingSegment } from '@/modules/subscriptions/BillingSegment';
import { toBillingTab, type BillingTab } from '@/modules/subscriptions/logic';

import type { SegmentProps } from './types';

const setTab = (sub: BillingTab) => router.setParams({ sub });

/**
 * The Subscriptions segment (brief 8.8), wired to the Customers route: the inner
 * One-time orders / Subscriptions switch lives in the param `sub`
 * (`/customers?segment=subscriptions&sub=orders`), default subscriptions, so
 * Home's "View all", the Active subs card and /admin/subscriptions land on it.
 */
export function SubscriptionsSegment({ chrome }: SegmentProps) {
  const { sub } = useLocalSearchParams<{ sub?: string }>();
  return <BillingSegment chrome={chrome} tab={toBillingTab(sub)} onTabChange={setTab} />;
}
