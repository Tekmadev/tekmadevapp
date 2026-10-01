import { useEffect } from 'react';

/**
 * STUB (replaced by the loader work): the JS takeover from the native splash.
 * Contract: full-screen overlay on `bg`; the four logo pieces are pulled together
 * from slightly scattered positions (500ms, soft spring), keep beating as the
 * black hole while `ready` is false, then shrink and slide toward the Home header
 * while fading, and call `onFinish` once it is gone.
 */
export function BootSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  useEffect(() => {
    if (ready) onFinish();
  }, [ready, onFinish]);
  return null;
}
