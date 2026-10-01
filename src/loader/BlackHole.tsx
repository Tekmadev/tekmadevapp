import { memo, useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

import { beatFrame, KEY_REST, REDUCED_CYCLE_MS, reducedOpacity } from './keyframes';
import { MarkCanvas } from './MarkCanvas';
import { beatPose, bleedFor, MARK_RADIUS, restPose } from './pose';
import { useLoaderSettings } from './settings';

export type BlackHoleProps = {
  /** Rendered size in dp (the 2400 unit viewBox is scaled to this). */
  size: number;
  /** Fill colour; defaults to the theme gold. */
  color?: string;
  /** One beat in ms; defaults to the page loader `beatMs` setting. */
  beatMs?: number;
  /** Pause the beat (e.g. offscreen). It finishes the current beat into the whole logo first. Default false. */
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
  /** When set, the loader is announced as a progress bar with this label; otherwise it is hidden from TalkBack. */
  accessibilityLabel?: string;
};

/** Just enough canvas bleed for the outer arc tips while they spin. */
const BEAT_BLEED = bleedFor(MARK_RADIUS);

/**
 * The Tekmadev black hole (brief section 5). The inner hooks spin a full turn
 * clockwise while the outer arcs spin half a turn counterclockwise, everything
 * pulled toward the centre at the peak, then released into the logo to rest.
 *
 * A frame callback advances the beat on the UI thread and every pose comes from
 * beatFrame(), so there is no JS work and no React render per frame. Settings
 * (beat length, pulls, fade) live in shared values: when the owner drags a slider
 * the next frame uses the new value, mid beat, with no restart.
 *
 * Reduced motion: no rotation or scale; all four paths fade 1, 0.4, 1 over 1.6s.
 */
export const BlackHole = memo(function BlackHole({
  size,
  color,
  beatMs,
  paused = false,
  style,
  accessibilityLabel,
}: BlackHoleProps) {
  const { colors } = useTheme();
  const settings = useLoaderSettings();
  const reduceMotion = useReduceMotion();

  const period = useSharedValue(beatMs ?? settings.beatMs);
  const innerPull = useSharedValue(settings.innerPull);
  const outerPull = useSharedValue(settings.outerPull);
  const innerFade = useSharedValue(settings.innerFade);
  const reduced = useSharedValue(reduceMotion);
  const pausedSV = useSharedValue(paused);
  // `clock` is the raw beat position. `progress` is what the pose reads: it holds
  // at KEY_REST through the rest of the beat, because every pose there is the
  // same whole logo, so the canvas does not redraw an identical frame 40% of the time.
  const clock = useSharedValue(0);
  const progress = useSharedValue(0);

  const effectiveBeat = beatMs ?? settings.beatMs;
  useEffect(() => {
    period.set(effectiveBeat);
  }, [effectiveBeat, period]);
  useEffect(() => {
    innerPull.set(settings.innerPull);
    outerPull.set(settings.outerPull);
    innerFade.set(settings.innerFade);
  }, [settings.innerPull, settings.outerPull, settings.innerFade, innerPull, outerPull, innerFade]);
  useEffect(() => {
    // A new mode starts its own cycle from the whole logo.
    reduced.set(reduceMotion);
    clock.set(0);
    progress.set(0);
  }, [reduceMotion, reduced, clock, progress]);
  useEffect(() => {
    pausedSV.set(paused);
  }, [paused, pausedSV]);

  useFrameCallback((frame) => {
    'worklet';
    const dt = frame.timeSincePreviousFrame;
    if (dt === null || dt <= 0) return;
    const isReduced = reduced.get();
    const cycle = isReduced ? REDUCED_CYCLE_MS : Math.max(period.get(), 1);
    const p = clock.get();
    let next = p + dt / cycle;
    if (pausedSV.get()) {
      // Finish the beat into the whole logo, then hold still (no writes, no redraws).
      if (isReduced) {
        if (p === 0) return;
        if (next >= 1) next = 0;
      } else {
        if (p === 0 || p >= KEY_REST) return;
        if (next >= KEY_REST) next = KEY_REST;
      }
    } else if (next >= 1) {
      next -= Math.floor(next);
    }
    clock.set(next);
    // Setting the same number is a no-op in Reanimated, so the rest costs nothing.
    progress.set(isReduced ? next : Math.min(next, KEY_REST));
  });

  const pose = useDerivedValue(() => {
    const p = progress.get();
    if (reduced.get()) return restPose(reducedOpacity(p));
    return beatPose(
      beatFrame(p, { innerPull: innerPull.get(), outerPull: outerPull.get(), innerFade: innerFade.get() }),
    );
  });

  const a11y = accessibilityLabel
    ? ({ accessible: true, accessibilityRole: 'progressbar', accessibilityLabel } as const)
    : ({ accessible: false, importantForAccessibility: 'no-hide-descendants' } as const);

  return (
    <View style={[{ width: size, height: size }, style]} {...a11y}>
      <MarkCanvas size={size} bleed={BEAT_BLEED} color={color ?? colors.gold} pose={pose} />
    </View>
  );
});
