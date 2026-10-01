import { emailProblem, FORM_MESSAGES, validateSignIn } from '../signInForm';

describe('emailProblem', () => {
  it('asks for an email when empty', () => {
    expect(emailProblem('')).toBe(FORM_MESSAGES.emailRequired);
    expect(emailProblem('   ')).toBe(FORM_MESSAGES.emailRequired);
  });

  it('rejects shapes that cannot be an email', () => {
    expect(emailProblem('owner')).toBe(FORM_MESSAGES.emailInvalid);
    expect(emailProblem('owner@tekmadev')).toBe(FORM_MESSAGES.emailInvalid);
    expect(emailProblem('own er@tekmadev.com')).toBe(FORM_MESSAGES.emailInvalid);
  });

  it('accepts a normal address, with stray spaces around it', () => {
    expect(emailProblem(' owner@tekmadev.test ')).toBeNull();
  });
});

describe('validateSignIn', () => {
  it('passes a complete form', () => {
    expect(validateSignIn('owner@tekmadev.test', 'x')).toBeNull();
  });

  it('reports every missing field at once', () => {
    expect(validateSignIn('', '')).toEqual({
      email: FORM_MESSAGES.emailRequired,
      password: FORM_MESSAGES.passwordRequired,
    });
  });

  it('never trims the password', () => {
    expect(validateSignIn('owner@tekmadev.test', ' ')).toBeNull();
  });
});
