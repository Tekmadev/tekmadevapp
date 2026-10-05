import {
  BIOMETRIC_OFFER_COPY,
  biometricDescription,
  biometricOfferCopy,
  coversContent,
  LOCK_COPY,
  markAreaHeight,
  MARK_GAP,
  NO_UNLOCK_SUPPORT,
  shouldLockOnResume,
  turnOnErrorMessage,
  unlockErrorMessage,
  unlockMethodFor,
} from '../lockLogic';

describe('unlockMethodFor', () => {
  it('maps the security level', () => {
    expect(unlockMethodFor(0)).toBe('none');
    expect(unlockMethodFor(1)).toBe('credential');
    expect(unlockMethodFor(2)).toBe('biometric');
    expect(unlockMethodFor(3)).toBe('biometric');
  });
});

describe('shouldLockOnResume', () => {
  const minute = 60_000;

  it('never locks when nothing was recorded', () => {
    expect(shouldLockOnResume(null, 10 * minute, 0)).toBe(false);
  });

  it('locks once the delay has passed', () => {
    expect(shouldLockOnResume(0, minute - 1, minute)).toBe(false);
    expect(shouldLockOnResume(0, minute, minute)).toBe(true);
    expect(shouldLockOnResume(0, 20 * minute, 15 * minute)).toBe(true);
  });

  it('locks immediately with a zero delay', () => {
    expect(shouldLockOnResume(1000, 1000, 0)).toBe(true);
  });

  it('locks when the clock moved backwards', () => {
    expect(shouldLockOnResume(5 * minute, minute, 15 * minute)).toBe(true);
  });
});

describe('unlockErrorMessage', () => {
  it('stays quiet when the prompt was dismissed', () => {
    for (const platform of ['android', 'ios']) {
      expect(unlockErrorMessage('user_cancel', platform)).toBeNull();
      expect(unlockErrorMessage('system_cancel', platform)).toBeNull();
      expect(unlockErrorMessage('app_cancel', platform)).toBeNull();
    }
  });

  it('explains lockout, missing setup and plain failures', () => {
    expect(unlockErrorMessage('lockout', 'android')).toBe(LOCK_COPY.lockout);
    expect(unlockErrorMessage('not_enrolled', 'android')).toBe(LOCK_COPY.unavailable);
    expect(unlockErrorMessage('passcode_not_set', 'android')).toBe(LOCK_COPY.unavailable);
    expect(unlockErrorMessage('authentication_failed', 'android')).toBe(LOCK_COPY.failed);
    expect(unlockErrorMessage('unknown', 'android')).toBe(LOCK_COPY.failed);
  });

  it('names Face ID, Touch ID and the passcode on iPhone', () => {
    expect(unlockErrorMessage('not_enrolled', 'ios')).toBe(LOCK_COPY.unavailableIos);
    expect(unlockErrorMessage('passcode_not_set', 'ios')).toBe(
      'This iPhone has no Face ID, Touch ID or passcode set up. Sign out, then sign in with your password.',
    );
    expect(unlockErrorMessage('lockout', 'ios')).toBe(LOCK_COPY.lockout);
    expect(unlockErrorMessage('user_fallback', 'ios')).toBe(LOCK_COPY.failed);
  });

  it('turning it on never suggests signing out', () => {
    expect(turnOnErrorMessage('not_available', 'android')).toBe(biometricDescription(NO_UNLOCK_SUPPORT, 'android'));
    expect(turnOnErrorMessage('lockout', 'android')).toBe(LOCK_COPY.lockout);
    expect(turnOnErrorMessage('user_cancel', 'android')).toBeNull();
    expect(turnOnErrorMessage('not_available', 'ios')).toBe(biometricDescription(NO_UNLOCK_SUPPORT, 'ios'));
    expect(turnOnErrorMessage('not_available', 'ios')).toBe('Set up a passcode on this iPhone first, then turn this on.');
  });
});

describe('biometricDescription', () => {
  it('names what the phone has', () => {
    expect(biometricDescription({ method: 'biometric', fingerprint: true, face: false }, 'android')).toBe(
      'Open the app with your fingerprint. Your screen lock works too.',
    );
    expect(biometricDescription({ method: 'biometric', fingerprint: true, face: true }, 'android')).toBe(
      'Open the app with your fingerprint or face. Your screen lock works too.',
    );
    expect(biometricDescription({ method: 'credential', fingerprint: false, face: false }, 'android')).toBe(
      "Open the app with your phone's screen lock.",
    );
    expect(biometricDescription({ method: 'none', fingerprint: false, face: false }, 'android')).toBe(
      'Set up a fingerprint or a screen lock on this phone first, then turn this on.',
    );
  });

  it('says Face ID, Touch ID and passcode on iPhone', () => {
    expect(biometricDescription({ method: 'biometric', fingerprint: false, face: true }, 'ios')).toBe(
      'Open the app with Face ID. Your passcode works too.',
    );
    expect(biometricDescription({ method: 'biometric', fingerprint: true, face: false }, 'ios')).toBe(
      'Open the app with Touch ID. Your passcode works too.',
    );
    expect(biometricDescription({ method: 'biometric', fingerprint: false, face: false }, 'ios')).toBe(
      'Open the app with Face ID or Touch ID. Your passcode works too.',
    );
    expect(biometricDescription({ method: 'credential', fingerprint: false, face: true }, 'ios')).toBe(
      'Open the app with your iPhone passcode.',
    );
    expect(biometricDescription({ method: 'none', fingerprint: false, face: true }, 'ios')).toBe(
      'Set up Face ID or a passcode on this iPhone first, then turn this on.',
    );
  });
});

describe('biometricOfferCopy', () => {
  it('keeps the brief words on Android', () => {
    expect(biometricOfferCopy('android', null)).toBe(BIOMETRIC_OFFER_COPY);
    expect(BIOMETRIC_OFFER_COPY.title).toBe('Unlock with your fingerprint next time?');
  });

  it('says Face ID on an iPhone with Face ID (and when it cannot tell)', () => {
    for (const kind of ['Face ID', null] as const) {
      const copy = biometricOfferCopy('ios', kind);
      expect(copy.title).toBe('Unlock with Face ID next time?');
      expect(copy.body).toBe('When you come back to the app, Face ID opens it. You can change this any time in Settings.');
      expect(copy.turnedOn).toBe('Face ID unlock is on.');
      expect(copy.failed).toBe('Could not confirm your face. Try again.');
    }
  });

  it('says Touch ID on an iPhone with a home button', () => {
    const copy = biometricOfferCopy('ios', 'Touch ID');
    expect(copy.title).toBe('Unlock with Touch ID next time?');
    expect(copy.notEnrolled).toBe('Set up Touch ID in your iPhone settings first, then turn this on in Settings.');
    expect(copy.failed).toBe('Could not confirm your fingerprint. Try again.');
    expect(copy.prompt).toBe('Turn on Touch ID unlock');
  });

  it('never mentions a fingerprint sensor on iPhone', () => {
    const all = Object.values(biometricOfferCopy('ios', 'Face ID')).join(' ');
    expect(all).not.toMatch(/fingerprint/i);
  });
});

describe('coversContent (iOS app switcher cover)', () => {
  it('covers in the background, always', () => {
    expect(coversContent('background', false)).toBe(true);
    expect(coversContent('background', true)).toBe(true);
  });

  it('covers while inactive (app switcher, Control Center), but not for our own system prompt', () => {
    expect(coversContent('inactive', false)).toBe(true);
    expect(coversContent('inactive', true)).toBe(false);
  });

  it('shows the app while active or still unknown', () => {
    expect(coversContent('active', false)).toBe(false);
    expect(coversContent('unknown', false)).toBe(false);
  });
});

describe('markAreaHeight', () => {
  const mark = 100;

  it('keeps the splash position when there is room', () => {
    expect(markAreaHeight(800, 200, mark)).toBeNull();
    expect(markAreaHeight(0, 200, mark)).toBeNull();
    expect(markAreaHeight(800, 0, mark)).toBeNull();
  });

  it('moves the mark above the text when they would touch', () => {
    // Mark bottom with the gap: 300 + 50 + 24 = 374, but the text starts at 600 - 300 = 300.
    expect(markAreaHeight(600, 300, mark)).toBe(300);
    expect(600 / 2 + mark / 2 + MARK_GAP).toBeGreaterThan(300);
  });

  it('never shrinks below the mark itself', () => {
    expect(markAreaHeight(600, 580, mark)).toBe(mark);
  });
});
