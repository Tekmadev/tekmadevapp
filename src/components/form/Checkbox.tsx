import { Check, Minus } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { springs } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';

export type CheckState = boolean | 'mixed';

const BOX = 22;

/** The square itself: gold fill with a check when on, a dash when mixed. Purely visual. */
export function CheckboxBox({ checked }: { checked: CheckState }) {
  const { colors, isDark } = useTheme();
  const on = checked !== false;
  const fill = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    fill.set(withSpring(on ? 1 : 0, springs.snappy));
  }, [on, fill]);

  const fillStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, fill.get())),
    transform: [{ scale: 0.6 + 0.4 * fill.get() }],
  }));

  // Ink on gold reads in both schemes: the page colour in dark, white in light.
  const mark = isDark ? colors.bg : colors.surface;
  return (
    <View
      style={[styles.box, { borderColor: on ? colors.gold : colors.ink4 }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Animated.View style={[styles.fill, { backgroundColor: colors.gold }, fillStyle]}>
        {on ? <Icon icon={checked === 'mixed' ? Minus : Check} size={16} strokeWidth={3} rawColor={mark} /> : null}
      </Animated.View>
    </View>
  );
}

export type CheckboxProps = {
  checked: CheckState;
  /** Called with the next state; a mixed box turns on. */
  onChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  /** Needed when there is no visible label. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Rounded square checkbox with an optional label and description; the whole row toggles. */
export function Checkbox({ checked, onChange, label, description, disabled = false, accessibilityLabel, style, testID }: CheckboxProps) {
  return (
    <PressableScale
      haptic={false}
      pressedScale={label ? 0.99 : 0.92}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onChange(checked !== true);
      }}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={description}
      accessibilityState={{ checked, disabled }}
      testID={testID}
      style={[label ? styles.row : styles.standalone, disabled ? styles.disabled : null, style]}
    >
      <View style={label && description ? styles.boxTop : null}>
        <CheckboxBox checked={checked} />
      </View>
      {label ? (
        <View style={styles.text}>
          <Text variant="body">{label}</Text>
          {description ? (
            <Text variant="small" color="ink3">
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: layout.minTouch,
    paddingVertical: space[2],
  },
  boxTop: {
    alignSelf: 'flex-start',
    paddingTop: 1,
  },
  standalone: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  disabled: {
    opacity: 0.4,
  },
});
