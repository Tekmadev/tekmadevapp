import { memo, useEffect } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

import { beatFrame, KEY_REST, type BeatParams } from './keyframes';
import { MarkCanvas } from './MarkCanvas';
import { beatPose, bleedFor, MARK_RADIUS, restPose } from './pose';

/** One breath every 6s. */
export const BREATH_CYCLE_MS = 6000;
/** The beat inside each breath, slower than the loader's so it reads as calm. */
export const BREATH_BEAT_MS = 3000;
/** The first breath comes this long after the screen appears, not on arrival. */
const FIRST_BREATH_MS = 1500;
/** A gentle pull: the hooks barely draw in and barely dim. */
export const BREATH_PARAMS: BeatParams = { innerPull: 0.94, outerPull: 0.985, innerFade: 0.9 };

const BLEED = bleedFor(MARK_RADIUS);

export type BreathingMarkProps = {
  size: number;
  /** Defaults to the theme gold. */
  color?: string;
};

/**
 * The sign-in hero mark: the black hole beat, slowed down and softened, once
 * every 6s, then a long rest as the plain logo. Same UI-thread clock as the
 * loader, so typing never stutters it. Reduced motion: the still logo.
 */
export const BreathingMark = memo(function BreathingMark({ size, color }: BreathingMarkProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const reduced = useSharedValue(reduceMotion);
  // Milliseconds into the current breath cycle; starts in the rest so the first breath waits.
  const elapsed = useSharedValue(BREATH_CYCLE_MS - FIRST_BREATH_MS);
  // Beat progress the pose reads. It holds at KEY_REST through the long rest (every
  // pose there is the same logo), so the canvas only redraws while the mark moves.
  const progress = useSharedValue(KEY_REST);

  useEffect(() => {
    reduced.set(reduceMotion);
  }, [reduceMotion, reduced]);

  useFrameCallback((frame) => {
    'worklet';
    const dt = frame.timeSincePreviousFrame;
    if (dt === null || dt <= 0 || reduced.get()) return;
    let next = elapsed.get() + dt;
    if (next >= BREATH_CYCLE_MS) next %= BREATH_CYCLE_MS;
    elapsed.set(next);
    progress.set(Math.min(next / BREATH_BEAT_MS, KEY_REST));
  });

  const pose = useDerivedValue(() => {
    if (reduced.get()) return restPose();
    return beatPose(beatFrame(progress.get(), BREATH_PARAMS));
  });

  return (
    <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <MarkCanvas size={size} bleed={BLEED} color={color ?? colors.gold} pose={pose} />
    </View>
  );
});
