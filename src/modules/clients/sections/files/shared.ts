import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { newIdempotencyKey } from '@/api/client';
import { clientKeys } from '@/api/endpoints/clients';
import { getMeta, sessionKeys } from '@/api/endpoints/session';
import { ApiError, fieldErrors } from '@/api/errors';
import type {
  AccessMethod,
  AccessProvider,
  AccessStatus,
  AgreementStatus,
  ApprovalKind,
  ApprovalStatus,
  AssetKind,
  ClientBundle,
  OnboardingStage,
  TaskStatus,
} from '@/api/schemas/clients';
import type { Meta } from '@/api/schemas/meta';
import { reportSubmitError } from '@/components/SubmitGroup';
import { haptics } from '@/design/haptics';
import type { Tone } from '@/design/tokens';

/**
 * Helpers shared by the Access, Files, Approvals and Agreements sections of
 * Client detail: GET /meta labels (with the contract's own labels as a fallback
 * while meta is still loading), bundle cache writes, and idempotency keys.
 */

/* ---------- GET /meta ---------- */

/** GET /meta, shared with every screen through its query key. Labels change rarely. */
export function useMeta(): Meta | undefined {
  return useQuery({
    queryKey: sessionKeys.meta,
    queryFn: ({ signal }) => getMeta(signal),
    staleTime: 60 * 60_000,
  }).data;
}

type Labeled<V extends string> = { value: V; label: string };
type Toned<V extends string> = { value: V; label: string; tone: Tone };

/** "pending_client" to "Pending client": only used when neither meta nor the fallback table knows a value. */
export function humanize(value: string): string {
  const text = value.replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

export function labelFrom<V extends string>(options: readonly Labeled<V>[] | undefined, fallback: Readonly<Record<V, string>>, value: V): string {
  return options?.find((o) => o.value === value)?.label ?? fallback[value] ?? humanize(value);
}

export function tonedFrom<V extends string>(
  options: readonly Toned<V>[] | undefined,
  fallback: Readonly<Record<V, { label: string; tone: Tone }>>,
  value: V,
): { label: string; tone: Tone } {
  const hit = options?.find((o) => o.value === value);
  if (hit) return { label: hit.label, tone: hit.tone };
  return fallback[value] ?? { label: humanize(value), tone: 'muted' };
}

/** Options in meta order, or the fallback table's order while meta is loading. */
export function optionsFrom<V extends string>(options: readonly Labeled<V>[] | undefined, fallback: Readonly<Record<V, string>>): Labeled<V>[] {
  if (options && options.length > 0) return options.map((o) => ({ value: o.value, label: o.label }));
  return (Object.keys(fallback) as V[]).map((value) => ({ value, label: fallback[value] }));
}

/** optionsFrom for status lists whose fallback carries a tone. */
export function tonedOptionsFrom<V extends string>(
  options: readonly Labeled<V>[] | undefined,
  fallback: Readonly<Record<V, { label: string; tone: Tone }>>,
): Labeled<V>[] {
  if (options && options.length > 0) return options.map((o) => ({ value: o.value, label: o.label }));
  return (Object.keys(fallback) as V[]).map((value) => ({ value, label: fallback[value].label }));
}

/* The contract's labels and the brief's tones (GET /meta sends the same). */

export const ACCESS_PROVIDER_LABELS: Readonly<Record<AccessProvider, string>> = {
  google_business_profile: 'Google Business Profile',
  google_ads: 'Google Ads',
  google_analytics: 'Google Analytics',
  google_search_console: 'Google Search Console',
  meta_business: 'Meta Business',
  instagram: 'Instagram',
  domain_registrar: 'Domain registrar',
  dns: 'DNS',
  website_hosting: 'Website hosting',
  wordpress: 'WordPress',
  wix: 'Wix',
  squarespace: 'Squarespace',
  shopify: 'Shopify',
  crm: 'CRM',
  call_tracking: 'Call tracking',
  email_provider: 'Email provider',
  other: 'Other',
};

export const ACCESS_METHOD_LABELS: Readonly<Record<AccessMethod, string>> = {
  invite_user: 'Add us as a user',
  partner_request: 'Partner or agency request',
  password_manager: 'Shared through a password manager',
  api_key: 'API key',
  screen_share: 'Set up together on a call',
  other: 'Other',
};

export const ACCESS_STATUSES: Readonly<Record<AccessStatus, { label: string; tone: Tone }>> = {
  requested: { label: 'Requested', tone: 'neutral' },
  pending_client: { label: 'Pending client', tone: 'gold' },
  client_says_done: { label: 'Client says done', tone: 'warn' },
  granted: { label: 'Granted', tone: 'ok' },
  verified: { label: 'Verified', tone: 'ok' },
  revoked: { label: 'Revoked', tone: 'signal' },
  not_applicable: { label: 'Not applicable', tone: 'muted' },
};

export const ASSET_KIND_LABELS: Readonly<Record<AssetKind, string>> = {
  logo: 'Logo',
  photo: 'Photo',
  brand: 'Brand guide',
  document: 'Document',
  video: 'Video',
  other: 'Other',
};

export const APPROVAL_KIND_LABELS: Readonly<Record<ApprovalKind, string>> = {
  website: 'Website',
  landing_page: 'Landing page',
  copy: 'Copy',
  design: 'Design',
  ad_creative: 'Ad creative',
  email: 'Email',
  automation: 'Automation',
  other: 'Other',
};

export const APPROVAL_STATUSES: Readonly<Record<ApprovalStatus, { label: string; tone: Tone }>> = {
  pending: { label: 'Pending', tone: 'gold' },
  approved: { label: 'Approved', tone: 'ok' },
  changes_requested: { label: 'Changes requested', tone: 'warn' },
  superseded: { label: 'Superseded', tone: 'muted' },
};

export const AGREEMENT_STATUSES: Readonly<Record<AgreementStatus, { label: string; tone: Tone }>> = {
  draft: { label: 'Draft', tone: 'muted' },
  sent: { label: 'Sent', tone: 'gold' },
  viewed: { label: 'Viewed', tone: 'gold' },
  signed: { label: 'Signed', tone: 'ok' },
  declined: { label: 'Declined', tone: 'muted' },
  voided: { label: 'Voided', tone: 'muted' },
};

export const STAGE_LABELS: Readonly<Record<OnboardingStage, string>> = {
  welcome: 'Welcome',
  intake: 'Intake',
  kickoff: 'Kickoff',
  build: 'Build',
  review: 'Review',
  go_live: 'Go live',
  optimizing: 'Optimizing',
  complete: 'Complete',
};

export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  todo: 'To do',
  in_progress: 'In progress',
  waiting_client: 'Waiting on client',
  done: 'Done',
  skipped: 'Skipped',
  blocked: 'Blocked',
};

/* ---------- the detail bundle cache ---------- */

/** Apply a change to the cached bundle (no-op when it is not cached). */
export function patchBundle(queryClient: QueryClient, clientId: string, change: (bundle: ClientBundle) => ClientBundle) {
  queryClient.setQueryData<ClientBundle>(clientKeys.detail(clientId), (old) => (old ? change(old) : old));
}

/**
 * After a write: the server also logged activity and touched the client, so the
 * bundle (and the older activity pages under it) are refetched, like the web admin
 * revalidating the client page.
 */
export function refreshBundle(queryClient: QueryClient, clientId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: clientKeys.detail(clientId) }),
    queryClient.invalidateQueries({ queryKey: clientKeys.activity(clientId) }),
  ]);
}

export function useBundleCache(clientId: string) {
  const queryClient = useQueryClient();
  return {
    queryClient,
    patch: (change: (bundle: ClientBundle) => ClientBundle) => patchBundle(queryClient, clientId, change),
    refresh: () => refreshBundle(queryClient, clientId),
  };
}

/* ---------- idempotency ---------- */

/**
 * One Idempotency-Key per create intent. A retry of the same payload (after a
 * timeout or a 5xx) reuses the key, so the server never creates twice. Changing
 * the payload, or a 4xx answer (the server stores those against the key too),
 * starts a new intent.
 */
export function useIntentKey() {
  const [intent, setIntent] = useState<{ key: string; body: string } | null>(null);
  return {
    keyFor: (payload: unknown): string => {
      const body = JSON.stringify(payload);
      if (intent && intent.body === body) return intent.key;
      const key = newIdempotencyKey();
      setIntent({ key, body });
      return key;
    },
    /** Call after success, or after a final (4xx) answer. */
    reset: () => setIntent(null),
  };
}

/** True when the server gave a final answer for this request (4xx), so a retry is a new intent. */
export function isFinalAnswer(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/**
 * A failed form submit: field errors the form can show go inline, anything else
 * becomes the usual notice (the API's message; 401, 403 and 426 are handled globally).
 */
export function handleFormError(error: unknown, fields: readonly string[], setErrors: (errors: Record<string, string>) => void) {
  const all = fieldErrors(error);
  const shown: Record<string, string> = {};
  for (const key of fields) if (all[key]) shown[key] = all[key];
  setErrors(shown);
  if (Object.keys(shown).length > 0) haptics.error();
  else reportSubmitError(error);
}
