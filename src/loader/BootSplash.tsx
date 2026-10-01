import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { easeStandard, springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout } from '@/design/tokens';

import { beatFrame, KEY_REST, REDUCED_CYCLE_MS, reducedOpacity, scatterFrame } from './keyframes';
import { MarkCanvas } from './MarkCanvas';
import { addScatter, beatPose, bleedFor, MARK_RADIUS, restPose, scatterPose, scatterRadius } from './pose';
import { useLoaderSettings } from './settings';

/**
 * The native Android 12+ splash draws `splash-*.png` at 112dp wide (app.json
 * `imageWidth`), and the mark fills 90% of that image (scripts/generate-icons.mjs).
 * The JS mark must sit at exactly this size, centred in the window, so the handoff
 * from the native splash is invisible. Change these together with those two files.
 */
export const NATIVE_SPLASH_IMAGE_DP = 112;
export const NATIVE_SPLASH_MARK_FRACTION = 0.9;
export const SPLASH_MARK_SIZE = NATIVE_SPLASH_IMAGE_DP * NATIVE_SPLASH_MARK_FRACTION;

/** Where the mark lands in the Home header: a 28dp mark at the gutter, centred on the 56dp header row. */
export const HEADER_MARK = { size: 28, left: layout.gutter, centerY: layout.headerHeight / 2 } as const;

/** The pieces start this scattered and are pulled together into the mark. */
const INTRO_FROM = scatterFrame(0.55);
const INTRO_MS = 500;
const INTRO_SPRING = { ...springs.soft, reduceMotion: ReduceMotion.Never };
/** The way out: the mark slides and shrinks into the header while the overlay fades. */
const EXIT_MS = 450;
/** The mark holds solid for the first part of the slide, then fades as it lands. */
const EXIT_MARK_FADE_DELAY = 150;
const REDUCED_EXIT_MS = 250;
const easeIn = Easing.bezier(0.4, 0, 1, 1);

const BLEED = bleedFor(Math.max(MARK_RADIUS, scatterRadius(INTRO_FROM)));

const STAGE_INTRO = 0;
const STAGE_WAIT = 1;
const STAGE_EXIT = 2;
const STAGE_DONE = 3;

type ExitTarget = { centred: boolean; x: number; y: number; scale: number };

export type BootSplashProps = {
  /** Session restore (and GET /me) finished: the app underneath can be shown. */
  ready: boolean;
  /** Called exactly once, after the overlay is fully gone. Unmount it then. */
  onFinish: () => void;
  /**
   * Where the mark goes on the way out. `header` (default): it shrinks and slides
   * into the Home header. `center`: it stays put and fades (sign in, whose hero
   * mark is mid screen). Or a window point and size in dp to land on exactly.
   */
  exitTo?: 'header' | 'center' | { x: number; y: number; size: number };
};

/**
 * The JS takeover from the native splash (brief 8.1).
 *
 * 1. First frame: the overlay on `bg` with the mark at the native splash's size
 *    and position. The pieces start slightly scattered and are pulled together
 *    into the mark (soft spring, 500ms) while the native splash fades away on top.
 * 2. If `ready` is still false, the mark beats as the black hole (page settings).
 * 3. Once ready (and the pull together is done): the mark shrinks and slides into
 *    the Home header while the overlay fades (about 450ms), touches pass through
 *    from the first frame of the fade, then `onFinish` runs once.
 *
 * The whole sequence is a small state machine on the UI thread, so a busy JS
 * thread at boot cannot stall or stutter it. Reduced motion: no pull together and
 * no slide; the mark pulses while waiting and the overlay fades out in 250ms.
 */
export const BootSplash = memo(function BootSplash({ ready, onFinish, exitTo = 'header' }: BootSplashProps) {
  const { colors } = useTheme();
  const settings = useLoaderSettings();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [leaving, setLeaving] = useState(false);

  // onFinish runs once, whatever the parent re-renders with.
  const onFinishRef = useRef(onFinish);
  const finishedRef = useRef(false);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinishRef.current();
  }, []);

  const stage = useSharedValue(STAGE_INTRO);
  const started = useSharedValue(false);
  const elapsed = useSharedValue(0);
  // How scattered the pieces still are: 1 = the intro pose, 0 = the mark.
  const scatter = useSharedValue(reduceMotion ? 0 : 1);
  const beating = useSharedValue(false);
  const clock = useSharedValue(0);
  const progress = useSharedValue(0);
  const readySV = useSharedValue(ready);
  const reduced = useSharedValue(reduceMotion);
  const period = useSharedValue(settings.beatMs);
  const innerPull = useSharedValue(settings.innerPull);
  const outerPull = useSharedValue(settings.outerPull);
  const innerFade = useSharedValue(settings.innerFade);
  const bgOpacity = useSharedValue(1);
  const markOpacity = useSharedValue(1);
  const move = useSharedValue(0);
  const box = useSharedValue({ width: window.width, height: window.height });
  const target = useSharedValue<ExitTarget>({ centred: true, x: 0, y: 0, scale: 1 });

  useEffect(() => {
    readySV.set(ready);
  }, [ready, readySV]);
  useEffect(() => {
    reduced.set(reduceMotion);
    if (reduceMotion) scatter.set(0);
  }, [reduceMotion, reduced, scatter]);
  useEffect(() => {
    period.set(settings.beatMs);
    innerPull.set(settings.innerPull);
    outerPull.set(settings.outerPull);
    innerFade.set(settings.innerFade);
  }, [settings.beatMs, settings.innerPull, settings.outerPull, settings.innerFade, period, innerPull, outerPull, innerFade]);

  const targetX = typeof exitTo === 'object' ? exitTo.x : -1;
  const targetY = typeof exitTo === 'object' ? exitTo.y : -1;
  const targetSize = typeof exitTo === 'object' ? exitTo.size : -1;
  const targetKind = typeof exitTo === 'object' ? 'point' : exitTo;
  useEffect(() => {
    if (targetKind === 'center') {
      target.set({ centred: true, x: 0, y: 0, scale: 0.96 });
    } else if (targetKind === 'point') {
      target.set({ centred: false, x: targetX, y: targetY, scale: targetSize / SPLASH_MARK_SIZE });
    } else {
      target.set({
        centred: false,
        x: HEADER_MARK.left + HEADER_MARK.size / 2,
        y: insets.top + HEADER_MARK.centerY,
        scale: HEADER_MARK.size / SPLASH_MARK_SIZE,
      });
    }
  }, [targetKind, targetX, targetY, targetSize, insets.top, target]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      box.set({ width, height });
    },
    [box],
  );

  useFrameCallback((frame) => {
    'worklet';
    const st = stage.get();
    if (st === STAGE_DONE) return;
    const dt = frame.timeSincePreviousFrame ?? 0;
    const isReduced = reduced.get();

    if (st === STAGE_INTRO) {
      if (!started.get()) {
        started.set(true);
        if (!isReduced) scatter.set(withSpring(0, INTRO_SPRING));
      }
      const t = elapsed.get() + dt;
      elapsed.set(t);
      // Reduced motion has no pull together to wait for: the still mark can leave at once.
      if (t < INTRO_MS && !isReduced) return;
      stage.set(STAGE_WAIT);
      // Ready during the intro: leave from the still mark, no beat.
      if (!readySV.get()) {
        beating.set(true);
        clock.set(0);
        progress.set(0);
      }
    }

    const now = stage.get();
    if (beating.get()) {
      const cycle = isReduced ? REDUCED_CYCLE_MS : Math.max(period.get(), 1);
      const p = clock.get();
      let next = p + dt / cycle;
      if (now === STAGE_EXIT && !isReduced) {
        // On the way out, finish the beat in progress but never start another.
        next = p >= KEY_REST ? p : Math.min(next, KEY_REST);
      } else if (next >= 1) {
        next -= Math.floor(next);
      }
      clock.set(next);
      progress.set(isReduced ? next : Math.min(next, KEY_REST));
    }

    if (now !== STAGE_WAIT || !readySV.get()) return;

    // Leave.
    stage.set(STAGE_EXIT);
    scheduleOnRN(setLeaving, true);
    const done = (finished?: boolean) => {
      'worklet';
      if (!finished) return;
      stage.set(STAGE_DONE);
      scheduleOnRN(finish);
    };
    if (isReduced) {
      const plainFade = { duration: REDUCED_EXIT_MS, easing: easeStandard, reduceMotion: ReduceMotion.Never };
      bgOpacity.set(withTiming(0, plainFade));
      markOpacity.set(withTiming(0, plainFade, done));
      return;
    }
    move.set(withSpring(1, { ...springs.soft, reduceMotion: ReduceMotion.Never }));
    bgOpacity.set(withTiming(0, { duration: EXIT_MS, easing: easeStandard, reduceMotion: ReduceMotion.Never }));
    markOpacity.set(
      withDelay(
        EXIT_MARK_FADE_DELAY,
        withTiming(
          0,
          { duration: EXIT_MS - EXIT_MARK_FADE_DELAY, easing: easeIn, reduceMotion: ReduceMotion.Never },
          done,
        ),
        ReduceMotion.Never,
      ),
    );
  });

  const pose = useDerivedValue(() => {
    if (reduced.get()) return restPose(beating.get() ? reducedOpacity(progress.get()) : 1);
    const beat = beatFrame(progress.get(), {
      innerPull: innerPull.get(),
      outerPull: outerPull.get(),
      innerFade: innerFade.get(),
    });
    const amount = scatter.get();
    return amount > 0.0005 ? scatterPose(addScatter(beat, INTRO_FROM, amount)) : beatPose(beat);
  });

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.get() }));
  const markStyle = useAnimatedStyle(() => {
    const m = move.get();
    const t = target.get();
    const b = box.get();
    const dx = t.centred ? 0 : (t.x - b.width / 2) * m;
    const dy = t.centred ? 0 : (t.y - b.height / 2) * m;
    return {
      opacity: markOpacity.get(),
      transform: [{ translateX: dx }, { translateY: dy }, { scale: 1 + (t.scale - 1) * m }],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={leaving ? 'none' : 'auto'} onLayout={onLayout}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, bgStyle]} />
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Animated.View
          style={markStyle}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading"
        >
          <MarkCanvas size={SPLASH_MARK_SIZE} bleed={BLEED} color={colors.gold} pose={pose} />
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
