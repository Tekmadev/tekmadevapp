# API requests: pricing (owner)

Contract section 11 lists the Pricing endpoints but leaves some shapes and rules open. The mock implements everything below exactly as written (`src/api/mock/routes/pricing.ts`), so the app already depends on it. Please confirm or tell us what differs.

## 1. `GET /pricing` shape

```ts
type PricingPlan = {
  id: "convert" | "grow" | "lets-talk";
  name: string;
  monthly: number;      // cents
  setup: number;        // cents, the "Build & Install" fee
  currency: string;     // "CAD" (integer cents with a sibling currency, per the conventions)
  inStripe: boolean;    // false shows "Not yet in Stripe"
  sort: number;         // 1 = cheapest monthly; recomputed after every save
};

type PricingProduct = {
  id: string;           // "webline"
  name: string;
  tagline: string | null;
  status: "selling" | "paused" | "not_in_stripe";   // computed by the server
  amount: number;       // one-time fee, cents
  compareAt: number | null;  // cents, "Shown struck through"
  monthly: number;      // Webline Care, cents
  currency: string;
  trialDays: number;    // "First charge after", 1 to 365
  active: boolean;      // "Purchasable"
  inStripe: boolean;
};

type TaxStatus = {
  state: "charging" | "on_not_charging" | "off";
  explanation: string;  // shown under the badge
  readiness: string;    // the Stripe Tax readiness line
};

type Pricing = {
  plans: PricingPlan[];
  products: PricingProduct[];
  salesTax: { setting: { live: boolean; test: boolean }; live: TaxStatus; test: TaxStatus | null };
};
```

- `currency` on plans and products is new (the contract shows plain cents). Please send it.
- `product.status`: `selling` when Purchasable is on and the price is in Stripe, `paused` when Purchasable is off, `not_in_stripe` otherwise. `product.inStripe` is new too.
- `salesTax.test` is `null` when the Stripe sandbox is not configured (the app then hides the "Test mode" switch).

## 2. `PATCH /pricing/plans/:id` `{ monthly?, setup? }` → `{ plan, stripe }`

- Amounts are integer cents, 0 or more. Anything else: `400 input` "Enter valid, non-negative numbers." with `fields` for each bad field (`monthly`, `setup`).
- `stripe: "skipped"` when no amount actually changed (nothing to create in Stripe), or when Stripe is not configured.
- `stripe: "synced"` when new prices were created. A plan that was not in Stripe becomes `inStripe: true` after its first saved price.
- Unknown id: `404 not_found`.

## 3. The Stripe failure (`stripe`)

The contract lists `stripe: "failed"` in the result and a `stripe` error code whose message "says what was and was not saved". A message only travels in the error envelope, so the mock answers a failed sync like this:

- `502` `{ ok: false, error: { code: "stripe", message, fields } }`.
- Prices are applied one by one. Each one either lands (site and Stripe) or is refused and left as it was. Fields that did land stay saved.
- `message` names both sides, for example: "Stripe did not accept the new monthly fee, so it was not saved: the monthly fee is still $997. Saved: the Build & Install fee is now $2,600. Try again in a moment." When nothing else changed it ends "Nothing else changed. Try again in a moment."
- `fields` has one entry per refused price: `{ monthly: "Stripe did not accept this price. It is still $997." }`.
- After a `stripe` error the app refetches `GET /pricing` to show what is really saved.

If the server instead answers `200 { plan, stripe: "failed" }`, please add `message: string` to that result so the app can still show exactly what was saved.

Mock trigger: saving exactly 99999 cents ($999.99) as any price makes the fake Stripe refuse that price.

## 4. `PATCH /pricing/products/:id` `{ amount?, compareAt?, monthly?, trialDays?, active? }` → `{ product, stripe }`

- `amount`, `monthly`: integer cents, 0 or more. `compareAt`: integer cents or `null` (removes it). `trialDays`: whole number 1 to 365. `active`: boolean. Anything else: `400 input` "Enter valid, non-negative numbers." with `fields`.
- New rule: `400 compare_at` "The compare-at price must be higher than the one-time fee." (field `compareAt`) when the compare-at price would be at or below the one-time fee. A struck-through price lower than the real one reads as a mistake to buyers.
- Only `amount` and `monthly` go to Stripe. `compareAt`, `trialDays` and `active` are site settings: changing only those returns `stripe: "skipped"`. They are saved even when a price in the same request is refused, and the `stripe` message lists them under "Saved".
- `status` is recomputed and returned.

## 5. `PUT /pricing/sales-tax` `{ mode, on }`

- The contract does not say what it returns. The mock returns the whole `salesTax` block (same shape as in `GET /pricing`), so the card updates from the answer.
- Bad body: `400 tax` "Pick live or test mode, and on or off." with `fields` (`mode`, `on`).
- `503 not_configured` when Stripe is not configured, or for `mode: "test"` when the sandbox is not configured.

## 6. `GET /meta` additions

- `salesTaxStates: { value, label, tone }[]`: Charging (ok), On, not charging (warn), Off (muted).
- `pricingProductStatuses: { value, label, tone }[]`: Selling (ok), Paused (warn), Not yet in Stripe (signal).
