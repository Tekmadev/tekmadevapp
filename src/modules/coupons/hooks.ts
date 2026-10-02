import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { newIdempotencyKey } from '@/api/client';
import { couponKeys } from '@/api/endpoints/coupons';
import type { Coupon } from '@/api/schemas/coupons';

import { upsertCoupon } from './logic';

/**
 * Coupons live in Stripe, so nothing here is optimistic: the coupon the
 * server returns goes into the cached list, then the list is refetched (what
 * the web admin reloads after a create or a disable).
 */
export function useCouponsCache() {
  const queryClient = useQueryClient();
  return (coupon: Coupon) => {
    queryClient.setQueryData<Coupon[]>(couponKeys.list(), (old) => (old ? upsertCoupon(old, coupon) : old));
    void queryClient.invalidateQueries({ queryKey: couponKeys.all });
  };
}

/**
 * One Idempotency-Key per intent, kept in state. Sending the same payload
 * again (a retry after a timeout or a lost connection) reuses the key, so the
 * server answers with the first coupon instead of creating a second one; a
 * changed payload is a new intent with a new key.
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
