# API requests: test mode (owner)

Contract section 11 lists `GET /test-mode`, `POST /test-mode/catalog` and `POST /test-mode/purge` with only a sketch of the response. The mock implements the shapes below (`src/api/mock/routes/testMode.ts`). Please confirm or tell us what differs.

## `GET /test-mode`

```ts
type TestModeStatus = {
  keysConfigured: boolean;
  webhookSecretConfigured: boolean;
  catalog: { productId: string; name: string; priceReady: boolean; carePlanReady: boolean }[];
  counts: { clients: number; orders: number; subscriptions: number; logins: number };
  recentPurchases: {
    id: string;          // new: a stable key for the list
    at: string;          // ISO instant
    email: string;
    product: string;     // product name as bought, e.g. "Webline", "Webline Care"
    amount: { amount: number; currency: string };   // cents, what the sandbox charged (tax included)
    status: "paid" | "pending" | "failed" | "refunded";
  }[];                   // newest first, at most 6
};
```

- Please add `id` to each recent purchase (the Stripe session or payment id is fine).
- `GET /meta` gets `testPurchaseStatuses: { value, label, tone }[]`: Paid (ok), Pending (warn), Failed (signal), Refunded (muted).

## `POST /test-mode/catalog` (long job)

- Returns the whole `TestModeStatus` after the rebuild (the contract does not say), so the screen updates from the answer.
- `503 not_configured` when the sandbox keys are missing.
- The app uses the 120s long-job timeout and never retries on timeout; it refetches `GET /test-mode` instead.

## `POST /test-mode/purge` `{ confirm: true }`

- Without `confirm: true`: `400 confirm` "Confirm to delete all test data." (field `confirm`), and nothing is deleted.
- Returns how many were deleted: `{ clients, orders, subscriptions, logins }` (same keys as `counts`), for the toast "Deleted {c} test account(s), {o} order(s), {s} subscription(s) and {l} login(s)."
- A second purge returns all zeros.
