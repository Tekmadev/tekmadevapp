import type { Coupon, CouponDiscount, CouponDuration, CouponScope, CouponScopeOption, CouponsMeta, CouponStatus } from '../../schemas/coupons';
import { daysAgo, hoursAgo, torontoDate } from '../router';

/**
 * Fixtures for the "coupons" domain. Realistic data, same shapes as the live API.
 * Mutable in-memory state: POST /coupons adds rows, disable flips the status.
 * Rows are stored without `dealUrl`; the route adds it when the coupon is shareable.
 */

export const COUPON_SCOPES: CouponScopeOption[] = [
  {
    value: 'growth_monthly',
    label: 'Growth plans, monthly',
    help: "Takes money off the monthly fee of Convert, Grow and Let's Talk. Pick how long it lasts.",
    oneTime: false,
  },
  {
    value: 'growth_setup',
    label: 'Build & Install fee',
    help: 'Takes money off the one-time Build & Install fee of any growth plan. Applies once.',
    oneTime: true,
  },
  {
    value: 'webline',
    label: 'Webline',
    help: 'Takes money off the one-time Webline fee. Applies once.',
    oneTime: true,
  },
  {
    value: 'webline_care',
    label: 'Webline Care, monthly',
    help: 'Takes money off the monthly Webline Care plan. Pick how long it lasts.',
    oneTime: false,
  },
  {
    value: 'anything',
    label: 'Anything',
    help: 'Applies to every product at checkout: growth plans, Build & Install, Webline and Webline Care. Only use it for a deal you would honour on all of them.',
    oneTime: false,
  },
];

export const scopeOption = (value: CouponScope) => COUPON_SCOPES.find((s) => s.value === value);

/** Scopes whose active coupons get a shareable deal link. */
export const DEAL_SCOPES: readonly CouponScope[] = ['growth_monthly', 'anything'];

export const DEAL_BASE_URL = 'https://www.tekmadev.com/deal/';

type Seed = {
  id: string;
  code: string;
  label: string | null;
  discount: CouponDiscount;
  scope: CouponScope;
  duration: CouponDuration;
  months?: number;
  redeemed: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  status: CouponStatus;
  createdAt: string;
};

const percent = (value: number): CouponDiscount => ({ type: 'percent', percent: value });
const amount = (cents: number): CouponDiscount => ({ type: 'amount', amount: cents, currency: 'CAD' });

const SEEDS: Seed[] = [
  {
    id: 'cpn_fallgrow26',
    code: 'FALLGROW',
    label: 'Fall push for Grow, sent to the September newsletter',
    discount: percent(20),
    scope: 'growth_monthly',
    duration: 'repeating',
    months: 3,
    redeemed: 4,
    maxRedemptions: 10,
    expiresAt: torontoDate(45),
    status: 'active',
    createdAt: daysAgo(12, -3),
  },
  {
    id: 'cpn_tkm7q4x001',
    code: 'TKM-7Q4X',
    label: 'Referral from Glebe Legal (one person)',
    discount: percent(10),
    scope: 'anything',
    duration: 'first_month',
    redeemed: 0,
    maxRedemptions: 1,
    expiresAt: torontoDate(7),
    status: 'active',
    createdAt: hoursAgo(5),
  },
  {
    id: 'cpn_hamilton100',
    code: 'HAMILTON100',
    label: 'Hamilton Chamber members',
    discount: amount(10_000),
    scope: 'growth_setup',
    duration: 'once',
    redeemed: 2,
    maxRedemptions: null,
    expiresAt: null,
    status: 'active',
    createdAt: daysAgo(34, -6),
  },
  {
    id: 'cpn_webline775',
    code: 'WEBLINE-LAUNCH',
    label: null,
    discount: amount(7_750),
    scope: 'webline',
    duration: 'once',
    redeemed: 25,
    maxRedemptions: 25,
    expiresAt: torontoDate(20),
    status: 'active',
    createdAt: daysAgo(48, -2),
  },
  {
    id: 'cpn_carefirst01',
    code: 'CARE-FIRST',
    label: 'First month of Webline Care on us',
    discount: percent(100),
    scope: 'webline_care',
    duration: 'first_month',
    redeemed: 7,
    maxRedemptions: null,
    expiresAt: null,
    status: 'active',
    createdAt: daysAgo(61, -4),
  },
  {
    id: 'cpn_partnerott1',
    code: 'PARTNER-OTTAWA-BYWARD-MARKET-BIA-2026',
    label: 'ByWard Market BIA partner rate, agreed at the September breakfast meetup with the board and two member businesses',
    discount: percent(12.5),
    scope: 'growth_monthly',
    duration: 'forever',
    redeemed: 1,
    maxRedemptions: 5,
    expiresAt: null,
    status: 'active',
    createdAt: daysAgo(19, -1),
  },
  {
    id: 'cpn_carecents01',
    code: 'CARE-SAVE',
    label: 'Care plan saver for Webline clients who renewed early',
    discount: amount(1_250),
    scope: 'webline_care',
    duration: 'repeating',
    months: 12,
    redeemed: 3,
    maxRedemptions: 20,
    expiresAt: torontoDate(120),
    status: 'active',
    createdAt: daysAgo(27, -5),
  },
  {
    id: 'cpn_bfriday2025',
    code: 'BLACKFRIDAY25',
    label: 'Black Friday 2025',
    discount: percent(25),
    scope: 'anything',
    duration: 'repeating',
    months: 2,
    redeemed: 9,
    maxRedemptions: 50,
    expiresAt: torontoDate(-300),
    status: 'disabled',
    createdAt: daysAgo(318, -2),
  },
  {
    id: 'cpn_summersetup',
    code: 'SUMMER-SETUP',
    label: 'Summer Build & Install offer',
    discount: amount(50_000),
    scope: 'growth_setup',
    duration: 'once',
    redeemed: 3,
    maxRedemptions: null,
    expiresAt: torontoDate(-31),
    status: 'disabled',
    createdAt: daysAgo(104, -7),
  },
  {
    id: 'cpn_grow1month',
    code: 'GROW1',
    label: null,
    discount: amount(99_700),
    scope: 'growth_monthly',
    duration: 'first_month',
    redeemed: 0,
    maxRedemptions: 3,
    expiresAt: null,
    status: 'disabled',
    createdAt: daysAgo(140, -3),
  },
];

/** A stored coupon: the API shape without `dealUrl`. */
export type StoredCoupon = Omit<Coupon, 'dealUrl'>;

function toStored(seed: Seed): StoredCoupon {
  const scope = scopeOption(seed.scope);
  return {
    id: seed.id,
    code: seed.code,
    label: seed.label,
    discount: seed.discount,
    appliesTo: { value: seed.scope, label: scope?.label ?? seed.scope },
    duration: seed.duration,
    ...(seed.duration === 'repeating' && seed.months ? { months: seed.months } : {}),
    redeemed: seed.redeemed,
    maxRedemptions: seed.maxRedemptions,
    expiresAt: seed.expiresAt,
    status: seed.status,
    createdAt: seed.createdAt,
  };
}

export const couponsState: { coupons: StoredCoupon[] } = {
  coupons: SEEDS.map(toStored),
};

/** This domain's slice of the GET /meta fixture (composed in fixtures/meta.ts). */
export const metaFixture: CouponsMeta = {
  couponScopes: COUPON_SCOPES,
  couponDurations: [
    { value: 'once', label: 'One charge', choice: null },
    { value: 'first_month', label: 'First month', choice: 'First month only' },
    { value: 'repeating', label: 'A set number of months', choice: 'A set number of months' },
    { value: 'forever', label: 'Forever', choice: 'Forever' },
  ],
  couponStatuses: [
    { value: 'active', label: 'Active', tone: 'gold' },
    { value: 'disabled', label: 'Disabled', tone: 'muted' },
  ],
  couponDiscountTypes: [
    { value: 'percent', label: 'Percent off' },
    { value: 'amount', label: 'Fixed amount off' },
  ],
};
