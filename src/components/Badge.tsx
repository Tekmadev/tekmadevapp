import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { radius, space, type Tone } from '@/design/tokens';

import { Icon } from './Icon';
import { Text } from './Text';

export type BadgeProps = {
  /** Always text, so colour is never the only signal ("Paid", "Overdue"). */
  label: string;
  tone?: Tone;
  /** A small status dot before the label. */
  dot?: boolean;
  icon?: LucideIcon;
  /** sm (default) for rows and cards, md for detail headers. */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A small status pill: the tone's tinted background with its text colour. */
export function Badge({ label, tone = 'neutral', dot = false, icon, size = 'sm', style, testID }: BadgeProps) {
  const { tones } = useTheme();
  const t = tones[tone];
  const md = size === 'md';
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.badge, md ? styles.md : styles.sm, { backgroundColor: t.bg }, style]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: t.dot }]} /> : null}
      {icon ? <Icon icon={icon} size={md ? 14 : 12} tone={tone} strokeWidth={2} /> : null}
      <Text variant={md ? 'label' : 'caption'} tone={tone} weight="600" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    gap: space[1],
  },
  sm: { minHeight: 22, paddingHorizontal: space[2] },
  md: { minHeight: 28, paddingHorizontal: space[3] },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
