import { z } from 'zod';

import { zInstant, zRole, zTone } from '../types';

/**
 * Schemas for the "team" domain (contract section 11, Sales and settings; brief 8.16).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 */

export const zTeamMember = z.object({
  /** The login and the key for DELETE /team/:email. */
  email: z.string(),
  name: z.string().nullable(),
  role: zRole,
  /** Null: never signed in. */
  lastSignInAt: zInstant.nullable(),
  addedAt: zInstant,
  /** Set by the server environment: show a lock, it cannot be removed. */
  envOwner: z.boolean(),
});
export type TeamMember = z.infer<typeof zTeamMember>;

/** GET /team: owners first, then everyone else in the order they were added. */
export const zTeam = z.array(zTeamMember);
export type Team = z.infer<typeof zTeam>;

export const zTeamRemoveResult = z.object({ email: z.string(), deleted: z.literal(true) });
export type TeamRemoveResult = z.infer<typeof zTeamRemoveResult>;

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  /** The role picker and badges: Owner gold, Manager neutral, with the help line under each choice. */
  teamRoles: z.array(z.object({ value: zRole, label: z.string(), help: z.string(), tone: zTone })),
});
export type TeamMeta = z.infer<typeof metaFragment>;
