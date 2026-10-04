import type { CommissionSplit } from '@/api/schemas/settings';

/**
 * The default commission split (the website's docs/admin-api/staff.md
 * section 6): finder and booker percent for a client created from a lead,
 * each 0 to 100 with at most two decimals, adding up to exactly 100. Pure
 * rules for the Settings card, unit tested.
 */

export const COMMISSION_COPY = {
  title: 'Commission split',
  finder: 'Finder',
  booker: 'Booker',
  finderHelp: 'Found the lead and added it.',
  bookerHelp: 'Booked the call.',
  help: 'How credit is split when a client is created from a lead. The same person in both roles gets 100. Existing credit never changes.',
  readOnly: 'Only an owner can change the split.',
  save: 'Save split',
  saved: 'Commission split saved. It applies to clients created from now on.',
  range: 'Enter a number from 0 to 100, with at most two decimals.',
  total: 'Finder and booker must add up to 100.',
} as const;

/** A percent in hundredths when it is 0 to 100 with at most two decimals, else null. */
export function splitHundredths(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const hundredths = Math.round(value * 100);
  return Math.abs(value * 100 - hundredths) < 1e-6 ? hundredths : null;
}

/** "50", "33.33", "12.5": what was typed, as a number; empty or not a number is null. */
export function parsePercent(text: string): number | null {
  const clean = text.replace('%', '').replace(',', '.').trim();
  if (!/^\d{1,3}(\.\d*)?$|^\.\d+$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** Up to two decimals, trailing zeros dropped: "50", "33.33". */
export function percentText(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

/** "Finder 50% · Booker 50%". */
export const splitSummary = (split: CommissionSplit) => `${COMMISSION_COPY.finder} ${percentText(split.finder)}% · ${COMMISSION_COPY.booker} ${percentText(split.booker)}%`;

/** The other side of a valid percent ("40" makes "60"), or null when the typed value is not one. */
export function complement(text: string): string | null {
  const hundredths = splitHundredths(parsePercent(text));
  return hundredths === null ? null : percentText((10_000 - hundredths) / 100);
}

export type SplitErrors = { finder?: string; booker?: string };

/** The server's checks: each side 0 to 100 with two decimals at most, then exactly 100 together. */
export function splitErrors(finder: string, booker: string): SplitErrors {
  const f = splitHundredths(parsePercent(finder));
  const b = splitHundredths(parsePercent(booker));
  const errors: SplitErrors = {};
  if (f === null) errors.finder = COMMISSION_COPY.range;
  if (b === null) errors.booker = COMMISSION_COPY.range;
  if (f !== null && b !== null && f + b !== 10_000) {
    errors.finder = COMMISSION_COPY.total;
    errors.booker = COMMISSION_COPY.total;
  }
  return errors;
}

/** The PUT body, after splitErrors found nothing. */
export function splitInput(finder: string, booker: string): CommissionSplit {
  return {
    finder: (splitHundredths(parsePercent(finder)) ?? 0) / 100,
    booker: (splitHundredths(parsePercent(booker)) ?? 0) / 100,
  };
}

/** Whether the typed split is the saved one. */
export function sameSplit(finder: string, booker: string, saved: CommissionSplit): boolean {
  return splitHundredths(parsePercent(finder)) === splitHundredths(saved.finder) && splitHundredths(parsePercent(booker)) === splitHundredths(saved.booker);
}
