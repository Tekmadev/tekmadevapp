# API requests: coupons (owner)

Contract section 11 lists the coupon endpoints and error codes but not the request body or every rule. The mock implements everything below exactly as written (`src/api/mock/routes/coupons.ts`), so the app already depends on it. Please confirm or tell us what differs.

## 1. `Coupon` shape

```ts
type Coupon = {
  id: string;
  code: string;                 // uppercase letters, numbers and dashes
  label: string | null;         // internal label, never shown to buyers
  discount:
    | { type: "percent"; percent: number }                     // 1 to 100, up to two decimals
    | { type: "amount"; amount: number; currency: string };    // cents
  appliesTo: { value: CouponScope; label: string };
  duration: "once" | "first_month" | "repeating" | "forever";
  months?: number;              // only for "repeating"
  redeemed: number;
  maxRedemptions: number | null;  // null = unlimited
  expiresAt: string | null;     // YYYY-MM-DD (Toronto), null = never
  status: "active" | "disabled";
  dealUrl?: string;             // only for active coupons scoped to growth_monthly or anything
  createdAt: string;            // ISO instant
};
type CouponScope = "growth_monthly" | "growth_setup" | "webline" | "webline_care" | "anything";
```

- `GET /coupons` returns every coupon, newest first (not paged).
- `dealUrl`: the mock uses `https://www.tekmadev.com/deal/<CODE>`. Please tell us the real format; the app only copies and shares what it receives.
- The `currency` inside an amount discount is new (integer cents with a sibling currency).

## 2. `POST /coupons` body (Idempotency-Key)

The New coupon sheet sends a flat body. Inline errors in `fields` use the same keys.

```ts
{
  code?: string | null;        // blank or missing: auto code, e.g. "TKM-7Q4X"
  label?: string | null;
  type: "percent" | "amount";
  percent?: number;            // for "percent"
  amount?: number;             // for "amount", cents
  appliesTo: CouponScope;
  duration?: "first_month" | "repeating" | "forever";   // monthly scopes only
  months?: number | null;      // for "repeating"
  maxRedemptions?: number | null;
  expiresAt?: string | null;   // YYYY-MM-DD
}
```

Response: `201` with the full `Coupon`.

## 3. Rules and codes

All codes from the contract table, with the status the mock uses. Every bad field is reported in `fields`; `code` and `message` are the first problem in form order (code, label, type, percent or amount, appliesTo, duration, months, maxRedemptions, expiresAt).

| Status | code | When | field |
|---|---|---|---|
| 503 | `nostripe` | Stripe is not configured (checked before anything else) | none |
| 400 | `code` | Not 3 to 40 letters, numbers and dashes after trimming and uppercasing | `code` |
| 400 | `percent` | Not a number from 1 to 100 with at most two decimals | `percent` |
| 400 | `amount` | Not a whole number of cents above 0 | `amount` |
| 400 | `months` | `repeating` without a whole number of months, 1 or more | `months` |
| 400 | `max` | Not a whole number, 1 or more | `maxRedemptions` |
| 400 | `expires` | Not a real `YYYY-MM-DD` calendar day (2027-02-31 is refused) | `expiresAt` |
| 400 | `expirespast` | Today or earlier in Toronto (it must be after today) | `expiresAt` |
| 409 | `dupe` | The code exists already, any case, including disabled coupons | `code` |
| 422 | `noproducts` | Stripe has no price for what the scope covers (see below) | `appliesTo` |

New codes the table does not list (please confirm or send yours):

| Status | code | message | field |
|---|---|---|---|
| 400 | `type` | Pick Percent off or Fixed amount off. | `type` |
| 400 | `scope` | Pick what the coupon applies to. | `appliesTo` |
| 400 | `duration` | Pick how long the discount lasts. (monthly scope without a valid duration) | `duration` |
| 400 | `label` | Keep the label to 80 characters or fewer. | `label` |

Other rules:

- One-time scopes (`growth_setup`, `webline`) always get `duration: "once"` and no `months`, whatever was sent.
- `noproducts`: `growth_monthly` and `growth_setup` need at least one growth plan in Stripe; `webline` and `webline_care` need Webline in Stripe; `anything` needs either.
- Auto codes are `TKM-` plus 4 characters without 0, O, 1 or I, unique.

## 4. `POST /coupons/:id/disable`

- Returns the full `Coupon` (status `disabled`, no `dealUrl`).
- Disabling a coupon that is already disabled returns `200` with the same coupon, so a retry after a dropped connection is harmless.
- Unknown id: `404 not_found`.

## 5. `GET /meta` additions

- `couponScopes: { value, label, help, oneTime }[]` (as the contract says). The `anything` help warns that it applies to every product.
- `couponDurations: { value, label, choice }[]`: `label` is list copy ("One charge", "First month", "Forever"; the app shows "{n} months" for `repeating`), `choice` is the New coupon sheet copy ("First month only", "A set number of months", "Forever"; `null` for `once`).
- `couponStatuses: { value, label, tone }[]`: Active (gold), Disabled (muted).
- `couponDiscountTypes: { value, label }[]`: Percent off, Fixed amount off.
