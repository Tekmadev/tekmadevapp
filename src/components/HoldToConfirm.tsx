import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MESSAGES } from '@/api/errors';
import { haptics } from '@/design/haptics';
import { durations, springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { ButtonSpinner } from '@/loader/ButtonSpinner';

import { spinnerSizeFor } from './Button';
import { PressableScale } from './PressableScale';
import { reportSubmitError, useSubmitGroup, type SubmitGroupHandle } from './SubmitGroup';
import { Text } from './Text';

export type HoldTone = 'signal' | 'ink';

export type HoldToConfirmProps = {
  /** Says what holding does: "Hold to move to trash". */
  label: string;
  /** Runs when the hold completes. Pending (spinner) until the promise settles. */
  onConfirm: () => Promise<unknown> | unknown;
  /** Next to the spinner while onConfirm runs. Defaults to the label without "Hold to". */
  pendingLabel?: string;
  /** signal for destructive actions (default), ink for irreversible but not destructive ones. */
  tone?: HoldTone;
  disabled?: boolean;
  /** Disabled offline with the hint "You are offline" (default true). */
  requiresNetwork?: boolean;
  offlineHint?: boolean;
  group?: SubmitGroupHandle;
  /** Own the failure; without it the API's message is shown as a notice. */
  onError?: (error: unknown) => void;
  /** What TalkBack reads. Defaults to the label without "Hold to" ("Move to trash"). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Haptic ticks while holding: about one every 150ms. */
const TICKS = Math.round(durations.holdToConfirm / 150);
const HOLD_CLOCK = { duration: durations.holdToConfirm, easing: Easing.linear, reduceMotion: ReduceMotion.Never };
/** The fill eases in and out over the same 1.2s. */
const FILL_EASED = { ...HOLD_CLOCK, easing: Easing.bezier(0.45, 0, 0.55, 1) };
/** The finger may drift this far before the hold cancels. */
const HOLD_SLOP = 24;
const PRESSED_SCALE = 0.98;
/** After success, how long the full fill stays before it resets. */
const RESET_DELAY = 450;
const SPINNER = spinnerSizeFor('button');

/** "Hold to move to trash" -> "Move to trash". */
export function holdActionName(label: string): string {
  const rest = label.replace(/^hold to\s+/i, '').trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : label;
}

function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (alive) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

/**
 * Destructive or irreversible actions, inside a sheet that says exactly what
 * will happen (see ConfirmSheet). Press and hold for 1.2s: a fill sweeps
 * across with haptic ticks and the label turns to read on the fill; letting go
 * early springs it back. Completing fires the warning haptic and onConfirm.
 *
 * With TalkBack on, holding is impractical, so it becomes a plain button
 * ("Move to trash", hint "Double tap to confirm").
 */
export function HoldToConfirm({
  label,
  onConfirm,
  pendingLabel,
  tone = 'signal',
  disabled = false,
  requiresNetwork = true,
  offlineHint = true,
  group,
  onError,
  accessibilityLabel,
  style,
  testID,
}: HoldToConfirmProps) {
  const { colors, tones } = useTheme();
  const reduceMotion = useReduceMotion();
  const screenReader = useScreenReaderEnabled();
  const id = useId();
  const { pendingId, busy, run } = useSubmitGroup(group);
  const online = useIsOnline();
  const offline = requiresNetwork && !online;
  const pending = pendingId === id;
  const inert = disabled || offline || busy;

  const actionName = accessibilityLabel ?? holdActionName(label);
  const shownLabel = screenReader ? actionName : label;
  const busyLabel = pendingLabel ?? holdActionName(label);

  const base =
    tone === 'signal'
      ? { bg: tones.signal.bg, fg: colors.signal, border: colors.signal, fill: colors.signal }
      : { bg: tones.neutral.bg, fg: colors.ink, border: colors.lineStrong, fill: colors.ink };

  const progress = useSharedValue(0);
  // Linear time of the hold (0..1), separate from the eased fill, so ticks stay evenly spaced.
  const elapsed = useSharedValue(0);
  const pressed = useSharedValue(0);
  const holding = useSharedValue(false);
  const width = useSharedValue(0);

  const complete = useCallback(() => {
    haptics.warning();
    progress.set(1);
    const task = run(id, async () => onConfirm());
    const release = () => progress.set(withSpring(0, springs.default));
    if (!task) {
      // Another submit of the same group is already running.
      release();
      return;
    }
    task.then(
      // Done: the fill stays while a confirm sheet slides away, then resets if still on screen.
      () => progress.set(withDelay(RESET_DELAY, withSpring(0, springs.default))),
      (error: unknown) => {
        release();
        reportSubmitError(error, onError);
      },
    );
  }, [id, onConfirm, onError, progress, run]);

  // Reduced motion: same hold, plain linear fill.
  const fillTiming = reduceMotion ? HOLD_CLOCK : FILL_EASED;

  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(!inert && !screenReader)
        .minDuration(durations.holdToConfirm)
        .maxDistance(HOLD_SLOP)
        .shouldCancelWhenOutside(true)
        .onBegin(() => {
          'worklet';
          holding.set(true);
          pressed.set(withSpring(1, springs.snappy));
          progress.set(withTiming(1, fillTiming));
          elapsed.set(0);
          elapsed.set(withTiming(1, HOLD_CLOCK));
          scheduleOnRN(haptics.medium);
        })
        .onStart(() => {
          'worklet';
          if (!holding.get()) return;
          holding.set(false);
          scheduleOnRN(complete);
        })
        .onFinalize(() => {
          'worklet';
          pressed.set(withSpring(0, springs.snappy));
          if (!holding.get()) return;
          // Let go early: cancel and spring the fill back.
          holding.set(false);
          cancelAnimation(elapsed);
          progress.set(withSpring(0, springs.default));
        }),
    [complete, elapsed, fillTiming, holding, inert, pressed, progress, screenReader],
  );

  // A tick roughly every 150ms while the finger is down.
  useAnimatedReaction(
    () => (holding.get() ? Math.floor(elapsed.get() * TICKS) : -1),
    (step, previous) => {
      if (step > 0 && step < TICKS && previous != null && step > previous) scheduleOnRN(haptics.tick);
    },
  );

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - PRESSED_SCALE) * pressed.get() }],
  }));
  // The fill is a clip sliding in from the left; its copy of the label slides the
  // other way, so the label stays put and reads on the fill as it passes.
  const clipStyle = useAnimatedStyle(() => ({
    // Hidden at rest: before the first layout the width is 0 and the clip would cover everything.
    opacity: progress.get() > 0 ? 1 : 0,
    transform: [{ translateX: (progress.get() - 1) * width.get() }],
  }));
  const counterStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.get()) * width.get() }],
  }));

  const onLayout = (e: LayoutChangeEvent) => width.set(e.nativeEvent.layout.width);

  const row = (color: string, withSpinner: boolean) => (
    <View style={styles.row}>
      {pending ? (
        withSpinner ? (
          <ButtonSpinner size={SPINNER} color={color} />
        ) : (
          <View style={{ width: SPINNER, height: SPINNER }} />
        )
      ) : null}
      <Text variant="button" numberOfLines={1} style={{ color }}>
        {pending ? busyLabel : shownLabel}
      </Text>
    </View>
  );

  const face = (
    <Animated.View
      onLayout={onLayout}
      style={[styles.button, { backgroundColor: base.bg, borderColor: base.border }, pressStyle]}
    >
      {row(base.fg, false)}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, clipStyle]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: base.fill }]} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.centre, counterStyle]}>
          {row(colors.onInk, true)}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'activate' && !inert) complete();
  };

  return (
    <View style={[styles.wrap, inert && !pending ? styles.disabled : null, style]} testID={testID}>
      {screenReader ? (
        <PressableScale
          haptic={false}
          disabled={inert}
          onPress={complete}
          accessibilityRole="button"
          accessibilityLabel={pending ? busyLabel : actionName}
          accessibilityHint={offline ? MESSAGES.offline : 'Double tap to confirm'}
          accessibilityState={{ disabled: inert, busy: pending }}
        >
          {face}
        </PressableScale>
      ) : (
        <GestureDetector gesture={hold}>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={pending ? busyLabel : actionName}
            accessibilityHint={offline ? MESSAGES.offline : 'Press and hold to confirm'}
            accessibilityState={{ disabled: inert, busy: pending }}
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={onAction}
          >
            {face}
          </View>
        </GestureDetector>
      )}
      {offline && offlineHint ? (
        <Text variant="small" color="ink3" align="center" style={styles.hint}>
          {MESSAGES.offline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  button: {
    minHeight: 52,
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clip: { overflow: 'hidden' },
  centre: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[5] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  disabled: { opacity: 0.4 },
  hint: { marginTop: space[1] + 2 },
});
