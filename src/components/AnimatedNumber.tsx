import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { durations, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import type { Tone } from '@/design/tokens';
import { MAX_FONT_SCALE, tabular, type, type TypeVariant } from '@/design/typography';
import { cubicBezier } from '@/loader/keyframes';
import { formatCount } from '@/lib/format';

import { Text, type TextColor } from './Text';
import { buildCountFrames, longestFrame } from './parts/logic';

/** TextInput's native `text` prop is what the UI thread writes; it is not in the public props type. */
type CountTextProps = TextInputProps & { text?: string };

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export type AnimatedNumberProps = {
  value: number;
  /** Number to text (default "1,204"). Money: `(c) => formatCents(c)`. */
  format?: (value: number) => string;
  /** Default `kpi` (Geist 800, 40sp). */
  variant?: TypeVariant;
  color?: TextColor;
  tone?: Tone;
  align?: 'left' | 'right' | 'center';
  /** Count up from 0 on first mount (default false: the first value just shows). */
  countFromZero?: boolean;
  /** Round the in-between values (default true; cents are integers too). */
  integer?: boolean;
  duration?: number;
  /** What TalkBack reads (default: the formatted value). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

type Run = { from: number; to: number; frames: number };

/**
 * A number that counts from its previous value to the new one over 600ms
 * (cubic-bezier(0.2, 0, 0, 1)), in tabular figures, with no React render per
 * frame: the strings are formatted once on the JS thread and the UI thread
 * writes them into a read-only TextInput. At rest it is a plain <Text>, so the
 * number is pixel-identical to every other number in the app. Reduced motion
 * shows the final value straight away.
 */
export function AnimatedNumber({
  value,
  format = formatCount,
  variant = 'kpi',
  color,
  tone,
  align = 'left',
  countFromZero = false,
  integer = true,
  duration = durations.countUp,
  accessibilityLabel,
  style,
  textStyle,
  testID,
}: AnimatedNumberProps) {
  const { colors, tones } = useTheme();
  const reduceMotion = useReduceMotion();
  const finalText = format(value);

  // Counting from zero on mount starts on "0" straight away, so the final value never flashes first.
  const [initial] = useState(() => {
    const fromZero = countFromZero && !reduceMotion && Number.isFinite(value) && value !== 0;
    return { text: fromZero ? format(0) : finalText, ghost: fromZero ? finalText : null };
  });
  const frames = useSharedValue<string[]>([initial.text]);
  const frame = useSharedValue(0);
  // While counting: the widest frame, which sizes the box so no frame clips.
  const [countingGhost, setCountingGhost] = useState<string | null>(initial.ghost);

  const previous = useRef<number | null>(countFromZero ? 0 : null);
  const run = useRef<Run | null>(null);
  // The formatter and timing are read when a count starts; changing them alone never restarts one.
  const optionsRef = useRef({ format, duration, integer });
  useEffect(() => {
    optionsRef.current = { format, duration, integer };
  });

  useEffect(() => {
    let from = previous.current;
    previous.current = value;
    // Interrupted mid-count: continue from the number on screen, not the old target.
    const active = run.current;
    if (active) {
      const t = active.frames > 1 ? Math.min(frame.get() / (active.frames - 1), 1) : 1;
      from = active.from + (active.to - active.from) * cubicBezier(0.2, 0, 0, 1, t);
    }
    cancelAnimation(frame);
    const options = optionsRef.current;
    const list =
      from === null || reduceMotion || !Number.isFinite(from) || !Number.isFinite(value) || from === value
        ? null
        : buildCountFrames(from, value, options.format, options.duration, options.integer);
    if (!list) {
      run.current = null;
      frames.set([options.format(value)]);
      frame.set(0);
      setCountingGhost(null);
      return;
    }
    run.current = { from: from ?? value, to: value, frames: list.length };
    frames.set(list);
    frame.set(0);
    setCountingGhost(longestFrame(list));
    const finish = () => {
      run.current = null;
      setCountingGhost(null);
    };
    frame.set(
      withTiming(list.length - 1, { duration: options.duration, easing: Easing.linear }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(finish);
      }),
    );
    // Only a new value (or the motion setting) starts a count; the options are read from a ref.
  }, [value, reduceMotion, frame, frames]);

  const animatedProps = useAnimatedProps<CountTextProps>(() => {
    const list = frames.get();
    const i = Math.min(list.length - 1, Math.max(0, Math.round(frame.get())));
    return { text: list[i] ?? '' };
  });

  const counting = countingGhost !== null;
  const ink = tone ? tones[tone].text : colors[color ?? 'ink'];
  const textAlign = align;

  return (
    <View
      testID={testID}
      style={style}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? finalText}
    >
      <Text
        variant={variant}
        color={color}
        tone={tone}
        align={textAlign}
        tabular
        numberOfLines={1}
        style={[textStyle, counting ? styles.hidden : null]}
      >
        {counting ? countingGhost : finalText}
      </Text>
      <AnimatedTextInput
        animatedProps={animatedProps}
        defaultValue={initial.text}
        editable={false}
        caretHidden
        contextMenuHidden
        scrollEnabled={false}
        underlineColorAndroid="transparent"
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[
          type[variant],
          tabular,
          styles.input,
          { color: ink, textAlign },
          textStyle,
          counting ? null : styles.hidden,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  input: {
    ...StyleSheet.absoluteFill,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    includeFontPadding: false,
    textAlignVertical: 'top',
  },
});
