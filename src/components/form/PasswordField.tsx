import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { BaseInput, type BaseInputProps } from './BaseInput';
import { FieldIconButton } from './InputChrome';

export type PasswordFieldProps = Omit<
  BaseInputProps,
  'secureTextEntry' | 'trailing' | 'autoComplete' | 'autoCapitalize' | 'autoCorrect' | 'clearable'
> & {
  /** A password being created (team member, change password): asks autofill for a new one. */
  newPassword?: boolean;
};

/** Password input with a show/hide eye. The ref is the TextInput. */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(function PasswordField(
  { newPassword = false, disabled, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <BaseInput
      ref={ref}
      {...rest}
      disabled={disabled}
      secureTextEntry={!visible}
      autoComplete={newPassword ? 'password-new' : 'password'}
      textContentType={newPassword ? 'newPassword' : 'password'}
      importantForAutofill="yes"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      trailing={
        <FieldIconButton
          icon={visible ? EyeOff : Eye}
          onPress={() => setVisible((v) => !v)}
          disabled={disabled}
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        />
      }
    />
  );
});
