import { z } from 'zod';

/**
 * Schemas for the "settings" domain (contract section 11).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 */

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({});
