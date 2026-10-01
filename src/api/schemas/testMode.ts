import { z } from 'zod';

import { zInstant, zMoney, zTone } from '../types';

/**
 * Schemas for the "testMode" domain (contract section 11, Sales and settings; brief 8.15).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * Test mode is switched on per browser with a cookie, so the app only reads
 * its status, rebuilds the sandbox catalog and deletes test data.
 */

export const zTestCatalogItem = z.object({
  productId: z.string(),
  name: z.string(),
  /** The one-time price exists in the Stripe sandbox. */
  priceReady: z.boolean(),
  /** The monthly care plan price exists in the Stripe sandbox. */
  carePlanReady: z.boolean(),
});
export type TestCatalogItem = z.infer<typeof zTestCatalogItem>;

/** Test rows on record. Also the shape of POST /test-mode/purge (what was deleted). */
export const zTestCounts = z.object({
  clients: z.number().int(),
  orders: z.number().int(),
  subscriptions: z.number().int(),
  logins: z.number().int(),
});
export type TestCounts = z.infer<typeof zTestCounts>;

export const zTestPurchaseStatus = z.enum(['paid', 'pending', 'failed', 'refunded']);
export type TestPurchaseStatus = z.infer<typeof zTestPurchaseStatus>;

export const zTestPurchase = z.object({
  id: z.string(),
  at: zInstant,
  email: z.string(),
  /** Product name as bought ("Webline", "Webline Care"). */
  product: z.string(),
  /** What the sandbox charged, tax included. */
  amount: zMoney,
  status: zTestPurchaseStatus,
});
export type TestPurchase = z.infer<typeof zTestPurchase>;

export const zTestModeStatus = z.object({
  keysConfigured: z.boolean(),
  webhookSecretConfigured: z.boolean(),
  catalog: z.array(zTestCatalogItem),
  counts: zTestCounts,
  /** Latest test purchases, newest first (at most 6). */
  recentPurchases: z.array(zTestPurchase),
});
export type TestModeStatus = z.infer<typeof zTestModeStatus>;

/** POST /test-mode/purge: how many of each were deleted (the toast needs all four). */
export const zTestPurgeResult = zTestCounts;
export type TestPurgeResult = z.infer<typeof zTestPurgeResult>;

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  testPurchaseStatuses: z.array(z.object({ value: zTestPurchaseStatus, label: z.string(), tone: zTone })),
});
export type TestModeMeta = z.infer<typeof metaFragment>;
