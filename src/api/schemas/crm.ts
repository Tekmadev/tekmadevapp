import { z } from 'zod';

import { zInstant, zTone } from '../types';
import { zConsentEvent } from './email';

/**
 * Schemas for the "crm" domain (contract section 11, Marketing > CRM; brief 8.11).
 * Validation only: no transforms, no defaults (see src/api/types.ts).
 *
 * It is always "the CRM": no vendor name in the UI, in copy, or in identifiers.
 * Sentences and explanations are written by the server and shown as they are.
 */

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

export const zCrmHealth = z.enum(['not_connected', 'token_rejected', 'verified', 'not_verified']);
export type CrmHealth = z.infer<typeof zCrmHealth>;

export const zCrmProbeResult = z.object({
  key: z.string(),
  ok: z.boolean(),
  /** Plain-English line for the checklist, e.g. "We can read contacts." */
  sentence: z.string(),
  /** Why it failed (only on failures). */
  detail: z.string().optional(),
});
export type CrmProbeResult = z.infer<typeof zCrmProbeResult>;

export const zCrmProbe = z.object({
  /** "Last checked <time>". */
  checkedAt: zInstant,
  results: z.array(zCrmProbeResult),
});
export type CrmProbe = z.infer<typeof zCrmProbe>;

/** The Connection card. Also what POST /crm/verify returns. */
export const zCrmConnection = z.object({
  /** A CRM token is set on the server. */
  configured: z.boolean(),
  health: zCrmHealth,
  /** One line under the status badge. */
  explanation: z.string(),
  /** The last Verify run, or null when it never ran. */
  probe: zCrmProbe.nullable(),
});
export type CrmConnection = z.infer<typeof zCrmConnection>;

/* ------------------------------------------------------------------ */
/* Switches, app, merge fields                                         */
/* ------------------------------------------------------------------ */

export const zCrmSurface = z.enum(['outbound', 'inbound', 'reconcile']);
export type CrmSurface = z.infer<typeof zCrmSurface>;
export const CRM_SURFACES: readonly CrmSurface[] = zCrmSurface.options;

/**
 * One switch card. Badge: Off (`on` false), Running (`on` and `running`),
 * or "On, not running" with a red warning (`on`, not `running`, `error` says why).
 */
export const zCrmSwitch = z.object({
  on: z.boolean(),
  running: z.boolean(),
  lastRunAt: zInstant.nullable(),
  error: z.string().optional(),
});
export type CrmSwitch = z.infer<typeof zCrmSwitch>;

export const zCrmSwitches = z.object({ outbound: zCrmSwitch, inbound: zCrmSwitch, reconcile: zCrmSwitch });
export type CrmSwitches = z.infer<typeof zCrmSwitches>;

export const zCrmAppStatus = z.enum(['installed_here', 'installed_elsewhere', 'not_installed']);
export type CrmAppStatus = z.infer<typeof zCrmAppStatus>;

/** The webhook app. Installing happens in the browser (the website's CRM page). */
export const zCrmApp = z.object({ status: zCrmAppStatus, explanation: z.string() });
export type CrmApp = z.infer<typeof zCrmApp>;

/** A merge field: copy `{{contact.<key>}}`. */
export const zCrmMergeField = z.object({ key: z.string(), label: z.string() });
export type CrmMergeField = z.infer<typeof zCrmMergeField>;

/* ------------------------------------------------------------------ */
/* Queue, runs, reconcile, attention                                   */
/* ------------------------------------------------------------------ */

export const zCrmQueueStat = z.object({ count: z.number().int(), sub: z.string() });
export type CrmQueueStat = z.infer<typeof zCrmQueueStat>;

/** Waiting to push, Pushed, Waiting to apply, Applied from the CRM. */
export const zCrmQueueStats = z.object({
  waitingToPush: zCrmQueueStat,
  pushed: zCrmQueueStat,
  waitingToApply: zCrmQueueStat,
  applied: zCrmQueueStat,
});
export type CrmQueueStats = z.infer<typeof zCrmQueueStats>;

export const zCrmJob = z.enum(['push', 'inbound', 'reconcile', 'backfill', 'verify']);
export type CrmJob = z.infer<typeof zCrmJob>;

export const zCrmRunBy = z.enum(['schedule', 'signup', 'you']);
export type CrmRunBy = z.infer<typeof zCrmRunBy>;

export const zCrmRunStatus = z.enum(['ok', 'running', 'partial', 'error']);
export type CrmRunStatus = z.infer<typeof zCrmRunStatus>;

export const zCrmRun = z.object({
  id: z.string(),
  job: zCrmJob,
  startedAt: zInstant,
  by: zCrmRunBy,
  /** One result line, e.g. "Pushed 14 contacts." */
  result: z.string(),
  status: zCrmRunStatus,
});
export type CrmRun = z.infer<typeof zCrmRun>;

export const zCrmLastReconcile = z.object({
  at: zInstant,
  checked: z.number().int(),
  corrected: z.number().int(),
  /** The safety stop fired: nothing was changed. */
  halted: z.boolean(),
  haltReason: z.string().optional(),
});
export type CrmLastReconcile = z.infer<typeof zCrmLastReconcile>;

export const zCrmQueueName = z.enum(['outbox', 'inbox']);
export type CrmQueueName = z.infer<typeof zCrmQueueName>;

export const zCrmDirection = z.enum(['to_crm', 'from_crm']);
export type CrmDirection = z.infer<typeof zCrmDirection>;

/** A stuck item in "Needs attention". Only `signed` items can be retried. */
export const zCrmAttentionItem = z.object({
  id: z.string(),
  queue: zCrmQueueName,
  what: z.string(),
  direction: zCrmDirection,
  /** Email or name of the contact it is about. */
  who: z.string(),
  tries: z.number().int(),
  /** Why it stopped. */
  why: z.string(),
  at: zInstant,
  signed: z.boolean(),
});
export type CrmAttentionItem = z.infer<typeof zCrmAttentionItem>;

/** GET /crm: the whole CRM sync screen in one read. */
export const zCrmStatus = z.object({
  connection: zCrmConnection,
  switches: zCrmSwitches,
  app: zCrmApp,
  /** Always 12 fields. */
  mergeFields: z.array(zCrmMergeField),
  queue: zCrmQueueStats,
  /** Latest 6, newest first. */
  runs: z.array(zCrmRun),
  lastReconcile: zCrmLastReconcile.nullable(),
  attention: z.array(zCrmAttentionItem),
});
export type CrmStatus = z.infer<typeof zCrmStatus>;

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** PUT /crm/switches/:surface. `queued`: contacts queued for their first push (Outbound turned on). */
export const zCrmSwitchResult = z.object({ switch: zCrmSwitch, queued: z.number().int().optional() });
export type CrmSwitchResult = z.infer<typeof zCrmSwitchResult>;

export const zCrmSyncResult = z.object({ handled: z.number().int() });
export type CrmSyncResult = z.infer<typeof zCrmSyncResult>;

export const zCrmReconcileResult = z.object({ corrected: z.number().int(), halted: z.boolean() });
export type CrmReconcileResult = z.infer<typeof zCrmReconcileResult>;

export const zCrmBatchResult = z.object({ count: z.number().int() });
export type CrmBatchResult = z.infer<typeof zCrmBatchResult>;

/* ------------------------------------------------------------------ */
/* Contact inspector                                                   */
/* ------------------------------------------------------------------ */

/** One column of the comparison ("This site" or "CRM"). `status` is a short label written by the server. */
export const zCrmInspectSide = z.object({
  canEmail: z.boolean(),
  status: z.string(),
  consented: z.boolean(),
  tags: z.array(z.string()),
  lastSyncedAt: zInstant.nullable(),
  contactId: z.string().nullable(),
});
export type CrmInspectSide = z.infer<typeof zCrmInspectSide>;

/**
 * GET /crm/inspect?email=, and what POST /crm/resubscribe returns.
 * Each lookup calls the CRM live: never auto-refresh it.
 */
export const zCrmInspect = z.object({
  email: z.string(),
  site: zCrmInspectSide,
  /** Null when the CRM has no contact for this email (`notFoundReason` says why). */
  crm: zCrmInspectSide.nullable(),
  notFoundReason: z.string().optional(),
  /** The address was erased here: it is never pushed to the CRM again. */
  erased: z.boolean().optional(),
  /** Newest first. Empty for erased or unknown addresses. */
  consentHistory: z.array(zConsentEvent),
  /** Unsubscribed here, but mailable again in the CRM: "They asked to come back, resubscribe them". */
  canResubscribe: z.boolean(),
});
export type CrmInspect = z.infer<typeof zCrmInspect>;

/* ------------------------------------------------------------------ */
/* GET /meta fragment                                                  */
/* ------------------------------------------------------------------ */

/** This domain's slice of GET /meta (composed in schemas/meta.ts). */
export const metaFragment = z.object({
  /** Not connected muted, Token rejected neutral, Verified ok, Not verified neutral. */
  crmHealth: z.array(z.object({ value: zCrmHealth, label: z.string(), tone: zTone })),
  crmAppStatuses: z.array(z.object({ value: zCrmAppStatus, label: z.string() })),
  crmSurfaces: z.array(z.object({ value: zCrmSurface, label: z.string() })),
  /** Push, Inbound, Reconcile, Backfill, Verify. */
  crmJobs: z.array(z.object({ value: zCrmJob, label: z.string() })),
  /** Schedule, Signup, You. */
  crmRunBy: z.array(z.object({ value: zCrmRunBy, label: z.string() })),
  /** ok, running, part done, error. */
  crmRunStatuses: z.array(z.object({ value: zCrmRunStatus, label: z.string(), tone: zTone })),
  crmDirections: z.array(z.object({ value: zCrmDirection, label: z.string() })),
  crmQueues: z.array(z.object({ value: zCrmQueueName, label: z.string() })),
});
export type CrmMeta = z.infer<typeof metaFragment>;
