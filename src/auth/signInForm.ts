/**
 * Client-side checks for the sign-in and reset forms. They only catch what the
 * server would reject anyway (an empty field, an email without an @), so the
 * person gets the reason inline instead of a round trip and "Wrong email or password.".
 */

export const FORM_MESSAGES = {
  emailRequired: 'Enter your email.',
  emailInvalid: 'Enter a valid email address.',
  passwordRequired: 'Enter your password.',
} as const;

/** One @, something on both sides, a dot in the domain, no spaces. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailProblem(email: string): string | null {
  const value = email.trim();
  if (!value) return FORM_MESSAGES.emailRequired;
  if (!EMAIL_SHAPE.test(value)) return FORM_MESSAGES.emailInvalid;
  return null;
}

export type SignInFieldErrors = { email?: string; password?: string };

/** Null when the form can be sent. The password is never trimmed: spaces may be part of it. */
export function validateSignIn(email: string, password: string): SignInFieldErrors | null {
  const errors: SignInFieldErrors = {};
  const emailError = emailProblem(email);
  if (emailError) errors.email = emailError;
  if (password.length === 0) errors.password = FORM_MESSAGES.passwordRequired;
  return errors.email || errors.password ? errors : null;
}
