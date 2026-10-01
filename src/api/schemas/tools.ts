import { z } from 'zod';

import { zInstant, zMoney, zPage } from '../types';

/**
 * Schemas for the "tools" domain (the website's free tools; contract section 11,
 * Customers; brief 8.7). Validation only: no transforms, no defaults.
 */

/** GET /tools/stats: the four KPI cards. */
export const zToolStats = z.object({
  submissions: z.number().int(),
  last30d: z.number().int(),
  /** Submissions that opted in to the newsletter. */
  optIns: z.number().int(),
  /** Sum of the monthly leak over all submissions ("per month, all submissions"). */
  leakReported: zMoney,
});
export type ToolStats = z.infer<typeof zToolStats>;

/** Close rate as ratios (0.2 means 20%): today, and with instant replies. Shown as "20% → 35%". */
export const zCloseRate = z.object({ before: z.number(), after: z.number() });
export type CloseRate = z.infer<typeof zCloseRate>;

export const zToolSubmission = z.object({
  id: z.string(),
  /** Stable tool key, e.g. "missed-call-leak". */
  tool: z.string(),
  /** Display name, e.g. "Missed-call leak calculator". */
  toolName: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  business: z.string().nullable(),
  /** Revenue leaking per month, as the tool computed it. Null when they skipped the inputs. */
  leak: zMoney.nullable(),
  closeRate: zCloseRate.nullable(),
  /** How fast they reply to a new lead today, as the person answered ("Within an hour"). */
  replySpeed: z.string().nullable(),
  /** Opted in to the newsletter on the tool form. */
  newsletter: z.boolean(),
  /** Whether the breakdown email went out, and whether the contact reached the CRM. */
  delivered: z.object({ email: z.boolean(), crm: z.boolean() }),
  createdAt: zInstant,
});
export type ToolSubmission = z.infer<typeof zToolSubmission>;

/** GET /tools/submissions: newest first. */
export const zToolSubmissionPage = zPage(zToolSubmission);
export type ToolSubmissionPage = z.infer<typeof zToolSubmissionPage>;

/** One question of the tool and the answer as the person gave it (display text). */
export const zToolAnswer = z.object({ label: z.string(), value: z.string() });
export type ToolAnswer = z.infer<typeof zToolAnswer>;

/** One line of the computed breakdown, display text from the server. `emphasis` marks the headline numbers. */
export const zToolResultLine = z.object({ label: z.string(), value: z.string(), emphasis: z.boolean().optional() });
export type ToolResultLine = z.infer<typeof zToolResultLine>;

/** GET /tools/submissions/:id: the row plus the answers and the breakdown the person was sent. */
export const zToolSubmissionDetail = zToolSubmission.extend({
  answers: z.array(zToolAnswer),
  result: z.array(zToolResultLine),
  /** The lead this submission created (source lead_magnet), when there is one. */
  leadId: z.string().nullable(),
});
export type ToolSubmissionDetail = z.infer<typeof zToolSubmissionDetail>;

/**
 * This domain's slice of GET /meta (composed in schemas/meta.ts). The meta list in
 * the contract has nothing for free tools: every row already carries its tool name.
 */
export const metaFragment = z.object({});
export type ToolsMeta = z.infer<typeof metaFragment>;
