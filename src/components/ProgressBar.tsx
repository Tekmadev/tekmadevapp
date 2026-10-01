import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springs, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { Text } from './Text';
import { percentLabel, toFraction } from './parts/logic';

export type ProgressBarProps = {
  /** 0 to 1. Missing or broken values show an empty bar, never a guess. */
  value: number | null | undefined;
  tone?: 'gold' | 'ok';
  /** Text above the bar on the left ("Onboarding"); the percent shows on the right. */
  label?: string;
  /** Show the percent next to the label (default true when there is a label). */
  showPercent?: boolean;
  /** Bar thickness (default 6dp). */
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A rounded track whose fill springs to the value. Reads as a progress bar in TalkBack. */
export function ProgressBar({ value, tone = 'gold', label, showPercent, height = 6, style, testID }: ProgressBarProps) {
  const { colors, tones } = useTheme();
  const reduceMotion = useReduceMotion();
  const fraction = toFraction(value);
  const [width, setWidth] = useState(0);

  const fill = useSharedValue(reduceMotion ? fraction : 0);
  useEffect(() => {
    fill.set(reduceMotion ? fraction : withSpring(fraction, springs.soft));
  }, [fraction, fill, reduceMotion]);

  // A full-width fill slid in from the left: no layout pass per frame, and the
  // rounded end keeps its shape (scaleX would squash it). The track clips the rest.
  const fillStyle = useAnimatedStyle(() => ({
    opacity: width > 0 ? 1 : 0,
    transform: [{ translateX: (fill.get() - 1) * width }],
  }));
  const percent = percentLabel(fraction * 100);
  const withPercent = showPercent ?? Boolean(label);

  return (
    <View
      testID={testID}
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100), text: percent }}
    >
      {label || withPercent ? (
        <View style={styles.labels}>
          {label ? (
            <Text variant="label" color="ink2" numberOfLines={1} style={styles.label}>
              {label}
            </Text>
          ) : (
            <View />
          )}
          {withPercent ? (
            <Text variant="label" color="ink3" tabular>
              {percent}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.track, { height, backgroundColor: colors.line, borderRadius: radius.pill }]}
      >
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: tone === 'ok' ? tones.ok.dot : colors.gold, borderRadius: radius.pill },
            fillStyle,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space[2], gap: space[3] },
  label: { flex: 1 },
  track: { overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFill },
});
