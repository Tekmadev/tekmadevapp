import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  ReduceMotion,
  withDelay,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
  type LayoutAnimation,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

/**
 * Motion language: things are pulled into place, never thrown.
 * Springs for anything that moves; short eased timings for fades and colour.
 */

export const springs = {
  default: { damping: 18, stiffness: 180, mass: 1 },
  snappy: { damping: 22, stiffness: 320, mass: 1 },
  soft: { damping: 20, stiffness: 120, mass: 1 },
} as const satisfies Record<string, WithSpringConfig>;

/** cubic-bezier(0.2, 0, 0, 1): fades and colour changes. */
export const easeStandard = Easing.bezier(0.2, 0, 0, 1);
/** cubic-bezier(0.1, 0.6, 0.2, 1): the top progress hairline. */
export const easeHairline = Easing.bezier(0.1, 0.6, 0.2, 1);
/** cubic-bezier(0.55, 0, 0.2, 1): the black hole beat (applied per keyframe segment). */
export const easeBeat = Easing.bezier(0.55, 0, 0.2, 1);

export const durations = {
  fast: 180,
  base: 220,
  slow: 240,
  countUp: 600,
  toast: 3500,
  holdToConfirm: 1200,
  loaderFadeIn: 250,
} as const;

export const fade = (duration: number = durations.base): WithTimingConfig => ({
  duration,
  easing: easeStandard,
});

/** Press feedback: scale to 0.97 with the snappy spring. */
export const PRESS_SCALE = 0.97;

/** List stagger: 30ms per item, first 8 items only. */
export const STAGGER_MS = 30;
export const STAGGER_MAX = 8;
export const staggerDelay = (index: number) => (index < STAGGER_MAX ? index * STAGGER_MS : 0);

/**
 * Enter: content is pulled into place from scale 0.96, opacity 0, translateY 8.
 * Use as `entering={enterPull(index)}` on an Animated.View.
 * Reanimated skips layout animations itself when the system reduces motion.
 */
export function enterPull(index = 0): LayoutAnimation | ((v: EntryAnimationsValues) => LayoutAnimation) {
  const delay = staggerDelay(index);
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 8 }, { scale: 0.96 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: durations.slow, easing: easeStandard }, undefined)),
        transform: [
          { translateY: withDelay(delay, withSpring(0, springs.default)) },
          { scale: withDelay(delay, withSpring(1, springs.default)) },
        ],
      },
    };
  };
}

export { ReduceMotion };

let reduceMotionCache = false;
const listeners = new Set<(value: boolean) => void>();
let subscribed = false;

function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((value) => {
      reduceMotionCache = value;
      listeners.forEach((l) => l(value));
    })
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    reduceMotionCache = value;
    listeners.forEach((l) => l(value));
  });
}

/** Last known "Remove animations" state, for non-React code. */
export function isReduceMotion() {
  ensureSubscribed();
  return reduceMotionCache;
}

function subscribeReduceMotion(onChange: () => void) {
  ensureSubscribed();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * Live "Remove animations" (Android) state. When true: no rotation or scale on the
 * loader (opacity pulse instead), no list staggers, no parallax, no count-ups.
 */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribeReduceMotion, isReduceMotion);
}

