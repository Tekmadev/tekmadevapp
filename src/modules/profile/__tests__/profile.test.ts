import { MOCK_ACCOUNTS } from '@/api/mock/fixtures/staff';
import {
  changePassword,
  hasPasswordErrors,
  PASSWORD_COPY,
  passwordErrorMessage,
  passwordLength,
  validateNewPassword,
} from '@/auth/password';
import { mockAuth } from '@/auth/mockAuth';

import { isNameChanged, nameSavedMessage, nameToSave, PROFILE_COPY } from '../logic';

describe('validateNewPassword', () => {
  it('uses the brief messages', () => {
    expect(PASSWORD_COPY.tooShort).toBe('New password must be at least 8 characters.');
    expect(PASSWORD_COPY.mismatch).toBe('The two passwords do not match.');
  });

  it('needs 8 characters and the same text twice', () => {
    expect(validateNewPassword('12345678', '12345678')).toEqual({});
    expect(validateNewPassword('1234567', '1234567')).toEqual({ password: PASSWORD_COPY.tooShort });
    expect(validateNewPassword('12345678', '12345679')).toEqual({ confirm: PASSWORD_COPY.mismatch });
    expect(validateNewPassword('', '')).toEqual({ password: PASSWORD_COPY.tooShort });
    expect(hasPasswordErrors(validateNewPassword('short', 'other'))).toBe(true);
    expect(hasPasswordErrors({})).toBe(false);
  });

  it('never trims and counts characters, not code units', () => {
    expect(validateNewPassword('  pass  ', '  pass  ')).toEqual({});
    expect(validateNewPassword('  pass  ', 'pass')).toEqual({ confirm: PASSWORD_COPY.mismatch });
    expect(passwordLength('🔑🔑🔑🔑abcd')).toBe(8);
  });
});

describe('passwordErrorMessage', () => {
  it('turns auth server refusals into plain words', () => {
    expect(passwordErrorMessage({ code: 'same_password' })).toBe(PASSWORD_COPY.same);
    expect(passwordErrorMessage({ code: 'weak_password', reasons: ['pwned'] })).toBe(PASSWORD_COPY.leaked);
    expect(passwordErrorMessage({ name: 'AuthWeakPasswordError', reasons: ['characters'] })).toBe(PASSWORD_COPY.characters);
    expect(passwordErrorMessage({ code: 'weak_password', reasons: ['length'] })).toBe(PASSWORD_COPY.weak);
    expect(passwordErrorMessage({ code: 'reauthentication_needed' })).toBe(PASSWORD_COPY.reauth);
    expect(passwordErrorMessage({ name: 'AuthSessionMissingError' })).toBe('Your session ended. Sign in again.');
    expect(passwordErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe('Could not reach the server. Check your connection.');
    expect(passwordErrorMessage({ status: 500, message: 'Database error' })).toBe(PASSWORD_COPY.failed);
  });
});

describe('changePassword (mock sign-in)', () => {
  it('changes the signed-in account, so the next sign-in needs the new password', async () => {
    const account = MOCK_ACCOUNTS.find((a) => a.email === 'manager@tekmadev.test');
    if (!account) throw new Error('fixture missing');
    const original = account.password;
    try {
      const signedIn = await mockAuth.signIn('manager@tekmadev.test', original);
      expect(signedIn.ok).toBe(true);

      expect(await changePassword('short')).toEqual({ ok: false, message: PASSWORD_COPY.tooShort });
      expect(await changePassword(original)).toEqual({ ok: false, message: PASSWORD_COPY.same });
      expect(await changePassword('a brand new one')).toEqual({ ok: true });

      expect((await mockAuth.signIn('manager@tekmadev.test', original)).ok).toBe(false);
      expect((await mockAuth.signIn('manager@tekmadev.test', 'a brand new one')).ok).toBe(true);
    } finally {
      account.password = original;
      mockAuth.signOut();
    }
  });

  it('says the session ended when nobody is signed in', async () => {
    mockAuth.signOut();
    expect(await changePassword('long enough')).toEqual({ ok: false, message: 'Your session ended. Sign in again.' });
  });
});

describe('display name', () => {
  it('trims, and an empty name clears it', () => {
    expect(nameToSave('  Maya Chen ')).toBe('Maya Chen');
    expect(nameToSave('   ')).toBeNull();
  });

  it('only counts real changes', () => {
    expect(isNameChanged('Maya Chen ', 'Maya Chen')).toBe(false);
    expect(isNameChanged('', null)).toBe(false);
    expect(isNameChanged('Maya', 'Maya Chen')).toBe(true);
    expect(isNameChanged('', 'Maya Chen')).toBe(true);
  });

  it('says what happened', () => {
    expect(nameSavedMessage('Maya')).toBe(PROFILE_COPY.nameSaved);
    expect(nameSavedMessage(null)).toBe(PROFILE_COPY.nameCleared);
    expect(PROFILE_COPY.emailHelp).toBe('Your email is your login. To change it, ask an owner.');
  });
});
