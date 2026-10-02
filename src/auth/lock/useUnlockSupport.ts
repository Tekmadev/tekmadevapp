import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getUnlockSupport } from './biometrics';
import type { UnlockSupport } from './lockLogic';

/**
 * What this phone can unlock with, checked on mount and again whenever the app
 * comes back (the person may have just added a fingerprint in system settings).
 * Null until the first check answers.
 */
export function useUnlockSupport(): UnlockSupport | null {
  const [support, setSupport] = useState<UnlockSupport | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () => {
      void getUnlockSupport().then((next) => {
        if (alive) setSupport(next);
      });
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return support;
}
