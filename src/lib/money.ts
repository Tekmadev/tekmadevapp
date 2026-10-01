import type { Money } from '@/api/types';

/**
 * Money is integer cents in the API. Show dollars with cents when there are
 * cents ($77.50 shows as $77.50, never rounded to $78); whole amounts may drop
 * the .00. Currency is CAD unless a row says otherwise.
 */

const formatters = new Map<string, Intl.NumberFormat>();
function nf(currency: string, fractionDigits: number) {
  const key = `${currency}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

export type MoneyFormatOptions = {
  /** Drop ".00" on whole amounts (default true). */
  dropZeroCents?: boolean;
  /** Prefix "+" on positive amounts (refunds, changes). */
  signed?: boolean;
};

/** 7750 → "$77.50"; 99700 → "$997"; other currencies show their code ("US$12.50"). */
export function formatCents(cents: number, currency = 'CAD', options: MoneyFormatOptions = {}): string {
  if (!Number.isFinite(cents)) return '';
  const { dropZeroCents = true, signed = false } = options;
  const whole = Math.round(cents) % 100 === 0;
  const text = nf(currency.toUpperCase(), whole && dropZeroCents ? 0 : 2)
    .format(Math.round(cents) / 100)
    .replace(/ /g, ' ');
  return signed && cents > 0 ? `+${text}` : text;
}

export function formatMoney(money: Money | null | undefined, options?: MoneyFormatOptions): string {
  if (!money) return '';
  return formatCents(money.amount, money.currency, options);
}

/** Charts and tight spaces: 124000 → "$1.2K", 12_450_000 → "$124.5K". Never use for exact amounts. */
export function formatCentsCompact(cents: number, currency = 'CAD'): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const symbol = currency.toUpperCase() === 'CAD' ? '$' : `${currency.toUpperCase()} `;
  const sign = dollars < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}K`;
  return formatCents(cents, currency);
}

const trim = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * Parse what someone typed into a money field into cents.
 * Accepts "77", "77.5", "77.50", "$1,204.99". Returns null when not a valid amount.
 */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '.' || cleaned === '-') return null;
  const [whole, frac = ''] = cleaned.replace('-', '').split('.');
  const cents = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return cleaned.startsWith('-') ? -cents : cents;
}

/** Cents to the editable text of a money field: 7750 → "77.50", 99700 → "997". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const text = frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}
