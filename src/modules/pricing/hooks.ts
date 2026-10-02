import { useQueryClient } from '@tanstack/react-query';

import { pricingKeys } from '@/api/endpoints/pricing';
import { ApiError, fieldErrors } from '@/api/errors';
import type { Pricing, StripeSync } from '@/api/schemas/pricing';
import { reportSubmitError } from '@/components/SubmitGroup';
import { haptics } from '@/design/haptics';
import { notice } from '@/lib/notice';

import { saveNotice } from './logic';

/**
 * Cache writes for the Pricing screen. Everything here touches Stripe, so
 * nothing is optimistic: the entity the server returns goes into the cache,
 * then GET /pricing is refetched (the web admin reloads the page after a
 * save, and a saved price can reorder the plans).
 */
export function usePricingCache() {
  const queryClient = useQueryClient();
  return {
    apply: (change: (pricing: Pricing) => Pricing) =>
      queryClient.setQueryData<Pricing>(pricingKeys.overview(), (old) => (old ? change(old) : old)),
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: pricingKeys.all });
    },
  };
}

/** The toast after a 200, honest about whether Stripe took the change. */
export function announceSave(stripe: StripeSync) {
  const { tone, message } = saveNotice(stripe);
  if (tone === 'ok') {
    haptics.success();
    notice.ok(message);
  } else {
    haptics.error();
    notice.err(message);
  }
}

export type SaveErrorHandlers = {
  setErrors: (errors: Record<string, string>) => void;
  /** The API's own words for a partial Stripe failure, shown on the card until the next edit or save. */
  setSaveError: (message: string | null) => void;
  /** A partial failure: refetch, so the prices that did save show (the ones that did not keep their edits). */
  onPartial: () => void;
};

/**
 * A failed price save. Field errors go inline. A `stripe` error (502) means
 * part of the save may have landed: its message says exactly what, so it is
 * shown as is on the card (never "Saved"), and the caller refetches. Anything
 * else without fields is a toast (401, 403 and 426 are handled globally).
 */
export function handlePriceSaveError(error: unknown, handlers: SaveErrorHandlers) {
  const fields = fieldErrors(error);
  handlers.setErrors(fields);
  haptics.error();
  if (error instanceof ApiError && error.code === 'stripe') {
    handlers.setSaveError(error.message);
    handlers.onPartial();
    return;
  }
  if (Object.keys(fields).length === 0) reportSubmitError(error);
}
