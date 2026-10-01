import type { LucideIcon } from 'lucide-react-native';
import { Plus } from 'lucide-react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { layout, radius, space, withAlpha } from '@/design/tokens';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { useFloatingBottom } from './TabBar';

export type FabProps = {
  onPress: () => void;
  onLongPress?: () => void;
  /** Required: what TalkBack reads ("Quick actions", "New client"). */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Default Plus. */
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const SIZE = 56;

/**
 * The gold + button, bottom right, floating 16dp above the tab bar (or above
 * the gesture area on pushed screens). Render it as a sibling after the Screen
 * so it stays put while the content scrolls.
 */
export function Fab({ onPress, onLongPress, accessibilityLabel, accessibilityHint, icon = Plus, style, testID }: FabProps) {
  const { colors, isDark } = useTheme();
  const bottom = useFloatingBottom() + space[4];
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={[
        styles.fab,
        {
          bottom,
          backgroundColor: colors.gold,
          boxShadow: [
            { offsetX: 0, offsetY: 8, blurRadius: 24, color: withAlpha(colors.shadow, isDark ? 0.5 : 0.2) },
            { offsetX: 0, offsetY: 1, blurRadius: 3, color: withAlpha(colors.shadow, isDark ? 0.4 : 0.1) },
          ],
        },
        style,
      ]}
    >
      <Icon icon={icon} size={26} color="onInk" strokeWidth={2.25} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: layout.gutter,
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
