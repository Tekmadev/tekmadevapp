# API requests: billing (Subscriptions screen)

Contract section 11 lists `GET /billing/orders?status=&cursor=` and `GET /billing/subscriptions?status=&kind=plan|care&cursor=` (live mode only) without the row shapes, and the screen subtitle needs totals the lists cannot carry. The mock implements everything below (`src/api/mock/routes/billing.ts`, schema in `src/api/schemas/billing.ts`). Please confirm or tell us what differs.

## 1. New field: `summary` on both list responses

The subtitle reads "{subs} subscriptions · {orders} one-time orders ({bnpl} paid in instalments)". Counting pages on the phone would be wrong until every page is loaded, so both endpoints return the same totals next to the page:

```ts
{ items: T[]; nextCursor: string | null; summary: { subscriptions: number; orders: number; bnpl: number } }
```

- `subscriptions`: every live subscription row (any status).
- `orders`: every live one-time order row (any status).
- `bnpl`: orders paid with Klarna, Afterpay or Affirm whose payment went through (paid, refunded, partially refunded or disputed; not pending or failed).
- The summary ignores `status`, `kind` and the cursor: it is always the whole live picture.
- Test mode rows are never counted (they live in Test mode).

## 2. Order row

```ts
type Order = {
  id: string;
  clientId: string | null;      // null for checkouts that never became a client (failed, abandoned)
  business: string | null;      // the row shows the business, or the email when null
  email: string;
  product: string;              // "Webline", "Build & Install: Grow"
  status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded" | "disputed";
  amount: Money;
  amountRefunded: Money | null; // full amount when refunded, the refunded part when partially refunded
  paidWith: "card" | "klarna" | "afterpay" | "affirm" | "link" | null;  // null while pending
  bnpl: boolean;                // paid in instalments
  source: string | null;        // checkout attribution (UTM source), shown in the detail
  campaign: string | null;      // UTM campaign
  createdAt: string;
  paidAt: string | null;
};
```

## 3. Subscription row

```ts
type Subscription = {
  id: string;
  clientId: string | null;
  business: string | null;
  email: string;
  kind: "plan" | "care";
  planId: string | null;        // "convert" | "grow" | "lets-talk"; null for Webline Care
  productName: string;          // plan name, or "Webline Care"
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "incomplete_expired" | "unpaid" | "paused";  // Stripe's
  cancelAtPeriodEnd: boolean;   // the app shows "Ending <currentPeriodEnd>"
  currentPeriodEnd: string | null;
  amount: Money;
  interval: "month" | "year";
  customerId: string;           // Stripe customer id, copyable in the detail
  createdAt: string;
  canceledAt: string | null;
  cancellation: { reason: string | null; feedback: string | null; comment: string | null } | null;
};
```

- `cancellation` is Stripe's `cancellation_details` as readable text ("Cancelled by the customer", "Payment failed"; feedback "Too expensive", "Switched to another service"; the customer's own comment). Send it when the subscription is cancelled or set to cancel at period end, otherwise null.

## 4. Filters

| Status | code | message |
|---|---|---|
| 400 | `status` | Unknown order status. / Unknown subscription status. |
| 400 | `kind` | Unknown subscription kind. Use plan or care. |

Both lists are newest first (`createdAt`), `?cursor=&limit=` as everywhere. Managers may read them.

## 5. `GET /meta` fragment

```ts
billingOrderStatuses: { value: OrderStatus; label: string; tone: Tone }[];
billingSubscriptionStatuses: { value: SubscriptionStatus; label: string; tone: Tone }[];
billingSubscriptionKinds: { value: "plan" | "care"; label: string }[];
billingPaymentMethods: { value: PaymentMethod; label: string; bnpl: boolean }[];  // Card, Klarna, Afterpay, Affirm, Link
```

Keys are prefixed with `billing` so they cannot collide with Test mode's purchase statuses.
