/** Small form helpers shared by the section sheets (pure, no React). */

/** Trimmed text, or null when blank (PATCH: null clears the field). */
export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** A copy of an error map without one field (when that field is edited). */
export function withoutField(errors: Record<string, string>, field: string): Record<string, string> {
  if (!(field in errors)) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}
