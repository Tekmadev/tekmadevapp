import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { springs } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { InlineLoader } from '@/loader/InlineLoader';

const TRACK_W = 52;
const TRACK_H = 32;
const THUMB = 24;
const INSET = (TRACK_H - THUMB) / 2;
const TRAVEL = TRACK_W - THUMB - INSET * 2;

type SwitchVisualProps = {
  value: boolean;
  pending?: boolean;
};

/** The track and thumb only (no touch handling, hidden from TalkBack). */
function SwitchVisual({ value, pending = false }: SwitchVisualProps) {
  const { colors, isDark } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.set(withSpring(value ? 1 : 0, springs.snappy));
  }, [value, progress]);

  const off = colors.ink5;
  const on = colors.gold;
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.min(1, Math.max(0, progress.get())), [0, 1], [off, on]),
  }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: INSET + TRAVEL * progress.get() }],
  }));

  const thumbColor = isDark ? colors.ink : colors.surface;
  return (
    <Animated.View
      style={[styles.track, track]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Animated.View style={[styles.thumbSlot, thumb]}>
        {pending ? (
          <InlineLoader size={16} color={thumbColor} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: thumbColor, shadowColor: colors.shadow }]} />
        )}
      </Animated.View>
    </Animated.View>
  );
}

export type SwitchProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** Saving: the thumb becomes the inline loader and taps are ignored. */
  pending?: boolean;
  /** Required when the switch stands alone (no SwitchRow label). */
  accessibilityLabel: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Custom animated switch: gold track when on, the thumb springs across. */
export function Switch({ value, onValueChange, disabled = false, pending = false, accessibilityLabel, accessibilityHint, style, testID }: SwitchProps) {
  const inactive = disabled || pending;
  return (
    <PressableScale
      haptic={false}
      disabled={inactive}
      onPress={() => {
        haptics.selection();
        onValueChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled, busy: pending }}
      testID={testID}
      style={[styles.standalone, disabled ? styles.disabled : null, style]}
    >
      <SwitchVisual value={value} pending={pending} />
    </PressableScale>
  );
}

export type SwitchRowProps = {
  label: string;
  /** A second line under the label (what the switch does). */
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Label, optional description and a switch; the whole row toggles. TalkBack
 * reads it as one switch with the label as its name and the description as its hint.
 */
export function SwitchRow({ label, description, value, onValueChange, disabled = false, pending = false, style, testID }: SwitchRowProps) {
  const inactive = disabled || pending;
  return (
    <PressableScale
      haptic={false}
      pressedScale={0.99}
      disabled={inactive}
      onPress={() => {
        haptics.selection();
        onValueChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled, busy: pending }}
      testID={testID}
      style={[styles.row, disabled ? styles.disabled : null, style]}
    >
      <View style={styles.rowText}>
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="small" color="ink3">
            {description}
          </Text>
        ) : null}
      </View>
      <SwitchVisual value={value} pending={pending} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
  },
  thumbSlot: {
    position: 'absolute',
    left: 0,
    top: INSET,
    width: THUMB,
    height: THUMB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  standalone: {
    minWidth: layout.minTouch,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    minHeight: 56,
    paddingVertical: space[2],
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  disabled: {
    opacity: 0.4,
  },
});
