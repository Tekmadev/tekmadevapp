import {
  biometricDescription,
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
    expect(unlockErrorMessage('user_cancel')).toBeNull();
    expect(unlockErrorMessage('system_cancel')).toBeNull();
    expect(unlockErrorMessage('app_cancel')).toBeNull();
  });

  it('explains lockout, missing setup and plain failures', () => {
    expect(unlockErrorMessage('lockout')).toBe(LOCK_COPY.lockout);
    expect(unlockErrorMessage('not_enrolled')).toBe(LOCK_COPY.unavailable);
    expect(unlockErrorMessage('passcode_not_set')).toBe(LOCK_COPY.unavailable);
    expect(unlockErrorMessage('authentication_failed')).toBe(LOCK_COPY.failed);
    expect(unlockErrorMessage('unknown')).toBe(LOCK_COPY.failed);
  });

  it('turning it on never suggests signing out', () => {
    expect(turnOnErrorMessage('not_available', 'android')).toBe(biometricDescription(NO_UNLOCK_SUPPORT, 'android'));
    expect(turnOnErrorMessage('lockout', 'android')).toBe(LOCK_COPY.lockout);
    expect(turnOnErrorMessage('user_cancel', 'android')).toBeNull();
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
    expect(biometricDescription({ method: 'biometric', fingerprint: false, face: true }, 'ios')).toBe(
      'Open the app with your face. Your passcode works too.',
    );
    expect(biometricDescription({ method: 'credential', fingerprint: false, face: false }, 'android')).toBe(
      "Open the app with your phone's screen lock.",
    );
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
