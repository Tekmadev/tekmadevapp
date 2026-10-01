import { centsToInput, formatCents, parseDollarsToCents } from '@/lib/money';

/**
 * Text rules for NumberField. Money is typed as dollars with up to 2 decimals
 * and stored as integer cents; nothing is ever rounded (77.50 stays 77.50, a
 * third decimal is simply not accepted).
 */

export type NumberMode = 'integer' | 'money';

/** Large enough for any real amount, small enough to stay an exact integer. */
const MAX_WHOLE_DIGITS = 9;

const trimLeadingZeros = (whole: string) => whole.replace(/^0+(?=\d)/, '');

/**
 * Keep what a money field may hold while typing: digits, one decimal point and
 * at most 2 decimals. The last comma followed by at most two digits is read as a
 * decimal comma (French keyboards type "77,5"); other commas are thousands
 * separators and dropped.
 */
export function sanitizeMoneyInput(text: string): string {
  let s = text.replace(/[^\d.,]/g, '');
  if (!s.includes('.')) {
    const lastComma = s.lastIndexOf(',');
    const after = s.slice(lastComma + 1);
    if (lastComma >= 0 && /^\d{0,2}$/.test(after)) s = `${s.slice(0, lastComma)}.${after}`;
  }
  s = s.replace(/,/g, '');
  const dot = s.indexOf('.');
  if (dot === -1) return trimLeadingZeros(s).slice(0, MAX_WHOLE_DIGITS);
  const whole = trimLeadingZeros(s.slice(0, dot)).slice(0, MAX_WHOLE_DIGITS);
  const frac = s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return `${whole}.${frac}`;
}

/** Digits only (and a leading minus when negatives are allowed). */
export function sanitizeIntegerInput(text: string, allowNegative = false): string {
  const negative = allowNegative && text.trim().startsWith('-');
  const digits = trimLeadingZeros(text.replace(/\D/g, '')).slice(0, MAX_WHOLE_DIGITS);
  return negative ? `-${digits}` : digits;
}

/** The value a sanitized text holds, or null when it holds none yet. */
export function parseNumberInput(text: string, mode: NumberMode): number | null {
  if (mode === 'money') return parseDollarsToCents(text);
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

/** The editable text for a stored value. */
export function numberToInput(value: number | null | undefined, mode: NumberMode): string {
  if (value == null || !Number.isFinite(value)) return '';
  return mode === 'money' ? centsToInput(value) : String(Math.trunc(value));
}

export type RangeRule = {
  mode: NumberMode;
  /** Integer units, or cents in money mode. */
  min?: number;
  max?: number;
  required?: boolean;
};

/**
 * The inline error for a value, or null when it is fine. In money mode min and
 * max are cents and the message shows dollars ("Enter an amount from $1 to $500.").
 */
export function numberRangeError(value: number | null, rule: RangeRule): string | null {
  const money = rule.mode === 'money';
  if (value == null) {
    if (!rule.required) return null;
    return money ? 'Enter an amount.' : 'Enter a number.';
  }
  const show = (n: number) => (money ? formatCents(n) : String(n));
  const { min, max } = rule;
  const below = min != null && value < min;
  const above = max != null && value > max;
  if (!below && !above) return null;
  if (min != null && max != null) {
    return money ? `Enter an amount from ${show(min)} to ${show(max)}.` : `Enter a number from ${show(min)} to ${show(max)}.`;
  }
  if (below && min != null) return money ? `Enter at least ${show(min)}.` : `Enter ${show(min)} or more.`;
  if (above && max != null) return money ? `Enter at most ${show(max)}.` : `Enter ${show(max)} or less.`;
  return null;
}
