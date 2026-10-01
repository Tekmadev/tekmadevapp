/**
 * Chip list rules for ChipsInput (keywords, tags): commas and new lines finish
 * a chip, chips are trimmed, duplicates are ignored without regard to case, and
 * the list never grows past its maximum.
 */

const SEPARATORS = /[,\n]/;

/** Split typed text into finished chips and the unfinished rest after the last separator. */
export function splitChipText(text: string): { complete: string[]; rest: string } {
  if (!SEPARATORS.test(text)) return { complete: [], rest: text };
  const parts = text.split(SEPARATORS);
  const rest = parts.pop() ?? '';
  return { complete: parts.map((p) => p.trim()).filter(Boolean), rest };
}

export type AddChipsOptions = {
  maxItems?: number;
  maxLength?: number;
  normalize?: (raw: string) => string;
};

export type AddChipsResult = {
  chips: string[];
  /** Chips that were already in the list (shown as a gentle hint). */
  duplicates: string[];
  /** Chips dropped because the list was full. */
  overflow: string[];
};

const keyOf = (chip: string) => chip.toLocaleLowerCase();

export function addChips(existing: readonly string[], incoming: readonly string[], options: AddChipsOptions = {}): AddChipsResult {
  const { maxItems, maxLength, normalize } = options;
  const chips = [...existing];
  const seen = new Set(chips.map(keyOf));
  const duplicates: string[] = [];
  const overflow: string[] = [];
  for (const raw of incoming) {
    let chip = (normalize ? normalize(raw) : raw).trim();
    if (maxLength != null) chip = chip.slice(0, maxLength).trim();
    if (!chip) continue;
    if (seen.has(keyOf(chip))) {
      duplicates.push(chip);
      continue;
    }
    if (maxItems != null && chips.length >= maxItems) {
      overflow.push(chip);
      continue;
    }
    seen.add(keyOf(chip));
    chips.push(chip);
  }
  return { chips, duplicates, overflow };
}

export function removeChip(existing: readonly string[], index: number): string[] {
  return existing.filter((_, i) => i !== index);
}
