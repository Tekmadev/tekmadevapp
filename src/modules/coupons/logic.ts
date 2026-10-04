import type { NewCouponInput } from '@/api/endpoints/coupons';
import type {
  Coupon,
  CouponDiscount,
  CouponDiscountType,
  CouponDuration,
  CouponScope,
  CouponScopeOption,
  CouponsMeta,
  CouponStatus,
} from '@/api/schemas/coupons';
import type { Tone } from '@/design/tokens';
import { addDays, formatCalendarDate, todayToronto } from '@/lib/dates';
import { formatCount, plural } from '@/lib/format';
import { formatCents } from '@/lib/money';

/**
 * Pure helpers for Coupons (brief 8.13): how a coupon reads in the list and
 * in the live preview, the New coupon form's local checks (the server's own
 * messages from the contract, section 11), and the POST body. The server
 * stays the judge: these only give instant feedback before sending.
 */

/* ---------- copy ---------- */

export const EMPTY_COPY = 'No coupons yet. Create one above.';
/** Without `coupons.write` there is no "New coupon" above. */
export const EMPTY_COPY_READ_ONLY = 'No coupons yet.';
export const DISABLED_TOAST = 'Coupon disabled. It can no longer be redeemed.';
export const CODE_PLACEHOLDER = 'e.g. STARTUP50, or leave blank for auto';
export const createdToast = (code: string) => `Coupon "${code}" created and live at checkout.`;

/** The server's messages (contract section 11), used for the same checks done locally. */
export const COUPON_MESSAGES = {
  percent: 'Percent off must be between 1 and 100.',
  amount: 'Enter a fixed amount greater than zero.',
  months: 'Enter a valid number of months (1 or more).',
  max: 'Max redemptions must be 1 or more.',
  expirespast: 'The expiry date must be in the future.',
  code: "That code isn't valid. Use letters, numbers and dashes.",
  scope: 'Pick what the coupon applies to.',
  label: 'Keep the label to 80 characters or fewer.',
} as const;

export const CODE_MAX = 40;
const CODE_MIN = 3;
export const LABEL_MAX = 80;
const CODE_PATTERN = /^[A-Z0-9-]+$/;

export const DEFAULT_PERCENT = 20;
/** $100 in cents. */
export const DEFAULT_AMOUNT = 10_000;
export const DEFAULT_MONTHS = 3;

/* ---------- labels ---------- */

export type Badge = { label: string; tone: Tone };

const STATUS_FALLBACK: Record<CouponStatus, Badge> = {
  active: { label: 'Active', tone: 'gold' },
  disabled: { label: 'Disabled', tone: 'muted' },
};

const DURATION_FALLBACK: Record<CouponDuration, string> = {
  once: 'One charge',
  first_month: 'First month',
  repeating: 'A set number of months',
  forever: 'Forever',
};

const CHOICE_FALLBACK: Record<Exclude<CouponDuration, 'once'>, string> = {
  first_month: 'First month only',
  repeating: 'A set number of months',
  forever: 'Forever',
};

const TYPE_FALLBACK: Record<CouponDiscountType, string> = {
  percent: 'Percent off',
  amount: 'Fixed amount off',
};

export function statusBadge(meta: CouponsMeta | undefined, status: CouponStatus): Badge {
  const found = meta?.couponStatuses.find((s) => s.value === status);
  return found ? { label: found.label, tone: found.tone } : STATUS_FALLBACK[status];
}

/** "12.5" stays "12.5", 20 is "20", and float noise never shows. */
function percentText(percent: number): string {
  return String(Math.round(percent * 100) / 100);
}

/** "20% off" or "$100.00 off" (always with cents, as the brief shows it). */
export function formatDiscount(discount: CouponDiscount): string {
  if (discount.type === 'percent') return `${percentText(discount.percent)}% off`;
  return `${formatCents(discount.amount, discount.currency, { dropZeroCents: false })} off`;
}

/** "One charge", "First month", "3 months", "Forever". */
export function durationText(meta: CouponsMeta | undefined, duration: CouponDuration, months?: number | null): string {
  if (duration === 'repeating' && months != null && months > 0) return `${formatCount(months)} ${plural(months, 'month', 'months')}`;
  return meta?.couponDurations.find((d) => d.value === duration)?.label ?? DURATION_FALLBACK[duration];
}

/** "4 / 10", or "4 / Unlimited" with no cap. */
export function redeemedText(redeemed: number, max: number | null): string {
  return `${formatCount(redeemed)} / ${max === null ? 'Unlimited' : formatCount(max)}`;
}

/** "Nov 16" (year added when not this year), or "Never". */
export function expiresText(expiresAt: string | null, now: Date = new Date()): string {
  return expiresAt ? formatCalendarDate(expiresAt, now) : 'Never';
}

/** The deal link actions show only for active coupons the API gave a link (growth monthly or Anything). */
export function dealUrlOf(coupon: Pick<Coupon, 'status' | 'dealUrl'>): string | null {
  return coupon.status === 'active' && coupon.dealUrl ? coupon.dealUrl : null;
}

/** What the signed-in person may do with coupons: `coupons.share` and `coupons.write`. */
export type CouponAccess = { canShare: boolean; canWrite: boolean };

/**
 * The buttons under a coupon (owner decision 2026-10-03): "Copy deal link" and
 * Share need a deal link and `coupons.share`; Disable needs `coupons.write`.
 * A disabled coupon has none. The code itself is always tap-to-copy.
 */
export function couponActions(
  coupon: Pick<Coupon, 'status' | 'dealUrl'>,
  access: CouponAccess,
): { dealUrl: string | null; disable: boolean } {
  if (coupon.status !== 'active') return { dealUrl: null, disable: false };
  return { dealUrl: access.canShare ? dealUrlOf(coupon) : null, disable: access.canWrite };
}

/** Replace a coupon in the cached list by id, or put a new one first (the list is newest first). */
export function upsertCoupon(list: readonly Coupon[], coupon: Coupon): Coupon[] {
  const index = list.findIndex((c) => c.id === coupon.id);
  if (index < 0) return [coupon, ...list];
  const next = list.slice();
  next[index] = coupon;
  return next;
}

/* ---------- options for the New coupon sheet ---------- */

export type Option<V extends string> = { value: V; label: string; hint?: string; hintTone?: Tone };

/** Applies to: the API's scopes with their help; the "Anything" help is a warning, in signal red. */
export function scopeOptions(scopes: readonly CouponScopeOption[]): Option<CouponScope>[] {
  return scopes.map((s) => ({
    value: s.value,
    label: s.label,
    hint: s.help,
    hintTone: s.value === 'anything' ? 'signal' : undefined,
  }));
}

export type MonthlyDuration = Exclude<CouponDuration, 'once'>;

/** Duration choices for monthly scopes: First month only, A set number of months, Forever. */
export function durationOptions(meta: CouponsMeta | undefined): Option<MonthlyDuration>[] {
  const order: MonthlyDuration[] = ['first_month', 'repeating', 'forever'];
  return order.map((value) => ({
    value,
    label: meta?.couponDurations.find((d) => d.value === value)?.choice ?? CHOICE_FALLBACK[value],
  }));
}

export function typeOptions(meta: CouponsMeta | undefined): Option<CouponDiscountType>[] {
  const order: CouponDiscountType[] = ['percent', 'amount'];
  return order.map((value) => ({
    value,
    label: meta?.couponDiscountTypes.find((t) => t.value === value)?.label ?? TYPE_FALLBACK[value],
  }));
}

/* ---------- the form ---------- */

export type CouponForm = {
  /** Uppercased live; empty asks the server for an auto code. */
  code: string;
  label: string;
  type: CouponDiscountType;
  percent: number | null;
  /** Cents. */
  amount: number | null;
  appliesTo: CouponScope | null;
  /** Used only for monthly scopes; one-time scopes always apply once. */
  duration: MonthlyDuration;
  months: number | null;
  /** Null: unlimited. */
  maxRedemptions: number | null;
  /** Toronto calendar date, or null for no expiry. */
  expiresAt: string | null;
};

/** Errors keyed by the API's field names, so a 400's `fields` land on the same inputs. */
export type CouponField = 'code' | 'label' | 'type' | 'percent' | 'amount' | 'appliesTo' | 'duration' | 'months' | 'maxRedemptions' | 'expiresAt';
export type CouponErrors = Partial<Record<CouponField, string>>;

export function emptyCouponForm(firstScope: CouponScope | null): CouponForm {
  return {
    code: '',
    label: '',
    type: 'percent',
    percent: DEFAULT_PERCENT,
    amount: DEFAULT_AMOUNT,
    appliesTo: firstScope,
    duration: 'first_month',
    months: DEFAULT_MONTHS,
    maxRedemptions: null,
    expiresAt: null,
  };
}

/** The earliest expiry the server accepts: tomorrow in Toronto (today is refused). */
export function minExpiry(now: Date = new Date()): string {
  return addDays(todayToronto(now), 1);
}

/** Does this scope bill monthly (so the duration is a choice)? Unknown scopes are treated as one-time. */
export function isMonthlyScope(scopes: readonly CouponScopeOption[], scope: CouponScope | null): boolean {
  const found = scopes.find((s) => s.value === scope);
  return found ? !found.oneTime : false;
}

/** The checks the server makes, in form order, with its messages. */
export function couponErrors(form: CouponForm, scopes: readonly CouponScopeOption[], now: Date = new Date()): CouponErrors {
  const errors: CouponErrors = {};
  const code = form.code.trim();
  if (code !== '' && (code.length < CODE_MIN || code.length > CODE_MAX || !CODE_PATTERN.test(code))) {
    errors.code = COUPON_MESSAGES.code;
  }
  if (form.label.trim().length > LABEL_MAX) errors.label = COUPON_MESSAGES.label;
  if (form.type === 'percent') {
    if (form.percent === null || form.percent < 1 || form.percent > 100) errors.percent = COUPON_MESSAGES.percent;
  } else if (form.amount === null || form.amount <= 0) {
    errors.amount = COUPON_MESSAGES.amount;
  }
  if (form.appliesTo === null || !scopes.some((s) => s.value === form.appliesTo)) {
    errors.appliesTo = COUPON_MESSAGES.scope;
  } else if (isMonthlyScope(scopes, form.appliesTo) && form.duration === 'repeating') {
    if (form.months === null || form.months < 1) errors.months = COUPON_MESSAGES.months;
  }
  if (form.maxRedemptions !== null && form.maxRedemptions < 1) errors.maxRedemptions = COUPON_MESSAGES.max;
  if (form.expiresAt !== null && form.expiresAt < minExpiry(now)) errors.expiresAt = COUPON_MESSAGES.expirespast;
  return errors;
}

/**
 * POST /coupons body: only the fields that apply (no duration for one-time
 * scopes, months only when repeating). Call it after `couponErrors` passed,
 * with the chosen scope.
 */
export function couponInput(form: CouponForm, appliesTo: CouponScope, scopes: readonly CouponScopeOption[]): NewCouponInput {
  const code = form.code.trim();
  const label = form.label.trim();
  const input: NewCouponInput = {
    code: code === '' ? null : code,
    label: label === '' ? null : label,
    type: form.type,
    appliesTo,
    maxRedemptions: form.maxRedemptions,
    expiresAt: form.expiresAt,
  };
  if (form.type === 'percent') input.percent = form.percent ?? undefined;
  else input.amount = form.amount ?? undefined;
  if (isMonthlyScope(scopes, appliesTo)) {
    input.duration = form.duration;
    if (form.duration === 'repeating') input.months = form.months;
  }
  return input;
}

/* ---------- the live preview ---------- */

export type CouponFaceData = {
  /** Null: the server picks the code ("Auto code" in the preview). */
  code: string | null;
  discount: string;
  appliesTo: string;
  duration: string;
  redeemed: string;
  expires: string;
  label: string | null;
  badge: Badge;
};

/** A list row's text. */
export function couponFace(coupon: Coupon, meta: CouponsMeta | undefined, now: Date = new Date()): CouponFaceData {
  return {
    code: coupon.code,
    discount: formatDiscount(coupon.discount),
    appliesTo: coupon.appliesTo.label,
    duration: durationText(meta, coupon.duration, coupon.months),
    redeemed: redeemedText(coupon.redeemed, coupon.maxRedemptions),
    expires: expiresText(coupon.expiresAt, now),
    label: coupon.label,
    badge: statusBadge(meta, coupon.status),
  };
}

/** The New coupon sheet's preview, as the coupon will read in the list once created. */
export function previewFace(
  form: CouponForm,
  scopes: readonly CouponScopeOption[],
  meta: CouponsMeta | undefined,
  now: Date = new Date(),
): CouponFaceData {
  const discount: CouponDiscount =
    form.type === 'percent'
      ? { type: 'percent', percent: form.percent ?? 0 }
      : { type: 'amount', amount: form.amount ?? 0, currency: 'CAD' };
  const scope = scopes.find((s) => s.value === form.appliesTo);
  const duration: CouponDuration = scope && !scope.oneTime ? form.duration : 'once';
  const code = form.code.trim();
  const label = form.label.trim();
  return {
    code: code === '' ? null : code,
    discount: formatDiscount(discount),
    appliesTo: scope?.label ?? 'Pick what it applies to',
    duration: durationText(meta, duration, form.months),
    redeemed: redeemedText(0, form.maxRedemptions),
    expires: expiresText(form.expiresAt, now),
    label: label === '' ? null : label,
    badge: statusBadge(meta, 'active'),
  };
}
