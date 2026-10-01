import { forwardRef } from 'react';
import type { TextInput } from 'react-native';

import { AUTOSAVE_MS, useAutosave } from './autosave';
import { BaseInput, type BaseInputProps } from './BaseInput';

export { clearDraft, isDraftNewer, useAutosave, useDraftRestore } from './autosave';
export type { Autosave, DraftRestore, StoredDraft } from './autosave';

export type TextAreaProps = BaseInputProps & {
  /** Lines shown when empty (default 3). */
  minLines?: number;
  /** The box grows with the text up to this many lines, then scrolls (default 8). */
  maxLines?: number;
  /**
   * Save what the user types to a local draft under this key (every few seconds
   * while typing, and on blur). Pair with useDraftRestore(key, ...) to offer
   * "Restore your unsaved changes?" and clear it with clearDraft(key) after saving.
   */
  autosaveKey?: string;
  autosaveMs?: number;
};

/** Multi-line TextField that grows with its text, with optional local autosave. */
export const TextArea = forwardRef<TextInput, TextAreaProps>(function TextArea(
  { autosaveKey, autosaveMs = AUTOSAVE_MS, minLines = 3, maxLines = 8, onChangeText, onBlur, ...rest },
  ref,
) {
  const autosave = useAutosave<string>(autosaveKey, autosaveMs);
  return (
    <BaseInput
      ref={ref}
      {...rest}
      multiline
      minLines={minLines}
      maxLines={maxLines}
      onChangeText={(text) => {
        autosave.schedule(text);
        onChangeText?.(text);
      }}
      onBlur={(e) => {
        autosave.flush();
        onBlur?.(e);
      }}
    />
  );
});
