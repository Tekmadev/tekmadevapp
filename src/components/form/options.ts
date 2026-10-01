/**
 * Option helpers for Select and OptionList. Options always render their label;
 * the raw value is never shown.
 */

import type { Tone } from '@/design/tokens';

export type OptionValue = string | number;

export type SelectOption<V extends OptionValue = string> = {
  value: V;
  label: string;
  /** A second line under the label (a scope's help text). */
  hint?: string;
  /** Tone for the hint (e.g. 'signal' for the "Anything" coupon scope). */
  hintTone?: Tone;
  disabled?: boolean;
};

/** A search box appears in the option sheet above this many options. */
export const SEARCH_THRESHOLD = 8;

function fold(text: string): string {
  const lower = text.toLocaleLowerCase();
  // Accents should not matter ("Montreal" finds "Montréal"); normalize is guarded for older engines.
  return typeof lower.normalize === 'function' ? lower.normalize('NFD').replace(/[̀-ͯ]/g, '') : lower;
}

/** Options whose label or hint contains every word of the query. */
export function filterOptions<V extends OptionValue>(options: readonly SelectOption<V>[], query: string): SelectOption<V>[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...options];
  return options.filter((o) => {
    const haystack = fold(`${o.label} ${o.hint ?? ''}`);
    return words.every((w) => haystack.includes(w));
  });
}

/** Toggle one value in a multi selection (appends when turning on). */
export function toggleValue<V extends OptionValue>(selected: readonly V[], value: V): V[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

/** The chosen options in option order (values with no option are skipped: they have no label to show). */
export function selectedOptions<V extends OptionValue>(options: readonly SelectOption<V>[], selected: readonly V[]): SelectOption<V>[] {
  return options.filter((o) => selected.includes(o.value));
}
