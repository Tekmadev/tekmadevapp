import { memo, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { durations } from '@/design/motion';
import { space } from '@/design/tokens';

import { BlackHole } from './BlackHole';
import { useLoaderSettings } from './settings';

export type PageLoaderProps = {
  /** Default 72dp. */
  size?: number;
  /** Override the `showAfterMs` delay (stays invisible this long, then fades in over 250ms). */
  delayMs?: number;
  /** Optional caption under the mark (e.g. "Pulling from Meta"). */
  label?: string;
};

/** CSS `ease-out`, the website's loader fade. */
const easeOut = Easing.bezier(0, 0, 0.58, 1);

/**
 * The full-area loader: the black hole, gold, centred in whatever space it fills.
 * It stays invisible for `showAfterMs` (or `delayMs`), then fades in over 250ms,
 * so fast loads never flash it. The beat runs from mount, like the website's,
 * so it is mid beat (never frozen) when it appears.
 *
 * The fade is opacity only, so it also runs with "Remove animations" on; the
 * mark itself switches to its reduced motion pulse.
 */
export const PageLoader = memo(function PageLoader({ size = 72, delayMs, label }: PageLoaderProps) {
  const { showAfterMs } = useLoaderSettings();
  // Read once at mount: a settings change while it is showing must not hide it again.
  const [delay] = useState(() => Math.max(0, delayMs ?? showAfterMs));
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(
      withDelay(
        delay,
        withTiming(1, { duration: durations.loaderFadeIn, easing: easeOut, reduceMotion: ReduceMotion.Never }),
        ReduceMotion.Never,
      ),
    );
  }, [delay, opacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      style={[styles.fill, fadeStyle]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
    >
      <BlackHole size={size} />
      {label ? (
        <Text variant="label" color="ink3" align="center" style={styles.label}>
          {label}
        </Text>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[4] },
  label: { marginTop: space[4] },
});
