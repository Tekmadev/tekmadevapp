import { z } from 'zod';

import { zLoaderSettings, type LoaderSettings } from './session';

/**
 * Schemas for the "settings" domain (contract section 11, Sales and settings; brief 8.14).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * The loader settings are the same object GET /me sends as `loader`, so the
 * schema is shared with the session domain. Saving here changes /me too.
 */

export { zLoaderSettings };
export type { LoaderSettings };

/** PUT /settings/loader body for "Reset to original". */
export const zLoaderReset = z.object({ reset: z.literal(true) });
export type LoaderReset = z.infer<typeof zLoaderReset>;

/**
 * GET and PUT /settings/commission: the default credit split for a client
 * created from a lead (the website's docs/admin-api/staff.md). Each 0 to 100
 * with two decimals at most, adding up to 100. 50 / 50 until the owner changes it.
 */
export const zCommissionSplit = z.object({ finder: z.number(), booker: z.number() });
export type CommissionSplit = z.infer<typeof zCommissionSplit>;

/** This domain's slice of GET /meta (composed in schemas/meta.ts). Ranges and defaults live in src/loader/settings.ts. */
export const metaFragment = z.object({});
