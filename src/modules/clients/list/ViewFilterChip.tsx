import { X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import type { ClientsViewInfo } from './views';

/**
 * The quick filter a Home card applied, said in words, with an X to drop it.
 * Gold like a selected chip, so it reads as "this is on".
 */
export function ViewFilterChip({ info, onClear }: { info: ClientsViewInfo; onClear: () => void }) {
  const { colors, isDark } = useTheme();
  const text = isDark ? colors.goldMid : colors.goldDeep;
  return (
    <View style={styles.wrap}>
      <PressableScale
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${info.spoken}`}
        accessibilityHint="Removes this filter"
        hitSlop={{ top: 6, bottom: 6 }}
        style={[styles.chip, { backgroundColor: colors.goldTint, borderColor: colors.gold }]}
      >
        <Text variant="label" weight="600" numberOfLines={2} style={[styles.label, { color: text }]}>
          {info.label}
        </Text>
        <Icon icon={X} size={16} rawColor={text} strokeWidth={2.25} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row' },
  chip: {
    flexShrink: 1,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingLeft: space[4] - 2,
    paddingRight: space[3],
    paddingVertical: space[1] + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { flexShrink: 1 },
});
