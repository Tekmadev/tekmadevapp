import { useEffect, useState } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { springs } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, withAlpha } from '@/design/tokens';
import { useLatestCallback } from '@/lib/useLatestCallback';

import { Field } from './Field';
import { indexAtRatio, indexOfValue, stepCount, stepDecimals, valueAtIndex } from './sliderMath';
import { throttle } from './throttle';

export type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Default 1. Values are always whole steps from min. */
  step?: number;
  /** Live while dragging (throttled), and once per keyboard or TalkBack step. */
  onChange?: (value: number) => void;
  /** When the finger lifts (or after a TalkBack step): the moment to save. */
  onChangeEnd?: (value: number) => void;
  /** The live value text: (v) => `${v.toFixed(2)}s` shows "1.60s". Defaults to the number at the step's decimals. */
  format?: (value: number) => string;
  help?: string | null;
  error?: string | null;
  disabled?: boolean;
  /** Minimum time between live onChange calls (default 48ms, about 3 frames). */
  throttleMs?: number;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const THUMB = 24;
const HALO = 44;
const TRACK_H = 4;
/** Above this many steps the thumb follows the finger freely; below it, it snaps to each step. */
const CONTINUOUS_ABOVE = 24;
/** Step dots are drawn when there are this few steps. */
const MAX_TICKS = 12;

const clamp01 = (n: number) => {
  'worklet';
  return Math.min(1, Math.max(0, n));
};

/**
 * Custom slider: track, gold fill and a 24dp thumb in a 48dp touch area. The
 * pan runs on the UI thread; each step change crosses to JS once (a tick
 * haptic, the live value, a throttled onChange). Tap anywhere on the track to
 * jump there. TalkBack sees one adjustable control with increment/decrement.
 *
 *   <Slider label="Beat" value={beat} min={0.6} max={3} step={0.05} format={(v) => `${v.toFixed(2)}s`}
 *     onChange={setBeat} onChangeEnd={save} help="How long one pull takes." />
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onChangeEnd,
  format,
  help,
  error,
  disabled = false,
  throttleMs = 48,
  accessibilityHint,
  style,
  testID,
}: SliderProps) {
  const { colors, isDark } = useTheme();
  const count = stepCount(min, max, step);
  const index = indexOfValue(value, min, max, step);
  const continuous = count > CONTINUOUS_ABOVE;

  // The step under the finger while dragging; null when at rest (the value prop rules).
  const [liveIndex, setLiveIndex] = useState<number | null>(null);
  // Bumped after every drag so the thumb settles back onto `value` if the parent did not take the new one.
  const [settleCount, setSettleCount] = useState(0);

  const width = useSharedValue(0);
  const pos = useSharedValue(count > 0 ? index / count : 0);
  const lastIndex = useSharedValue(index);
  const dragging = useSharedValue(false);
  const pressed = useSharedValue(0);

  useEffect(() => {
    if (dragging.get()) return;
    lastIndex.set(index);
    pos.set(withSpring(count > 0 ? index / count : 0, springs.snappy));
  }, [index, count, settleCount, dragging, lastIndex, pos]);

  // Callbacks change every render; the throttle is made once and calls the newest.
  const emitChange = useLatestCallback((v: number) => onChange?.(v));
  const [emit] = useState(() => throttle(emitChange, throttleMs));
  useEffect(() => () => emit.cancel(), [emit]);

  const valueOf = (i: number) => valueAtIndex(i, min, max, step);
  const text = (v: number) => (format ? format(v) : v.toFixed(stepDecimals(step)));

  const onStep = (i: number) => {
    haptics.tick();
    setLiveIndex(i);
    emit(valueOf(i));
  };

  const onRelease = (i: number) => {
    emit.flush();
    setLiveIndex(null);
    setSettleCount((n) => n + 1);
    onChangeEnd?.(valueOf(i));
  };

  // Moves to the step at x (in the touch area's coordinates); crosses to JS only when the step changes.
  const moveTo = (x: number, animate: boolean) => {
    'worklet';
    const travel = width.get() - THUMB;
    const ratio = travel > 0 ? clamp01((x - THUMB / 2) / travel) : 0;
    const i = indexAtRatio(ratio, count);
    const target = count > 0 ? i / count : 0;
    if (continuous && !animate) pos.set(ratio);
    else if (i !== lastIndex.get() || animate) pos.set(withSpring(target, springs.snappy));
    if (i !== lastIndex.get()) {
      lastIndex.set(i);
      scheduleOnRN(onStep, i);
    }
  };

  const pan = Gesture.Pan()
    .enabled(!disabled && count > 0)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      'worklet';
      pressed.set(withSpring(1, springs.snappy));
    })
    .onStart((e) => {
      'worklet';
      dragging.set(true);
      moveTo(e.x, false);
    })
    .onUpdate((e) => {
      'worklet';
      moveTo(e.x, false);
    })
    .onEnd(() => {
      'worklet';
      scheduleOnRN(onRelease, lastIndex.get());
    })
    .onFinalize(() => {
      'worklet';
      dragging.set(false);
      pressed.set(withSpring(0, springs.snappy));
      if (count > 0) pos.set(withSpring(lastIndex.get() / count, springs.snappy));
    });

  const tap = Gesture.Tap()
    .enabled(!disabled && count > 0)
    .maxDistance(10)
    .onEnd((e, success) => {
      'worklet';
      if (!success) return;
      moveTo(e.x, true);
      scheduleOnRN(onRelease, lastIndex.get());
    });

  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: clamp01(pos.get()) * Math.max(0, width.get() - THUMB) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: clamp01(pos.get()) * Math.max(0, width.get() - THUMB),
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: clamp01(pressed.get()),
    transform: [{ scale: 0.5 + 0.5 * pressed.get() }],
  }));

  // TalkBack: one step per swipe up or down.
  const nudge = (delta: number) => {
    const i = Math.min(count, Math.max(0, index + delta));
    if (i === index) return;
    haptics.tick();
    const v = valueOf(i);
    onChange?.(v);
    onChangeEnd?.(v);
  };
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') nudge(1);
    else if (e.nativeEvent.actionName === 'decrement') nudge(-1);
  };

  const shownIndex = liveIndex ?? index;
  const shownValue = liveIndex == null ? value : valueOf(liveIndex);
  const thumbFace = isDark ? colors.ink : colors.surface;
  const ticks = count > 0 && count <= MAX_TICKS ? Array.from({ length: count + 1 }, (_, i) => i) : [];

  return (
    <Field
      label={label}
      labelAccessory={
        <Text variant="bodyStrong" tone="gold" tabular>
          {text(shownValue)}
        </Text>
      }
      help={help}
      error={error}
      disabled={disabled}
      visualLabel
      inset="none"
      style={style}
    >
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint={error ?? accessibilityHint ?? help ?? undefined}
        // Android reads min/max/now as whole numbers, so they are step indexes; the text is what is spoken.
        accessibilityValue={{ min: 0, max: Math.max(count, 1), now: index, text: text(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        accessibilityState={{ disabled }}
        onAccessibilityAction={disabled ? undefined : onAccessibilityAction}
        testID={testID}
      >
        <GestureDetector gesture={gesture}>
          <Animated.View style={styles.area} onLayout={(e) => width.set(e.nativeEvent.layout.width)}>
            <View style={[styles.track, { backgroundColor: colors.lineStrong }]} />
            <Animated.View style={[styles.fill, { backgroundColor: colors.gold }, fillStyle]} />
            {ticks.length > 0 ? (
              <View style={styles.ticks} pointerEvents="none">
                {ticks.map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.tick,
                      { left: `${(i / count) * 100}%`, backgroundColor: i <= shownIndex ? thumbFace : colors.ink5 },
                    ]}
                  />
                ))}
              </View>
            ) : null}
            <Animated.View style={[styles.thumbSlot, thumbStyle]} pointerEvents="none">
              <Animated.View style={[styles.halo, { backgroundColor: withAlpha(colors.gold, 0.18) }, haloStyle]} />
              <View style={[styles.thumb, { backgroundColor: colors.gold, borderColor: thumbFace, shadowColor: colors.shadow }]} />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Field>
  );
}

const TRACK_TOP = (layout.minTouch - TRACK_H) / 2;

const styles = StyleSheet.create({
  area: {
    height: layout.minTouch,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    top: TRACK_TOP,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
  },
  fill: {
    position: 'absolute',
    left: THUMB / 2,
    top: TRACK_TOP,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
  },
  ticks: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    top: TRACK_TOP,
    height: TRACK_H,
  },
  tick: {
    position: 'absolute',
    top: 0,
    width: TRACK_H,
    height: TRACK_H,
    marginLeft: -TRACK_H / 2,
    borderRadius: TRACK_H / 2,
  },
  thumbSlot: {
    position: 'absolute',
    left: 0,
    top: (layout.minTouch - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
