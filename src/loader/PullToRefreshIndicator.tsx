import { memo, useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import {
  cancelAnimation,
  ReduceMotion,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { haptics } from '@/design/haptics';
import { durations, easeStandard, springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

import { beatFrame, KEY_REST, REDUCED_CYCLE_MS, reducedOpacity, scatterFrame } from './keyframes';
import { MarkCanvas } from './MarkCanvas';
import {
  beatPose,
  bleedFor,
  MARK_RADIUS,
  OVERPULL_MAX,
  overpullScale,
  pullOpacity,
  restPose,
  scatterPose,
  scatterRadius,
} from './pose';
import { useLoaderSettings } from './settings';

export type PullToRefreshIndicatorProps = {
  /**
   * Pull progress driven by the Screen gesture on the UI thread: 0 = nothing,
   * 1 = the trigger point (logo locks together, haptic tick), >1 = overpull.
   */
  pull: SharedValue<number>;
  /** True from release until the data lands (beat), then it shrinks away with a spring. */
  refreshing: boolean;
  /** Default 36dp. */
  size?: number;
  /**
   * Fire the medium haptic when the logo locks at the trigger point. Default true.
   * Turn it off only if the caller already plays that haptic itself.
   */
  lockHaptic?: boolean;
};

/** Below this the lock haptic re-arms, so a finger hovering at the trigger point does not buzz. */
const REARM_BELOW = 0.85;
/** While shrinking away the mark stays solid until it is this small, then fades with it. */
const EXIT_FADE_FROM = 0.35;
/**
 * After shrinking away it stays hidden until the pull is back under this, so the
 * scattered pieces do not ghost in while the content springs back up.
 */
const SETTLED_BELOW = 0.02;

const MODE_PULL = 0;
const MODE_BEAT = 1;
const MODE_LEAVE = 2;
const MODE_GONE = 3;

/** Room for the fully scattered pieces and for overpull. */
const BLEED = bleedFor(Math.max(scatterRadius(scatterFrame(0)), MARK_RADIUS * (1 + OVERPULL_MAX)));

/** The logo locking together at the trigger point. Runs on the JS thread. */
function lockTick() {
  haptics.medium();
}

/**
 * The black hole as pull to refresh. While the user pulls, the four pieces start
 * scattered (outer arcs rotated out and pushed away, hooks turned and faded) and
 * are pulled together in proportion to the pull; at the trigger point the logo
 * locks with a haptic tick, and overpull swells it a little. On release it beats
 * (page `beatMs`) until the data lands, then shrinks away with a spring.
 *
 * Everything reads `pull` on the UI thread, so tracking the finger costs no JS
 * work and no React render. Reduced motion: the whole logo fades in with the
 * pull, pulses while refreshing, and fades out.
 */
export const PullToRefreshIndicator = memo(function PullToRefreshIndicator({
  pull,
  refreshing,
  size = 36,
  lockHaptic = true,
}: PullToRefreshIndicatorProps) {
  const { colors } = useTheme();
  const settings = useLoaderSettings();
  const reduceMotion = useReduceMotion();

  const mode = useSharedValue(MODE_PULL);
  const reduced = useSharedValue(reduceMotion);
  const hapticOn = useSharedValue(lockHaptic);
  const period = useSharedValue(settings.beatMs);
  const innerPull = useSharedValue(settings.innerPull);
  const outerPull = useSharedValue(settings.outerPull);
  const innerFade = useSharedValue(settings.innerFade);
  const clock = useSharedValue(0);
  const progress = useSharedValue(0);
  // Overpull scale at release, relaxing to 1 while it beats.
  const settle = useSharedValue(1);
  // 1 = shown, 0 = shrunk away.
  const presence = useSharedValue(1);
  const armed = useSharedValue(true);

  useEffect(() => {
    reduced.set(reduceMotion);
  }, [reduceMotion, reduced]);
  useEffect(() => {
    hapticOn.set(lockHaptic);
  }, [lockHaptic, hapticOn]);
  useEffect(() => {
    period.set(settings.beatMs);
    innerPull.set(settings.innerPull);
    outerPull.set(settings.outerPull);
    innerFade.set(settings.innerFade);
  }, [settings.beatMs, settings.innerPull, settings.outerPull, settings.innerFade, period, innerPull, outerPull, innerFade]);

  useAnimatedReaction(
    () => pull.get(),
    (now, previous) => {
      const current = mode.get();
      if (current === MODE_GONE) {
        // The content has sprung back: the next pull starts from scratch.
        if (now <= SETTLED_BELOW) {
          mode.set(MODE_PULL);
          armed.set(true);
        }
        return;
      }
      if (current !== MODE_PULL) return;
      // The lock haptic: once per crossing of the trigger point, with a little hysteresis.
      if (now < REARM_BELOW) {
        armed.set(true);
        return;
      }
      if (now >= 1 && previous !== null && previous < 1 && armed.get()) {
        armed.set(false);
        if (hapticOn.get()) scheduleOnRN(lockTick);
      }
    },
  );

  // The beat clock only runs while refreshing or leaving. It starts switched off:
  // every screen with pull to refresh mounts one of these, and any active frame
  // callback keeps the UI thread drawing every frame, even when it does nothing.
  const beatClock = useFrameCallback((frame) => {
    'worklet';
    const current = mode.get();
    if (current === MODE_PULL || current === MODE_GONE) return;
    const dt = frame.timeSincePreviousFrame;
    if (dt === null || dt <= 0) return;
    const isReduced = reduced.get();
    const cycle = isReduced ? REDUCED_CYCLE_MS : Math.max(period.get(), 1);
    let next = clock.get() + dt / cycle;
    if (next >= 1) next -= Math.floor(next);
    clock.set(next);
    progress.set(isReduced ? next : Math.min(next, KEY_REST));
  }, false);
  const refreshingRef = useRef(refreshing);
  // Called from the UI thread once it has shrunk away; a refresh that started since keeps it running.
  const stopClock = useCallback(() => {
    if (!refreshingRef.current) beatClock.setActive(false);
  }, [beatClock]);

  useEffect(() => {
    refreshingRef.current = refreshing;
    if (refreshing) beatClock.setActive(true);
    scheduleOnUI((isRefreshing: boolean) => {
      'worklet';
      const current = mode.get();
      if (isRefreshing) {
        if (current === MODE_PULL || current === MODE_GONE) {
          // Start the beat from the locked logo, keeping any overpull swell to relax away.
          settle.set(current === MODE_PULL && !reduced.get() ? overpullScale(pull.get()) : 1);
          clock.set(0);
          progress.set(0);
        }
        cancelAnimation(presence);
        // Coming back while (or after) shrinking away grows it in again; from a pull it is already whole.
        presence.set(
          current === MODE_LEAVE || current === MODE_GONE
            ? withSpring(1, { ...springs.default, reduceMotion: ReduceMotion.Never })
            : 1,
        );
        settle.set(withSpring(1, { ...springs.default, reduceMotion: ReduceMotion.Never }));
        mode.set(MODE_BEAT);
        return;
      }
      if (current !== MODE_BEAT) return;
      mode.set(MODE_LEAVE);
      const gone = (finished?: boolean) => {
        'worklet';
        if (!finished) return;
        settle.set(1);
        clock.set(0);
        progress.set(0);
        armed.set(true);
        // Hidden until the pull has settled back to rest (see SETTLED_BELOW).
        mode.set(pull.get() <= SETTLED_BELOW ? MODE_PULL : MODE_GONE);
        scheduleOnRN(stopClock);
      };
      presence.set(
        reduced.get()
          ? withTiming(0, { duration: durations.base, easing: easeStandard, reduceMotion: ReduceMotion.Never }, gone)
          : // Clamped: it collapses to nothing and stops, rather than wobbling around zero.
            withSpring(0, { ...springs.default, overshootClamping: true, reduceMotion: ReduceMotion.Never }, gone),
      );
    }, refreshing);
  }, [refreshing, mode, reduced, settle, clock, progress, presence, armed, pull, beatClock, stopClock]);

  const pose = useDerivedValue(() => {
    const current = mode.get();
    if (current === MODE_GONE) return restPose(0);
    const isReduced = reduced.get();
    if (current === MODE_PULL) {
      const k = pull.get();
      const opacity = pullOpacity(k);
      if (isReduced) return restPose(opacity);
      return scatterPose(scatterFrame(Math.min(k, 1)), overpullScale(k), opacity);
    }
    const shown = presence.get();
    if (isReduced) return restPose(reducedOpacity(progress.get()) * Math.min(Math.max(shown, 0), 1));
    const fade = Math.min(Math.max(shown / EXIT_FADE_FROM, 0), 1);
    const frame = beatFrame(progress.get(), {
      innerPull: innerPull.get(),
      outerPull: outerPull.get(),
      innerFade: innerFade.get(),
    });
    return beatPose(frame, settle.get() * Math.max(shown, 0), fade);
  });

  return (
    <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <MarkCanvas size={size} bleed={BLEED} color={colors.gold} pose={pose} />
    </View>
  );
});
