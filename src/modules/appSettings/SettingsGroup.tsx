import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { enterPull } from '@/design/motion';
import { space } from '@/design/tokens';

type SettingsGroupProps = {
  title: string;
  icon: LucideIcon;
  /** Enter stagger position. */
  index: number;
  /** Rows edge to edge (ListRow) or padded content (switches, fields). */
  padded?: boolean;
  /** Shown above the card, under the heading (e.g. the update card). */
  above?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** A settings block: a small icon and eyebrow heading (like the More tab), then a card. */
export function SettingsGroup({ title, icon, index, padded = false, above, children, style }: SettingsGroupProps) {
  return (
    <Animated.View entering={enterPull(index)} style={[styles.block, style]}>
      <View style={styles.header} accessible accessibilityRole="header" accessibilityLabel={title}>
        <Icon icon={icon} size={14} color="ink3" />
        <Text variant="eyebrow">{title}</Text>
      </View>
      {above}
      <Card padded={padded} style={padded ? styles.paddedCard : null}>
        {children}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: space[6] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginBottom: space[2],
    paddingHorizontal: space[1],
  },
  paddedCard: { paddingVertical: space[2] },
});
