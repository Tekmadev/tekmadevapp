import { infiniteQueryOptions } from '@tanstack/react-query';

import { api } from '../client';
import {
  zOrderPage,
  zSubscriptionPage,
  type OrderPage,
  type OrderStatus,
  type SubscriptionKind,
  type SubscriptionPage,
  type SubscriptionStatus,
} from '../schemas/billing';

/**
 * Typed endpoints and query keys for the "billing" domain (Subscriptions screen,
 * brief 8.8). Live mode only. Both lists carry the same `summary` for the
 * subtitle, so the screen can read it from whichever tab loaded first.
 */

export const BILLING_PAGE_SIZE = 30;

export type OrderListParams = { status?: OrderStatus | null; limit?: number };
export type SubscriptionListParams = { status?: SubscriptionStatus | null; kind?: SubscriptionKind | null; limit?: number };

export const billingKeys = {
  all: ['billing'] as const,
  orders: (params: OrderListParams = {}) =>
    ['billing', 'orders', { status: params.status ?? null, limit: params.limit ?? BILLING_PAGE_SIZE }] as const,
  subscriptions: (params: SubscriptionListParams = {}) =>
    ['billing', 'subscriptions', { status: params.status ?? null, kind: params.kind ?? null, limit: params.limit ?? BILLING_PAGE_SIZE }] as const,
};

/** GET /billing/orders?status=&cursor=: one-time orders, newest first. */
export function getOrders(params: OrderListParams & { cursor?: string | null } = {}, signal?: AbortSignal) {
  return api.get<OrderPage>('/billing/orders', {
    query: { status: params.status ?? undefined, cursor: params.cursor ?? undefined, limit: params.limit ?? BILLING_PAGE_SIZE },
    schema: zOrderPage,
    signal,
  });
}

/** GET /billing/subscriptions?status=&kind=plan|care&cursor=: newest first. */
export function getSubscriptions(params: SubscriptionListParams & { cursor?: string | null } = {}, signal?: AbortSignal) {
  return api.get<SubscriptionPage>('/billing/subscriptions', {
    query: {
      status: params.status ?? undefined,
      kind: params.kind ?? undefined,
      cursor: params.cursor ?? undefined,
      limit: params.limit ?? BILLING_PAGE_SIZE,
    },
    schema: zSubscriptionPage,
    signal,
  });
}

export function ordersInfiniteQuery(params: OrderListParams = {}) {
  return infiniteQueryOptions({
    queryKey: billingKeys.orders(params),
    queryFn: ({ pageParam, signal }) => getOrders({ ...params, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function subscriptionsInfiniteQuery(params: SubscriptionListParams = {}) {
  return infiniteQueryOptions({
    queryKey: billingKeys.subscriptions(params),
    queryFn: ({ pageParam, signal }) => getSubscriptions({ ...params, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
