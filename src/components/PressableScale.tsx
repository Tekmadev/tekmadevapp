import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptics } from '@/design/haptics';
import { PRESS_SCALE, springs } from '@/design/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Scale while pressed (default 0.97). Use 1 to disable. */
  pressedScale?: number;
  /** Light impact on press (default true). */
  haptic?: boolean;
};

/**
 * Press feedback for everything tappable: scale to 0.97 on the snappy spring,
 * plus a light haptic. Keeps a 48dp minimum touch target via hitSlop when small.
 */
export function PressableScale({
  style,
  children,
  pressedScale = PRESS_SCALE,
  haptic = true,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withSpring(pressedScale, springs.snappy));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, springs.snappy));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) haptics.light();
        onPress?.(e);
      }}
      style={[style, animated]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
