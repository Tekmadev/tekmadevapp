# API requests: free tools

Contract section 11 lists `GET /tools/stats`, `GET /tools/submissions?cursor=` and `GET /tools/submissions/:id` but not the submission shape. The mock implements everything below (`src/api/mock/routes/tools.ts`, schema in `src/api/schemas/tools.ts`). Please confirm or tell us what differs.

## 1. `GET /tools/stats`

```ts
{ submissions: number; last30d: number; optIns: number; leakReported: Money }
```

`leakReported` is the sum of every submission's monthly leak (the KPI reads "per month, all submissions"). Submissions without a leak add nothing.

## 2. Submission row (`GET /tools/submissions`, newest first, `Page<Submission>`)

```ts
type Submission = {
  id: string;
  tool: string;                 // stable key, e.g. "missed-call-leak", "speed-to-lead"
  toolName: string;             // "Missed-call leak calculator"
  name: string | null;
  email: string;
  business: string | null;
  leak: Money | null;           // per month; null when the tool could not work it out (inputs skipped)
  closeRate: { before: number; after: number } | null;  // ratios: 0.2 and 0.35 show as "20% → 35%"
  replySpeed: string | null;    // the answer as shown on the form, e.g. "Within an hour"
  newsletter: boolean;          // opted in on the form
  delivered: { email: boolean; crm: boolean };  // breakdown email sent, contact reached the CRM
  createdAt: string;
};
```

Please send `leak: null` (not 0) when there is no number, so the app never shows a fake $0.

## 3. Detail (`GET /tools/submissions/:id`)

The row plus:

```ts
answers: { label: string; value: string }[];                       // each question and the answer, display text
result: { label: string; value: string; emphasis?: boolean }[];    // the computed breakdown, as the email shows it
leadId: string | null;                                             // the lead (source lead_magnet) this created
```

- `value` is display text formatted by the server (the same numbers the person was emailed), so the app does not recompute the tool's maths. Money inside it keeps cents when there are cents.
- `emphasis: true` marks the headline lines (the monthly leak, the improved close rate).
- `404 not_found` "That submission no longer exists." for an unknown id.

## 4. `GET /meta`

Nothing needed: every row carries its tool name.
