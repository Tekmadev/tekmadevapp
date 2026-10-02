import { ApiError, errorMessage } from '@/api/errors';
import type { TestCatalogItem, TestCounts, TestModeStatus } from '@/api/schemas/testMode';
import { countLabel } from '@/lib/format';

/** Test mode's pure parts (brief 8.15): copy, the catalog verdict and the purge toast. */

export const TEST_MODE_URL = 'https://www.tekmadev.com/admin/test-mode';

/** Stripe's sandbox card: shown spaced, copied as digits (every card field takes it either way). */
export const TEST_CARD_DISPLAY = '4242 4242 4242 4242';
export const TEST_CARD_DIGITS = '4242424242424242';
export const TEST_CARD_NOTE = 'Any future expiry, any CVC, any postal code';

export const INTRO =
  'Buy Webline on the real site against the Stripe sandbox. Test mode is switched on per browser with a cookie, so turn it on in the browser, not here.';

export const REBUILDING = 'Rebuilding the test catalog…';
export const REBUILD_NOTE = 'Up to 2 minutes. You can keep using the app.';
export const REBUILT_TOAST = 'Test catalog rebuilt.';
export const REBUILD_TIMEOUT = 'The rebuild is taking longer than 2 minutes. It may still finish; the catalog updates when it does.';

export const NO_PURCHASES = 'No test purchases yet.';
export const NO_CATALOG = 'Nothing in the test catalog yet. Rebuild it to create the sandbox prices.';
export const SETUP_GAP = 'Test purchases need both. Add what is missing to the server settings.';

/** The brief's toast, word for word: "Deleted {c} test account(s), {o} order(s), {s} subscription(s) and {l} login(s)." */
export function purgeMessage(deleted: TestCounts): string {
  return `Deleted ${deleted.clients} test account(s), ${deleted.orders} order(s), ${deleted.subscriptions} subscription(s) and ${deleted.logins} login(s).`;
}

/** What the hold-to-confirm sheet says will go. */
export function purgeConfirmMessage(counts: TestCounts): string {
  const parts = [
    countLabel(counts.clients, 'test account', 'test accounts'),
    countLabel(counts.orders, 'order', 'orders'),
    countLabel(counts.subscriptions, 'subscription', 'subscriptions'),
  ];
  return `Delete ${parts.join(', ')} and ${countLabel(counts.logins, 'login', 'logins')} made in test mode. Real clients and orders are not touched.`;
}

/** Both sandbox prices exist for this product. */
export function itemReady(item: TestCatalogItem): boolean {
  return item.priceReady && item.carePlanReady;
}

/** Every product has both prices (an empty catalog is not ready). */
export function catalogReady(status: TestModeStatus): boolean {
  return status.catalog.length > 0 && status.catalog.every(itemReady);
}

/** Anything for "Delete all test data" to delete. */
export function hasTestData(status: TestModeStatus): boolean {
  const { clients, orders, subscriptions, logins } = status.counts;
  return clients + orders + subscriptions + logins > 0 || status.recentPurchases.length > 0;
}

/** After a purge: every count is zero and the purchase list is empty (the server just said so). */
export function afterPurge(status: TestModeStatus): TestModeStatus {
  return { ...status, counts: { clients: 0, orders: 0, subscriptions: 0, logins: 0 }, recentPurchases: [] };
}

/**
 * The toast for a failed rebuild, or null when there is nothing to say
 * (cancelled, signed out, owner only and update required are handled elsewhere).
 */
export function rebuildFailureMessage(error: unknown, timedOut: boolean): string | null {
  if (timedOut) return REBUILD_TIMEOUT;
  if (error instanceof ApiError && (error.kind === 'aborted' || error.status === 401 || error.status === 403 || error.status === 426)) {
    return null;
  }
  return errorMessage(error);
}
