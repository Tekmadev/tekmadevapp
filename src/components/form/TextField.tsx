import { forwardRef } from 'react';
import type { TextInput } from 'react-native';

import { BaseInput, type BaseInputProps } from './BaseInput';

export type TextFieldProps = BaseInputProps;

/**
 * Single line text input with a floating label (brief section 6).
 *
 * The label floats from the placeholder position to a small label on focus or
 * when filled; the box border turns gold on focus and signal on error. All
 * TextInput props pass through (autoCapitalize, keyboardType, inputMode,
 * returnKeyType, onSubmitEditing, maxLength...), and the ref is the TextInput.
 *
 *   <TextField label="Business name" value={name} onChangeText={setName} error={errors.businessName} />
 *   <TextField label="Slug" prefix="tekmadev.com/" monospace autoCapitalize="none" />
 *   <TextField label="Meta title" softLimit={60} value={title} onChangeText={setTitle} />
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(props, ref) {
  return <BaseInput ref={ref} {...props} />;
});
