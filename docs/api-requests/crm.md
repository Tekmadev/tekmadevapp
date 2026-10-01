# API requests: CRM sync (Marketing > CRM)

Contract section 11 lists the CRM endpoints and names the error codes, but leaves the shapes and the error messages open. The mock implements everything below exactly as written (`src/api/mock/routes/crm.ts`, schemas in `src/api/schemas/crm.ts`), so the app already depends on it. Please confirm or tell us what differs. Every CRM endpoint is owner only (403 for managers). It is always "the CRM": no vendor name in any field, sentence or message.

## 1. GET /crm

```ts
{
  connection: {
    configured: boolean;                 // a CRM token is set on the server
    health: "not_connected" | "token_rejected" | "verified" | "not_verified";
    explanation: string;                 // one line under the badge
    probe: { checkedAt: string; results: { key: string; ok: boolean; sentence: string; detail?: string }[] } | null;
  };
  switches: Record<"outbound" | "inbound" | "reconcile", { on: boolean; running: boolean; lastRunAt: string | null; error?: string }>;
  app: { status: "installed_here" | "installed_elsewhere" | "not_installed"; explanation: string };
  mergeFields: { key: string; label: string }[];            // always 12
  queue: Record<"waitingToPush" | "pushed" | "waitingToApply" | "applied", { count: number; sub: string }>;
  runs: { id; job: "push" | "inbound" | "reconcile" | "backfill" | "verify"; startedAt; by: "schedule" | "signup" | "you"; result: string; status: "ok" | "running" | "partial" | "error" }[];   // latest 6, newest first
  lastReconcile: { at; checked: number; corrected: number; halted: boolean; haltReason?: string } | null;
  attention: { id; queue: "outbox" | "inbox"; what: string; direction: "to_crm" | "from_crm"; who: string; tries: number; why: string; at; signed: boolean }[];   // newest first
}
```

- The switch badge reads: Off (`on` false), Running (`on` and `running`), "On, not running" (`on`, not `running`, with `error`).
- `health` is `not_connected` whenever `configured` is false, and `probe` is then `null`.
- Sentences, explanations, `sub` lines, `result` lines and `why` are server copy shown as is.
- When Verify fails, every switch that is on stops running with an error until Verify passes again. A reconcile safety stop also stops the reconcile switch until a reconcile run succeeds.

## 2. Mutations

| Endpoint | Response | Notes |
|---|---|---|
| `POST /crm/verify` (long job) | the `connection` object above | Records a `verify` run. |
| `PUT /crm/switches/:surface` `{ on }` | `{ switch, queued? }` | We added `switch` (the updated card). `queued` is only sent when Outbound is turned on: contacts never pushed and not already queued are queued once, and a `backfill` run is recorded when there were any. Turning off always works. |
| `POST /crm/sync` (long job) | `{ handled }` | Pushes the outbox only while Outbound is on and applies the inbox only while Inbound is on; records one run per direction. |
| `POST /crm/reconcile` (long job) | `{ corrected, halted }` | Safety stop when it would unsubscribe more than a fifth of the contacts: nothing changes, `corrected` is 0, `lastReconcile.haltReason` explains. |
| `POST /crm/retry` `{ queue, ids }` | `{ count }` | Only signed items in that queue are retried; the rest are skipped. |
| `POST /crm/discard` `{ queue, ids }` | `{ count }` | Discarded items leave "Needs attention" but stay on record. |
| `POST /crm/resubscribe` `{ email }` | the inspect result below, refreshed | Adds a `resubscribed` consent event (source `crm`). |

## 3. GET /crm/inspect?email=

```ts
{
  email: string;                         // lowercased
  site: Side;                            // "This site"
  crm: Side | null;                      // null: the CRM has no contact (see notFoundReason)
  notFoundReason?: string;               // e.g. "No contact with this email in the CRM yet. It is queued for its first push."
  erased?: true;                         // erased here: never pushed again
  consentHistory: ConsentEvent[];        // same shape as the email domain, newest first; empty for erased or unknown addresses
  canResubscribe: boolean;               // unsubscribed here, mailable in the CRM
}
type Side = { canEmail: boolean; status: string; consented: boolean; tags: string[]; lastSyncedAt: string | null; contactId: string | null };
```

- `status` is a short label written by the server (for example "Unsubscribed via the unsubscribe page", "Mailable", "Email DND on, permanent", "Not a subscriber", "Erased").
- An address unknown on both sides still answers 200, with a "Not a subscriber" site column and `crm: null`.
- Each lookup calls the CRM live; the app never refreshes it on its own.

## 4. Errors

| Status | code | message | When |
|---|---|---|---|
| 503 | `not_configured` | The CRM is not connected. Add the CRM token on the website first. | No token: verify, switches (on), sync, reconcile, inspect, resubscribe |
| 422 | `unverified` | The CRM has not passed Verify yet. Verify the connection first. | Turning a switch on, sync, reconcile while not verified; inspect and resubscribe while the token is rejected |
| 502 | `probe` | The check could not reach the CRM. Nothing changed. Try again in a moment. | Verify could not run |
| 502 | `sync` | The sync could not reach the CRM. Nothing was lost: queued items stay queued. | |
| 502 | `reconcile` | The reconcile could not reach the CRM. Nothing was changed. | |
| 422 | `nothing` | Nothing to retry or discard. | No id matched (or none of them was signed, for retry) |
| 400 | `queue` | Pick the outbox or the inbox. | |
| 400 | `ids` | Pick at least one item. | `ids` is not a list of strings |
| 400 | `on` | Send on as true or false. | |
| 404 | `not_found` | That switch no longer exists. | Unknown surface |
| 400 | `email` | Enter a valid email. | inspect, resubscribe |
| 404 | `resub_notfound` | Not resubscribed: there is no subscriber with that email here. | |
| 422 | `resub_refused` | Not resubscribed: bounced or complained addresses can never be revived. | |
| 409 | `resub_stale` | Not resubscribed: this changed since you looked them up. Look them up again. | Not unsubscribed here any more, or the CRM no longer shows them mailable |

The contract table only describes `not_configured`, `unverified`, `probe`, `sync`, `reconcile` and the `resub_*` codes; the messages above are ours. Please send the exact server strings if they differ.

## 5. GET /meta

`crmHealth` (`{ value, label, tone }`: Not connected muted, Token rejected neutral, Verified ok, Not verified neutral), `crmAppStatuses`, `crmSurfaces` (Outbound, Inbound, Nightly reconcile), `crmJobs` (Push, Inbound, Reconcile, Backfill, Verify), `crmRunBy` (Schedule, Signup, You), `crmRunStatuses` (ok ok, running neutral, "part done" warn, error signal), `crmDirections` (To the CRM, From the CRM), `crmQueues` (Outbox, Inbox).
