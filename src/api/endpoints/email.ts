import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { api, seg } from '../client';
import {
  zCampaign,
  zEmailOverview,
  zEmailTemplates,
  zSubscriberDetail,
  zSubscriberPage,
  type Campaign,
  type CampaignCreate,
  type EmailMeta,
  type EmailOverview,
  type EmailTemplate,
  type SubscriberDetail,
  type SubscriberPage,
  type SubscriberStatus,
} from '../schemas/email';
import type { Meta } from '../schemas/meta';
import { getMeta, sessionKeys } from './session';

/**
 * Typed endpoints and query keys for the "email" domain (owner only): the
 * overview (KPIs, campaigns, recent engagement), templates, and subscribers.
 *
 * This app never sends email. Nothing here is optimistic: unsubscribing and
 * erasing touch the CRM, so screens wait for the server, then invalidate
 * `emailKeys.overview()` and `emailKeys.subscriberLists()`.
 */

export const SUBSCRIBERS_PAGE_SIZE = 30;

export type SubscriberListParams = {
  /** Server search on the email address. */
  q?: string | null;
  status?: SubscriberStatus | null;
  limit?: number;
};

const listKeyParams = (params: SubscriberListParams) => ({
  q: params.q?.trim() || null,
  status: params.status ?? null,
  limit: params.limit ?? SUBSCRIBERS_PAGE_SIZE,
});

export const emailKeys = {
  all: ['email'] as const,
  overview: () => ['email', 'overview'] as const,
  templates: () => ['email', 'templates'] as const,
  subscribers: () => ['email', 'subscribers'] as const,
  subscriberLists: () => ['email', 'subscribers', 'list'] as const,
  subscriberList: (params: SubscriberListParams) => ['email', 'subscribers', 'list', listKeyParams(params)] as const,
  subscriber: (id: string) => ['email', 'subscribers', 'detail', id] as const,
};

/* ------------------------------------------------------------------ */
/* Overview and campaigns                                              */
/* ------------------------------------------------------------------ */

/** GET /email/overview: stats, campaigns (newest first) and the latest opens and clicks. */
export function getEmailOverview(signal?: AbortSignal) {
  return api.get<EmailOverview>('/email/overview', { schema: zEmailOverview, signal });
}

/**
 * POST /email/campaigns. The server lowercases the key. Errors: 400 `key`,
 * 400 `name` (with `fields` for both), 409 `dupe`.
 */
export function createCampaign(input: CampaignCreate, idempotencyKey: string) {
  return api.post<Campaign>('/email/campaigns', input, { schema: zCampaign, idempotencyKey });
}

/** PATCH /email/campaigns/:id: Pause / Resume (a label only; counting goes on). */
export function setCampaignActive(id: string, active: boolean) {
  return api.patch<Campaign>(`/email/campaigns/${seg(id)}`, { active }, { schema: zCampaign });
}

/** DELETE /email/campaigns/:id: counters reset if the key is added again; past events stay. */
export function deleteCampaign(id: string) {
  return api.delete<null>(`/email/campaigns/${seg(id)}`, { schema: z.null() });
}

/** GET /email/templates: ready-made emails with exact HTML (merge tags intact) and a preview. */
export function getEmailTemplates(signal?: AbortSignal) {
  return api.get<EmailTemplate[]>('/email/templates', { schema: zEmailTemplates, signal });
}

/* ------------------------------------------------------------------ */
/* Subscribers                                                         */
/* ------------------------------------------------------------------ */

/** GET /email/subscribers: newest signup first. */
export function getSubscribers(params: SubscriberListParams & { cursor?: string | null }, signal?: AbortSignal) {
  return api.get<SubscriberPage>('/email/subscribers', {
    query: {
      q: params.q?.trim() || undefined,
      status: params.status ?? undefined,
      // Passed back exactly as the server sent it.
      cursor: params.cursor ?? undefined,
      limit: params.limit ?? SUBSCRIBERS_PAGE_SIZE,
    },
    schema: zSubscriberPage,
    signal,
  });
}

/** GET /email/subscribers/:id: the subscriber and their consent history (newest first). */
export function getSubscriber(id: string, signal?: AbortSignal) {
  return api.get<SubscriberDetail>(`/email/subscribers/${seg(id)}`, { schema: zSubscriberDetail, signal });
}

/** POST /email/subscribers/:id/unsubscribe (active only, else 409 `not_active`). Returns the updated detail. */
export function unsubscribeSubscriber(id: string) {
  return api.post<SubscriberDetail>(`/email/subscribers/${seg(id)}/unsubscribe`, {}, { schema: zSubscriberDetail });
}

/**
 * DELETE /email/subscribers/:id: permanent erasure. Consent history is deleted
 * and the CRM contact is queued to be suppressed and tagged erased.
 * Fails with `crm_erase` (nothing deleted) when that cannot be queued.
 */
export function deleteSubscriber(id: string) {
  return api.delete<null>(`/email/subscribers/${seg(id)}`, { schema: z.null() });
}

/* ------------------------------------------------------------------ */
/* Query options                                                       */
/* ------------------------------------------------------------------ */

export function emailOverviewQuery() {
  return queryOptions({
    queryKey: emailKeys.overview(),
    queryFn: ({ signal }) => getEmailOverview(signal),
  });
}

export function emailTemplatesQuery() {
  return queryOptions({
    queryKey: emailKeys.templates(),
    queryFn: ({ signal }) => getEmailTemplates(signal),
    staleTime: 10 * 60_000,
  });
}

export function subscribersInfiniteQuery(params: SubscriberListParams) {
  return infiniteQueryOptions({
    queryKey: emailKeys.subscriberList(params),
    queryFn: ({ pageParam, signal }) => getSubscribers({ ...params, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * The email slice of GET /meta (subscriber statuses with tones, unsubscribe
 * reasons and sources, signup sources, consent events, campaign and engagement
 * badges). Shares the one ['meta'] cache entry with every other domain; the
 * labels change only with a server deploy, so it stays fresh for an hour.
 */
export function emailMetaQuery() {
  return queryOptions({
    queryKey: sessionKeys.meta,
    queryFn: ({ signal }) => getMeta(signal),
    staleTime: 60 * 60_000,
    select: (meta: Meta): EmailMeta => meta,
  });
}

export function subscriberQuery(id: string) {
  return queryOptions({
    queryKey: emailKeys.subscriber(id),
    queryFn: ({ signal }) => getSubscriber(id, signal),
  });
}
